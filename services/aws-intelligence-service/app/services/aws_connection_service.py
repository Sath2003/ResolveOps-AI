import boto3
import logging
from botocore.exceptions import ClientError, NoCredentialsError
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

class AWSConnectionService:
    @staticmethod
    def validate_credentials(
        auth_method: str,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        session_token: Optional[str] = None,
        role_arn: Optional[str] = None,
        external_id: Optional[str] = None,
        region: str = "us-east-1"
    ) -> Tuple[bool, Dict]:
        """
        Validates AWS credentials by making an STS GetCallerIdentity call.
        Returns a tuple of (success_boolean, result_data_or_error_dict).
        """
        try:
            if access_key_id: access_key_id = access_key_id.strip()
            if secret_access_key: secret_access_key = secret_access_key.strip()
            if session_token: session_token = session_token.strip()
            if region: region = region.strip()
            
            # Safe debug logging
            safe_ak = f"*{access_key_id[-4:]}" if access_key_id and len(access_key_id) >= 4 else "None"
            secret_len = len(secret_access_key) if secret_access_key else 0
            logger.info(f"Validating AWS connection. Access Key ID: {safe_ak}, Region: {region}, Session Token present: {bool(session_token)}, Secret Length: {secret_len}")

            if auth_method == "access_keys":
                if not access_key_id or not secret_access_key:
                    return False, {"error": "Access Key ID and Secret Access Key are required for access_keys method."}
                
                sts_client = boto3.client(
                    'sts',
                    aws_access_key_id=access_key_id,
                    aws_secret_access_key=secret_access_key,
                    aws_session_token=session_token,
                    region_name=region
                )
                
            elif auth_method == "role_arn":
                if not role_arn:
                    return False, {"error": "Role ARN is required for role_arn auth method."}
                
                # In production, this assumes the environment running the code has sts:AssumeRole permissions
                sts_client = boto3.client('sts', region_name=region)
                assume_kwargs = {
                    "RoleArn": role_arn,
                    "RoleSessionName": "NexusAIAWSDiscoverySession"
                }
                if external_id:
                    assume_kwargs["ExternalId"] = external_id
                    
                assumed_role = sts_client.assume_role(**assume_kwargs)
                credentials = assumed_role['Credentials']
                
                sts_client = boto3.client(
                    'sts',
                    aws_access_key_id=credentials['AccessKeyId'],
                    aws_secret_access_key=credentials['SecretAccessKey'],
                    aws_session_token=credentials['SessionToken'],
                    region_name=region
                )
            else:
                return False, {"error": "Unknown authentication method."}

            # Verify connection by getting caller identity
            identity = sts_client.get_caller_identity()
            
            return True, {
                "account_id": identity.get("Account"),
                "arn": identity.get("Arn"),
                "user_id": identity.get("UserId"),
                "status": "connected"
            }
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_msg = e.response.get('Error', {}).get('Message', str(e))
            logger.error(f"AWS STS validation failed: {error_code}")
            
            if error_code == "SignatureDoesNotMatch":
                return False, {
                    "error": "Authentication failed. Please verify your credentials and permissions.",
                    "details": "The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method.",
                    "code": error_code
                }
            elif error_code == "InvalidClientTokenId":
                return False, {
                    "error": "Authentication failed. The Access Key ID is invalid.",
                    "details": "The security token included in the request is invalid.",
                    "code": error_code
                }
            elif error_code == "ExpiredToken":
                return False, {
                    "error": "Authentication failed. Temporary credentials expired.",
                    "details": "The session token provided has expired or is invalid.",
                    "code": error_code
                }
            elif error_code == "AccessDenied":
                return False, {
                    "error": "Authentication failed. Access Denied.",
                    "details": "The IAM user or role lacks permissions to perform STS operations.",
                    "code": error_code
                }
                
            return False, {
                "error": "Authentication failed. Please verify your credentials and permissions.",
                "details": error_msg,
                "code": error_code
            }
        except NoCredentialsError:
            return False, {"error": "No AWS credentials could be found in the environment for AssumeRole."}
        except Exception as e:
            logger.error(f"Unexpected error validating AWS connection: {e}")
            return False, {"error": "An unexpected error occurred during connection validation."}
