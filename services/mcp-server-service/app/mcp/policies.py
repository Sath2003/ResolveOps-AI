import os
from typing import Any, Dict, List

# Allowed lists (deny-by-default configuration)
ALLOWED_REGIONS = frozenset(
    filter(None, os.getenv("ALLOWED_REGIONS", "us-east-1,us-east-2,us-west-2,eastus,westeurope").split(","))
)

ALLOWED_NAMESPACES = frozenset(
    filter(None, os.getenv("ALLOWED_NAMESPACES", "default,production,kube-system").split(","))
)

ALLOWED_REPOSITORIES = frozenset(
    filter(None, os.getenv("ALLOWED_REPOSITORIES", "Sath2003/ResolveOps-AI").split(","))
)

ALLOWED_DOCKER_SERVICES = frozenset(
    filter(
        None,
        os.getenv(
            "ALLOWED_DOCKER_SERVICES",
            "api-gateway-service,ai-rca-service,aws-intelligence-service,"
            "github-intelligence-service,mcp-server-service,docker-evidence-adapter,"
            "frontend,auth-service,notification-service",
        ).split(","),
    )
)

ALLOWED_CLOUDWATCH_LOG_GROUPS = frozenset(
    filter(None, os.getenv("ALLOWED_CLOUDWATCH_LOG_GROUPS", "resolveops-cw-group").split(","))
)

# Limits
MAX_RECORD_COUNT = int(os.getenv("MCP_MAX_RECORD_COUNT", "20"))
MAX_TEXT_LENGTH = int(os.getenv("MCP_MAX_TEXT_LENGTH", "10000"))
MAX_LOG_CHARACTERS = int(os.getenv("MCP_MAX_LOG_CHARACTERS", "15000"))

def validate_region(region: str) -> None:
    if region and region.strip().lower() not in {r.lower() for r in ALLOWED_REGIONS}:
        raise ValueError(f"Region '{region}' is not in the allowed list: {sorted(ALLOWED_REGIONS)}")

def validate_namespace(namespace: str) -> None:
    if namespace and namespace.strip().lower() not in {n.lower() for n in ALLOWED_NAMESPACES}:
        raise ValueError(f"Kubernetes namespace '{namespace}' is not in the allowed list: {sorted(ALLOWED_NAMESPACES)}")

def validate_repository(repo: str) -> None:
    if repo and repo.strip() not in ALLOWED_REPOSITORIES:
        raise ValueError(f"GitHub repository '{repo}' is not in the allowed list: {sorted(ALLOWED_REPOSITORIES)}")

def validate_docker_service(service_name: str) -> str:
    name = service_name.strip().lower()
    if name not in {s.lower() for s in ALLOWED_DOCKER_SERVICES}:
        raise ValueError(f"Docker service '{service_name}' is not in the allowed list.")
    return name

def validate_log_group(log_group: str) -> None:
    if log_group and log_group.strip() not in ALLOWED_CLOUDWATCH_LOG_GROUPS:
        raise ValueError(f"CloudWatch log group '{log_group}' is not in the allowed list.")
