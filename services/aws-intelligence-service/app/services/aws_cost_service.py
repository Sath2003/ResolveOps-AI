import boto3
import logging
from typing import Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class AWSCostService:
    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def get_resource_cost(self, resource: Dict) -> Dict:
        """
        Fetches the actual billed cost and estimated running price for a resource.
        """
        resource_arn = resource.get('arn', '')
        region = resource.get('region', 'us-east-1')
        
        result = {
            "actual_cost": {
                "status": "unavailable",
                "month_to_date": 0.0,
                "currency": "USD",
                "source": "AWS Cost Explorer",
                "last_updated": datetime.utcnow().isoformat(),
                "message": ""
            },
            "estimated_running_price": {
                "status": "unavailable",
                "hourly": 0.0,
                "daily": 0.0,
                "monthly": 0.0,
                "currency": "USD",
                "source": "AWS Pricing API",
                "confidence": "low",
                "warnings": []
            },
            "breakdown": []
        }

        try:
            ce = boto3.client('ce', **self.auth_kwargs)
            # Try to fetch month-to-date cost filtering by ARN
            now = datetime.utcnow()
            start = now.replace(day=1).strftime('%Y-%m-%d')
            end = now.strftime('%Y-%m-%d')
            
            # Note: Cost explorer requires a valid start and end date (end date > start date).
            if start == end:
                # If today is the 1st of the month
                end = (now + timedelta(days=1)).strftime('%Y-%m-%d')

            response = ce.get_cost_and_usage(
                TimePeriod={'Start': start, 'End': end},
                Granularity='MONTHLY',
                Metrics=['UnblendedCost'],
                Filter={
                    'Dimensions': {
                        'Key': 'RESOURCE_ID',
                        'Values': [resource_arn]
                    }
                }
            )
            
            total_cost = 0.0
            for r in response.get('ResultsByTime', []):
                total_cost += float(r['Total']['UnblendedCost']['Amount'])
                
            result['actual_cost']['status'] = "available"
            result['actual_cost']['month_to_date'] = round(total_cost, 2)

        except Exception as e:
            from botocore.exceptions import ClientError
            if isinstance(e, ClientError):
                error_code = e.response.get('Error', {}).get('Code', '')
                if error_code == 'AccessDeniedException':
                    result['actual_cost']['status'] = "permission_required"
                    result['actual_cost']['message'] = "Cost unavailable — AWS Cost Explorer permissions required."
            else:
                logger.error(f"Failed to fetch cost for {resource_arn}: {e}")

        # In a real scenario, we'd query the AWS Pricing API to populate 'estimated_running_price'
        # For this prototype we will use a heuristic fallback.
        res_type = resource.get("resource_type", "")
        if "EC2" in res_type and "Instance" in res_type:
            meta = resource.get("metadata", {})
            instance_type = meta.get("instance_type", "unknown")
            state = resource.get("status", "").lower()
            
            hourly_rate = 0.05
            if "t2.micro" in instance_type or "t3.micro" in instance_type:
                hourly_rate = 0.0116
            elif "t3.medium" in instance_type:
                hourly_rate = 0.0416
            elif "m5.large" in instance_type:
                hourly_rate = 0.096
                
            if state == "running":
                result['estimated_running_price'].update({
                    "status": "available",
                    "hourly": round(hourly_rate, 4),
                    "daily": round(hourly_rate * 24, 2),
                    "monthly": round(hourly_rate * 730, 2),
                    "confidence": "heuristic fallback",
                    "source": "Estimated based on Instance Type"
                })
            else:
                result['estimated_running_price'].update({
                    "status": "available",
                    "hourly": 0.0,
                    "daily": 0.0,
                    "monthly": 0.0,
                    "confidence": "heuristic fallback",
                    "source": "Estimated based on Instance Type",
                    "warnings": ["Instance is not running, compute cost is $0."]
                })
        
        return result
