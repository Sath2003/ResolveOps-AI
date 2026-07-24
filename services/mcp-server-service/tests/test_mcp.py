import os
import sys
import unittest
import time
import jwt
from unittest.mock import patch, MagicMock

# Add services/mcp-server-service to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.mcp.auth import verify_mcp_auth
from app.mcp.policies import (
    validate_region,
    validate_log_group,
    validate_namespace,
    validate_repository,
    validate_docker_service
)
from app.mcp.server import mcp

# Generate mock RSA keys for asymmetric JWT tests
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048
)
private_pem = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.TraditionalOpenSSL,
    encryption_algorithm=serialization.NoEncryption()
).decode("utf-8")

public_key = private_key.public_key()
public_pem = public_key.public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo
).decode("utf-8")

class TestMCPServerSecurity(unittest.TestCase):

    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {
            "APP_ENV": "dev",
            "MCP_SERVICE_TOKEN": "local-dev-token-abc",
            "JWT_SECRET": "test-symmetric-jwt-secret-very-long-secret-key-12345",
            "JWKS_PUBLIC_KEY_PEM": public_pem
        })
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_static_token_validation_in_dev(self):
        """Verify fallback to static X-MCP-Service-Token in local dev environment."""
        # 1. Valid static token
        mock_request = MagicMock()
        mock_request.headers = {"x-mcp-service-token": "local-dev-token-abc"}
        mock_request.url.path = "/mcp"
        
        # Should not raise exception
        import asyncio
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(verify_mcp_auth(mock_request))
        self.assertEqual(res["auth_method"], "static_token")

        # 2. Invalid static token
        mock_request_bad = MagicMock()
        mock_request_bad.headers = {"x-mcp-service-token": "wrong-token"}
        mock_request_bad.url.path = "/mcp"
        
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            loop.run_until_complete(verify_mcp_auth(mock_request_bad))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_asymmetric_jwt_validation(self):
        """Verify successful RS256 asymmetric token verification using public key PEM."""
        # Generate valid token signed by mock private key
        payload = {
            "iss": "resolveops-ai-rca",
            "aud": "resolveops-mcp-server",
            "scopes": ["mcp:read"],
            "exp": int(time.time()) + 60
        }
        token = jwt.encode(payload, private_pem, algorithm="RS256")
        
        mock_request = MagicMock()
        mock_request.headers = {"authorization": f"Bearer {token}"}
        mock_request.url.path = "/mcp"
        
        import asyncio
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(verify_mcp_auth(mock_request))
        self.assertEqual(res["iss"], "resolveops-ai-rca")

    def test_expired_jwt_validation_fails(self):
        """Verify that expired JWT tokens are rejected."""
        payload = {
            "iss": "resolveops-ai-rca",
            "aud": "resolveops-mcp-server",
            "scopes": ["mcp:read"],
            "exp": int(time.time()) - 10  # Expired
        }
        token = jwt.encode(payload, private_pem, algorithm="RS256")
        
        mock_request = MagicMock()
        mock_request.headers = {"authorization": f"Bearer {token}"}
        mock_request.url.path = "/mcp"
        
        import asyncio
        from fastapi import HTTPException
        loop = asyncio.get_event_loop()
        with self.assertRaises(HTTPException) as ctx:
            loop.run_until_complete(verify_mcp_auth(mock_request))
        self.assertEqual(ctx.exception.status_code, 401)


class TestMCPPolicies(unittest.TestCase):

    def test_region_policy_validation(self):
        """Verify region policy rules."""
        # Allowed regions
        self.assertEqual(validate_region("ap-south-1"), "ap-south-1")
        self.assertEqual(validate_region("us-east-1"), "us-east-1")
        
        # Blocked regions
        with self.assertRaises(ValueError):
            validate_region("us-gov-west-1")
        with self.assertRaises(ValueError):
            validate_region("cn-north-1")

    def test_log_group_policy_validation(self):
        """Verify log group constraints."""
        self.assertEqual(validate_log_group("/aws/ecs/api-gateway"), "/aws/ecs/api-gateway")
        
        with self.assertRaises(ValueError):
            validate_log_group("/aws/ecs/unregistered-group")

    def test_kubernetes_namespace_policy_validation(self):
        """Verify k8s namespace rules."""
        self.assertEqual(validate_namespace("production"), "production")
        self.assertEqual(validate_namespace("default"), "default")
        
        with self.assertRaises(ValueError):
            validate_namespace("restricted-admin-ns")

    def test_repository_policy_validation(self):
        """Verify git repo allowance check."""
        self.assertEqual(validate_repository("ResolveOps/frontend"), "ResolveOps/frontend")
        
        with self.assertRaises(ValueError):
            validate_repository("external-org/hacked-repo")

    def test_docker_service_policy_validation(self):
        """Verify docker service validation."""
        self.assertEqual(validate_docker_service("api-gateway-service"), "api-gateway-service")
        
        with self.assertRaises(ValueError):
            validate_docker_service("unregistered-host-database")


class TestFastMCPRegistration(unittest.TestCase):

    def test_tools_registered(self):
        """Verify that all domain tools are correctly registered with FastMCP instance."""
        tool_names = [t.name for t in mcp._tools]
        
        # Check standard domain scoped tools
        self.assertIn("aws.ec2.get_instance_health", tool_names)
        self.assertIn("aws.cloudwatch.get_log_evidence", tool_names)
        self.assertIn("kubernetes.get_workloads", tool_names)
        self.assertIn("github.get_failed_workflow_evidence", tool_names)
        self.assertIn("runtime.get_service_evidence", tool_names)
        self.assertIn("incidents.get_incident", tool_names)
        
        # Check legacy compatibility tools
        self.assertIn("aws_get_ec2_instance_health", tool_names)
        self.assertIn("docker_get_service_evidence", tool_names)

if __name__ == "__main__":
    unittest.main()
