from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from app.services.aws_connection_service import AWSConnectionService

router = APIRouter(prefix="/api/v1/aws", tags=["AWS Connection"])

class AWSConnectRequest(BaseModel):
    connection_name: str = Field(default="AWS Connection", description="A friendly name for this connection")
    auth_method: Optional[str] = Field(default=None, description="'role_arn' or 'access_keys'. Auto-detected if omitted.")
    role_arn: Optional[str] = None
    external_id: Optional[str] = None
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    session_token: Optional[str] = None
    default_region: Optional[str] = Field(default=None)
    region: Optional[str] = Field(default=None, description="Alias for default_region")
    regions: Optional[List[str]] = Field(default=None, description="Alias for enabled_regions")
    enabled_regions: List[str] = Field(default_factory=lambda: ["us-east-1"])

    @model_validator(mode="after")
    def normalize_fields(self):
        # Support 'region' as alias for 'default_region'
        if not self.default_region and self.region:
            self.default_region = self.region
        if not self.default_region:
            self.default_region = "us-east-1"
        # Support 'regions' as alias for 'enabled_regions'
        if self.regions and len(self.regions) > 0:
            self.enabled_regions = self.regions
        # Auto-detect auth_method if not provided
        if not self.auth_method:
            if self.access_key_id and self.secret_access_key:
                self.auth_method = "access_keys"
            elif self.role_arn:
                self.auth_method = "role_arn"
            else:
                self.auth_method = "environment"
        return self

@router.post("/connect")
def connect_aws_account(payload: AWSConnectRequest = Body(...)):
    """
    Validates the provided AWS credentials and initializes the connection.
    Does NOT store or log the secret access keys.
    """
    success, result = AWSConnectionService.validate_credentials(
        auth_method=payload.auth_method,
        access_key_id=payload.access_key_id,
        secret_access_key=payload.secret_access_key,
        session_token=payload.session_token,
        role_arn=payload.role_arn,
        external_id=payload.external_id,
        region=payload.default_region
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=result)

    account_id = result.get("account_id")

    return {
        "message": "AWS connection validated successfully.",
        "account_id": account_id,
        "connection_details": {
            "name": payload.connection_name,
            "account_id": account_id,
            "auth_method": payload.auth_method,
            "default_region": payload.default_region,
            "enabled_regions": payload.enabled_regions,
            "status": "connected"
        }
    }

@router.get("/status")
def get_aws_status():
    """
    Returns the current connection status of the AWS intelligence module.
    Automatically resolves credentials from environment variables or EC2 metadata.
    """
    import boto3
    import os
    from botocore.exceptions import ClientError, NoCredentialsError
    
    try:
        region = os.getenv("AWS_DEFAULT_REGION", os.getenv("AWS_REGION", "us-east-1"))
        sts = boto3.client('sts', region_name=region)
        identity = sts.get_caller_identity()
        
        return {
            "status": "connected",
            "message": "AWS connection validated successfully.",
            "connection_details": {
                "name": "Auto-Discovered AWS Environment",
                "account_id": identity.get("Account"),
                "arn": identity.get("Arn"),
                "auth_method": "environment",
                "default_region": region,
                "enabled_regions": os.getenv("AWS_ENABLED_REGIONS", region).split(",")
            }
        }
    except (ClientError, NoCredentialsError) as e:
        return {
            "status": "disconnected",
            "message": f"No active AWS connection found. Details: {str(e)}"
        }
    except Exception as e:
        return {
            "status": "disconnected",
            "message": f"Unexpected error checking AWS status: {str(e)}"
        }
