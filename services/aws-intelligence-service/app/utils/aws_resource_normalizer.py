from datetime import datetime
from typing import Dict, Any

def normalize_aws_resource(
    account_id: str,
    region: str,
    resource_type: str,
    resource_name: str,
    arn: str,
    status: str,
    created_at: Any = None,
    tags: Dict = None,
    metadata: Dict = None
) -> Dict:
    """
    Standardizes any AWS resource into a consistent dictionary format for the frontend and RCA pipeline.
    """
    
    # Safely format created_at date
    if created_at and hasattr(created_at, "isoformat"):
        created_at_str = created_at.isoformat()
    else:
        created_at_str = str(created_at) if created_at else ""

    return {
        "id": arn,
        "provider": "aws",
        "account_id": account_id,
        "region": region,
        "resource_type": resource_type,
        "resource_name": resource_name,
        "arn": arn,
        "status": status,
        "created_at": created_at_str,
        "tags": tags or {},
        "risk_level": "info", # Determined by risk service later
        "cost_status": "available", # Updated by cost service later
        "metadata": metadata or {}
    }
