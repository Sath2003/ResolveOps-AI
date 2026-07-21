import boto3
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class AWSRiskAnalysisService:
    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def analyze_resource(self, resource: Dict) -> List[Dict]:
        """
        Analyzes a single normalized resource and returns a list of identified risks.
        """
        risks = []
        res_type = resource.get('resource_type', '')
        metadata = resource.get('metadata', {})
        
        # General Status Check
        status = resource.get('status', '').lower()
        if status in ['stopped', 'failed', 'terminated', 'degraded', 'impaired']:
            risks.append({
                "id": f"risk-{resource['id']}-status",
                "severity": "high",
                "title": f"Resource {status.capitalize()}",
                "description": f"The resource is currently in a {status} state.",
                "recommendation": "Investigate the root cause in CloudWatch logs or instance health checks."
            })

        # EC2 Specific Risks
        if res_type == 'AWS::EC2::Instance':
            if metadata.get('public_ip'):
                risks.append({
                    "id": f"risk-{resource['id']}-public-ip",
                    "severity": "medium",
                    "title": "Public IP Attached",
                    "description": "EC2 instance has a public IP, exposing it to the internet.",
                    "recommendation": "Use a private subnet and ALB/NAT Gateway instead."
                })

        # S3 Specific Risks
        elif res_type == 'AWS::S3::Bucket':
            if metadata.get('public_access_block') != 'enabled':
                risks.append({
                    "id": f"risk-{resource['id']}-s3-public-access",
                    "severity": "high",
                    "title": "Public Access Block Disabled",
                    "description": "Bucket may be exposing objects to the public internet.",
                    "recommendation": "Enable Block Public Access at the bucket level."
                })
            if metadata.get('encryption') != 'enabled':
                risks.append({
                    "id": f"risk-{resource['id']}-s3-unencrypted",
                    "severity": "medium",
                    "title": "Encryption Disabled",
                    "description": "Bucket contents are not encrypted at rest.",
                    "recommendation": "Enable Default Encryption with SSE-S3 or KMS."
                })
            if metadata.get('versioning') != 'Enabled':
                risks.append({
                    "id": f"risk-{resource['id']}-s3-no-versioning",
                    "severity": "low",
                    "title": "Versioning Disabled",
                    "description": "Bucket is not protected against accidental deletion or overwrites.",
                    "recommendation": "Enable Bucket Versioning."
                })

        # RDS Specific Risks
        elif res_type == 'AWS::RDS::DBInstance':
            if metadata.get('publicly_accessible'):
                risks.append({
                    "id": f"risk-{resource['id']}-rds-public",
                    "severity": "critical",
                    "title": "Database is Publicly Accessible",
                    "description": "RDS instance allows public internet access.",
                    "recommendation": "Disable Publicly Accessible flag and restrict security groups."
                })

        # Security Group Specific Risks
        elif res_type == 'AWS::EC2::SecurityGroup':
            for perm in metadata.get('ip_permissions', []):
                for ip_range in perm.get('IpRanges', []):
                    if ip_range.get('CidrIp') == '0.0.0.0/0':
                        port = perm.get('ToPort')
                        if port in [22, 3389]:
                            risks.append({
                                "id": f"risk-{resource['id']}-sg-open-mgmt",
                                "severity": "critical",
                                "title": f"Port {port} Open to World",
                                "description": f"Security group exposes management port {port} to 0.0.0.0/0.",
                                "recommendation": "Restrict to specific corporate IP addresses."
                            })

        return risks
