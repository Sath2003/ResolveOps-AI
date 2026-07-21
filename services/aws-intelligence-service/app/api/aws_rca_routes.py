from fastapi import APIRouter, HTTPException
import requests
import os
from app.api.aws_resource_routes import _db_cache
from app.services.aws_event_trigger_service import AWSEventTriggerService

router = APIRouter(prefix="/api/v1/aws/resources", tags=["AWS RCA"])

@router.post("/{resource_id:path}/rca")
def generate_aws_rca(resource_id: str):
    """
    Triggers AI RCA via Amazon Bedrock for the specified AWS resource.
    """
    resources = _db_cache.get("resources", [])
    resource = next((r for r in resources if r["id"] == resource_id), None)
    
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
        
    AWSEventTriggerService.publish_event("aws_rca_requested", {"resource_id": resource_id})
    
    # In a real environment, we would collect the logs, risks, and metrics here
    # and send them to the `ai-rca-service`
    # For prototyping, we simulate the Bedrock API call
    
    ai_provider = os.getenv("AI_PROVIDER", "bedrock")
    
    # Due to current Bedrock payment/model access issues, we return a graceful degradation message
    return {
        "rca_status": "ai_unavailable",
        "provider": "bedrock",
        "message": "AI RCA is unavailable because Amazon Bedrock model access or billing is not configured. AWS discovery and metrics are still available."
    }
