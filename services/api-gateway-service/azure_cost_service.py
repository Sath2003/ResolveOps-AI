import datetime
import os
import json
import requests
from typing import Dict, Any, List
from azure.mgmt.costmanagement import CostManagementClient
from azure.mgmt.costmanagement.models import QueryDefinition, QueryDataset, QueryTimePeriod, QueryGrouping, QueryAggregation
from azure.core.exceptions import HttpResponseError
from datetime import timezone

# Simple in-memory cache. Note: Resets when container restarts.
_cost_cache = {}
CACHE_TTL_SECONDS = 900 # 15 minutes

def get_currency_symbol(currency_code: str) -> str:
    symbols = {
        "INR": "₹",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "AUD": "A$",
        "CAD": "C$"
    }
    return symbols.get(currency_code, currency_code + " ")

def get_cached_cost(cache_key: str) -> Any:
    if cache_key in _cost_cache:
        cached_time, data = _cost_cache[cache_key]
        if (datetime.datetime.now() - cached_time).total_seconds() < CACHE_TTL_SECONDS:
            return data
    return None

def set_cached_cost(cache_key: str, data: Any):
    _cost_cache[cache_key] = (datetime.datetime.now(), data)

def get_subscription_cost(credentials, subscription_id: str) -> Dict[str, Any]:
    """Fetches month-to-date actual cost for the subscription."""
    cache_key = f"sub_cost_{subscription_id}"
    cached = get_cached_cost(cache_key)
    if cached:
        return cached

    scope = f"/subscriptions/{subscription_id}"
    client = CostManagementClient(credential=credentials)
    
    # Time period: start of month to today
    now = datetime.datetime.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end_date = now + datetime.timedelta(days=1)
    
    try:
        query_result = client.query.usage(
            scope=scope,
            parameters=QueryDefinition(
                type="Usage",
                timeframe="Custom",
                time_period=QueryTimePeriod(
                    from_property=start_of_month,
                    to=end_date
                ),
                dataset=QueryDataset(
                    granularity="None",
                    aggregation={
                        "totalCost": QueryAggregation(name="PreTaxCost", function="Sum")
                    }
                )
            )
        )
        
        cost_value = 0.0
        currency = "INR" # Default fallback per requirement
        
        if query_result.rows and len(query_result.rows) > 0:
            row = query_result.rows[0]
            cost_value = float(row[0])
            if len(row) > 1 and row[1]:
                currency = str(row[1])

        result = {
            "currency": currency,
            "currency_symbol": get_currency_symbol(currency),
            "month_to_date_actual": round(cost_value, 2),
            "last_updated": datetime.datetime.now(timezone.utc).isoformat(),
            "status": "actual_available",
            "source": {"actual_cost": "Azure Cost Management API"},
            "limitations": []
        }
        
    except HttpResponseError as e:
        if e.status_code == 403:
            result = {
                "currency": "INR",
                "currency_symbol": get_currency_symbol("INR"),
                "month_to_date_actual": 0.0,
                "last_updated": datetime.datetime.now(timezone.utc).isoformat(),
                "status": "permission_required",
                "source": {},
                "limitations": ["Azure cost data could not be loaded. Assign Cost Management Reader permission to the NexusAI service principal at subscription scope."]
            }
        else:
            result = {
                "currency": "INR",
                "currency_symbol": get_currency_symbol("INR"),
                "month_to_date_actual": 0.0,
                "last_updated": datetime.datetime.now(timezone.utc).isoformat(),
                "status": "unavailable",
                "source": {},
                "limitations": [f"Failed to fetch cost: {str(e)}"]
            }
    except Exception as e:
        result = {
            "currency": "INR",
            "currency_symbol": get_currency_symbol("INR"),
            "month_to_date_actual": 0.0,
            "last_updated": datetime.datetime.now(timezone.utc).isoformat(),
            "status": "unavailable",
            "source": {},
            "limitations": [f"Error calculating cost: {str(e)}"]
        }
        
    set_cached_cost(cache_key, result)
    return result

def get_resource_group_cost(credentials, subscription_id: str) -> Dict[str, Dict[str, Any]]:
    """Fetches MTD actual cost grouped by resource group."""
    cache_key = f"rg_cost_{subscription_id}"
    cached = get_cached_cost(cache_key)
    if cached:
        return cached

    scope = f"/subscriptions/{subscription_id}"
    client = CostManagementClient(credential=credentials)
    
    now = datetime.datetime.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end_date = now + datetime.timedelta(days=1)
    
    rg_costs = {}
    
    try:
        query_result = client.query.usage(
            scope=scope,
            parameters=QueryDefinition(
                type="Usage",
                timeframe="Custom",
                time_period=QueryTimePeriod(
                    from_property=start_of_month,
                    to=end_date
                ),
                dataset=QueryDataset(
                    granularity="None",
                    aggregation={
                        "totalCost": QueryAggregation(name="PreTaxCost", function="Sum")
                    },
                    grouping=[
                        QueryGrouping(type="Dimension", name="ResourceGroup")
                    ]
                )
            )
        )
        
        if query_result.rows:
            for row in query_result.rows:
                cost_val = float(row[0])
                rg_name = str(row[2]) if len(row) > 2 else "Unknown"
                currency = str(row[1]) if len(row) > 1 else "INR"
                
                if rg_name != "Unknown":
                    rg_costs[rg_name.lower()] = {
                        "month_to_date_actual": round(cost_val, 2),
                        "currency": currency,
                        "currency_symbol": get_currency_symbol(currency)
                    }
                    
    except Exception:
        # Gracefully handle missing permissions or errors for RGs
        pass
        
    set_cached_cost(cache_key, rg_costs)
    return rg_costs

def get_actual_resource_cost(credentials, subscription_id: str, resource_id: str) -> Dict[str, Any]:
    """Fetches MTD actual cost for a specific resource."""
    cache_key = f"res_cost_{resource_id}"
    cached = get_cached_cost(cache_key)
    if cached:
        return cached

    scope = f"/subscriptions/{subscription_id}"
    client = CostManagementClient(credential=credentials)
    
    now = datetime.datetime.now()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end_date = now + datetime.timedelta(days=1)
    
    result = {
        "status": "unavailable",
        "month_to_date": 0.0,
        "currency": "INR",
        "source": "Azure Cost Management",
        "last_updated": datetime.datetime.now(timezone.utc).isoformat(),
        "message": ""
    }
    
    try:
        # Note: Cost management API limits resource-level queries. 
        # Using a filter by ResourceId.
        query_result = client.query.usage(
            scope=scope,
            parameters=QueryDefinition(
                type="Usage",
                timeframe="Custom",
                time_period=QueryTimePeriod(
                    from_property=start_of_month,
                    to=end_date
                ),
                dataset=QueryDataset(
                    granularity="None",
                    aggregation={
                        "totalCost": QueryAggregation(name="PreTaxCost", function="Sum")
                    },
                    filter={
                        "dimensions": {
                            "name": "ResourceId",
                            "operator": "In",
                            "values": [resource_id]
                        }
                    }
                )
            )
        )
        
        if query_result.rows and len(query_result.rows) > 0:
            row = query_result.rows[0]
            result["month_to_date"] = round(float(row[0]), 2)
            result["currency"] = str(row[1]) if len(row) > 1 else "INR"
            result["status"] = "available"
        else:
            # If no rows, we return 0 but mark available
            result["status"] = "available"
            
    except HttpResponseError as e:
        if e.status_code == 403:
            result["status"] = "permission_required"
            result["message"] = "Cost Management Reader permission required."
        else:
            result["message"] = f"Failed to fetch cost: {str(e)}"
    except Exception as e:
        result["message"] = f"Error: {str(e)}"

    set_cached_cost(cache_key, result)
    return result

def get_estimated_resource_price(resource_type: str, sku: str, location: str, currency: str = "INR") -> Dict[str, Any]:
    """Fetches estimated running price using Azure Retail Prices API. Formatted for the new UI."""
    result = {
        "status": "unavailable",
        "hourly": 0.0,
        "daily": 0.0,
        "monthly": 0.0,
        "currency": currency,
        "source": "Azure Retail Prices",
        "confidence": "low",
        "formula": "sku_price",
        "warnings": []
    }
    
    if not sku:
        result["warnings"].append("Estimated price unavailable without SKU.")
        return result
        
    cache_key = f"retail_price_{resource_type}_{sku}_{location}_{currency}"
    cached = get_cached_cost(cache_key)
    if cached:
        return cached
        
    api_url = f"https://prices.azure.com/api/retail/prices?currencyCode={currency}"
    sku_clean = sku.replace(" ", "")
    query_filter = f"armRegionName eq '{location}' and armSkuName eq '{sku_clean}' and priceType eq 'Consumption'"
    
    try:
        response = requests.get(f"{api_url}&$filter={query_filter}", timeout=5)
        response.raise_for_status()
        data = response.json()
        
        item = None
        confidence = "low"
        
        if data.get("Items") and len(data["Items"]) > 0:
            item = data["Items"][0]
            confidence = "high"
        else:
            # Fallback query
            query_filter_fallback = f"armRegionName eq '{location}' and skuName eq '{sku_clean}'"
            response_fb = requests.get(f"{api_url}&$filter={query_filter_fallback}", timeout=5)
            data_fb = response_fb.json()
            if data_fb.get("Items") and len(data_fb["Items"]) > 0:
                item = data_fb["Items"][0]
                confidence = "medium"
                
        if item:
            hourly_cost = item.get("retailPrice", 0.0)
            result.update({
                "status": "available",
                "hourly": round(hourly_cost, 4),
                "daily": round(hourly_cost * 24, 2),
                "monthly": round(hourly_cost * 730, 2),
                "confidence": confidence,
                "formula": "sku_price_per_hour",
                "warnings": ["Estimated running price is based on Azure Retail Prices and resource SKU/region. Actual billed cost may vary."]
            })
    except Exception as e:
        result["warnings"].append(f"Retail price fetch error: {str(e)}")
        
    set_cached_cost(cache_key, result)
    return result

def estimate_aks_cost(node_pools: List[Dict], location: str, currency: str = "INR") -> Dict[str, Any]:
    """Calculates AKS estimated running price using node pool VMs via Azure Retail Prices API."""
    result = {
        "status": "unavailable",
        "hourly": 0.0,
        "daily": 0.0,
        "monthly": 0.0,
        "currency": currency,
        "source": "Azure Retail Prices",
        "confidence": "high",
        "formula": "sum(node_pool_hourly_price * node_count)",
        "warnings": ["Cost is estimated from Azure Retail Prices API and may not match actual billed cost. AKS Node VM size is the main driver."]
    }
    
    breakdown = []
    total_hourly = 0.0
    
    api_url = f"https://prices.azure.com/api/retail/prices?currencyCode={currency}"
    
    for pool in node_pools:
        name = pool.get("name", "Unknown")
        vm_size = pool.get("vmSize", "")
        count = pool.get("count", 0)
        mode = pool.get("mode", "System")
        
        if not vm_size or count == 0:
            continue
            
        vm_clean = vm_size.replace(" ", "")
        
        # Virtual Machines API mapping for standard VMs
        query_filter = f"serviceName eq 'Virtual Machines' and armRegionName eq '{location}' and armSkuName eq '{vm_clean}' and priceType eq 'Consumption'"
        
        pool_item = {
            "component": "AKS Node Pool",
            "name": name,
            "mode": mode,
            "sku": vm_size,
            "region": location,
            "quantity": count,
            "unit_price": 0.0,
            "unit": "hour",
            "hourly_total": 0.0,
            "source": "Azure Retail Prices",
            "confidence": "low"
        }
        
        try:
            response = requests.get(f"{api_url}&$filter={query_filter}", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("Items") and len(data["Items"]) > 0:
                    item = data["Items"][0]
                    pool_item["unit_price"] = item.get("retailPrice", 0.0)
                    pool_item["hourly_total"] = pool_item["unit_price"] * count
                    pool_item["confidence"] = "high"
                    pool_item["meter_name"] = item.get("meterName", "")
                else:
                    # Fallback to skuName
                    fallback_filter = f"serviceName eq 'Virtual Machines' and armRegionName eq '{location}' and skuName eq '{vm_clean}'"
                    resp_fb = requests.get(f"{api_url}&$filter={fallback_filter}", timeout=5)
                    data_fb = resp_fb.json()
                    if data_fb.get("Items") and len(data_fb["Items"]) > 0:
                        item = data_fb["Items"][0]
                        pool_item["unit_price"] = item.get("retailPrice", 0.0)
                        pool_item["hourly_total"] = pool_item["unit_price"] * count
                        pool_item["confidence"] = "medium"
                        pool_item["meter_name"] = item.get("meterName", "")
                    else:
                        result["warnings"].append(f"SKU price match failed for pool {name} ({vm_size}).")
        except Exception as e:
            result["warnings"].append(f"Failed to fetch price for pool {name}: {str(e)}")
            
        breakdown.append(pool_item)
        total_hourly += pool_item["hourly_total"]
        
    if breakdown:
        result["status"] = "available"
        result["hourly"] = round(total_hourly, 4)
        result["daily"] = round(total_hourly * 24, 2)
        result["monthly"] = round(total_hourly * 730, 2)
        if any(b["confidence"] == "low" for b in breakdown):
            result["confidence"] = "low"
        elif any(b["confidence"] == "medium" for b in breakdown):
            result["confidence"] = "medium"
            
    return result, breakdown

def clear_cost_cache():
    global _cost_cache
    _cost_cache = {}

