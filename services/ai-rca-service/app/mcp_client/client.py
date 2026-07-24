from __future__ import annotations

import logging
import time
import os
import json
import jwt
from typing import Any, Dict, List, Optional
from mcp.client.sse import sse_client
from mcp import ClientSession

from app.settings import settings
from app.errors import ErrorCode

logger = logging.getLogger(__name__)

# List of secrets keys to redact in outputs
_REDACT_KEYS = frozenset(
    {"token", "secret", "password", "key", "api_key", "access_key", "session_token", "pat", "authorization"}
)

def redact_secrets(obj: Any, depth: int = 0) -> Any:
    if depth > 5:
        return obj
    if isinstance(obj, dict):
        return {
            k: "[REDACTED]" if any(r in k.lower() for r in _REDACT_KEYS) else redact_secrets(v, depth + 1)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [redact_secrets(i, depth + 1) for i in obj]
    return obj

class MCPClientError(Exception):
    """Raised when the MCP server returns an error or is unreachable."""
    def __init__(self, error_code: str, message: str) -> None:
        self.error_code = error_code
        super().__init__(message)

class MCPServerConnection:
    """Manages a single standard MCP connection session and circuit breaker state."""
    
    def __init__(self, server_id: str, url: str, domains: List[str], auth_mode: str = "static") -> None:
        self.server_id = server_id
        self.url = url
        self.domains = domains
        self.auth_mode = auth_mode
        self.status = "disconnected"  # connected, disconnected, error
        self.tools: List[Dict[str, Any]] = []
        
        # Circuit Breaker attributes
        self.failures = 0
        self.state = "closed"  # closed, open, half-open
        self.last_trip_time = 0.0
        self.last_successful_call = None
        self.last_failure_reason = None
        
    def get_auth_headers(self, tenant_id: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        app_env = os.getenv("APP_ENV", "dev")
        mcp_service_token = os.getenv("MCP_SERVICE_TOKEN", "")
        
        if self.auth_mode == "static" or (not os.getenv("JWKS_PRIVATE_KEY_PEM") and not os.getenv("JWT_SECRET")):
            token = mcp_service_token or settings.MCP_SERVICE_TOKEN or ""
            if token:
                headers["X-MCP-Service-Token"] = token
                headers["Authorization"] = f"Bearer {token}"
            return headers

        # Production auth: Asymmetric RSA token generation
        private_key = os.getenv("JWKS_PRIVATE_KEY_PEM", "")
        if private_key:
            try:
                payload = {
                    "iss": "resolveops-ai-rca",
                    "aud": "resolveops-mcp-server",
                    "scopes": ["mcp:read", "mcp:write"],
                    "tenant_id": tenant_id or "*",
                    "exp": int(time.time()) + 60
                }
                token = jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "ai-rca-kid"})
                headers["Authorization"] = f"Bearer {token}"
                return headers
            except Exception as e:
                logger.error(f"Asymmetric token signing failed: {e}")

        # Symmetric JWT fallback
        secret = os.getenv("JWT_SECRET", "thisisaverylongjwtsecrestthesecretisverysecretsokeepitsecret")
        payload = {
            "iss": "resolveops-ai-rca",
            "aud": "resolveops-mcp-server",
            "scopes": ["mcp:read", "mcp:write"],
            "tenant_id": tenant_id or "*",
            "exp": int(time.time()) + 60
        }
        token = jwt.encode(payload, secret, algorithm="HS256")
        headers["Authorization"] = f"Bearer {token}"
        return headers

    def record_success(self) -> None:
        self.failures = 0
        self.state = "closed"
        self.status = "connected"
        self.last_successful_call = time.time()

    def record_failure(self, reason: str) -> None:
        self.failures += 1
        self.last_failure_reason = reason
        self.status = "error"
        if self.failures >= 3:
            self.state = "open"
            self.last_trip_time = time.time()
            logger.warning(f"Circuit breaker for server '{self.server_id}' tripped to OPEN.")

    def check_circuit_breaker(self) -> bool:
        """Returns True if the connection is allowed to proceed."""
        if self.state == "open":
            # Check cooldown duration (60 seconds)
            if time.time() - self.last_trip_time > 60:
                self.state = "half-open"
                logger.info(f"Circuit breaker for server '{self.server_id}' transitioned to HALF-OPEN.")
                return True
            return False
        return True

class MCPClientManager:
    """Central manager coordinating multiple standard MCP server connections."""
    
    def __init__(self) -> None:
        self.servers: Dict[str, MCPServerConnection] = {}
        self._load_servers_configuration()
        
    def _load_servers_configuration(self) -> None:
        config_str = os.getenv("MCP_SERVERS", "")
        if config_str:
            try:
                server_configs = json.loads(config_str)
                for conf in server_configs:
                    if conf.get("enabled", True):
                        conn = MCPServerConnection(
                            server_id=conf["id"],
                            url=conf["url"],
                            domains=conf.get("domains", []),
                            auth_mode=conf.get("auth_mode", "static")
                        )
                        self.servers[conf["id"]] = conn
                logger.info(f"Loaded {len(self.servers)} enabled servers from MCP_SERVERS")
            except Exception as e:
                logger.error(f"Failed to parse MCP_SERVERS configuration: {e}")
                
        # Default fallback server if none configured
        if not self.servers:
            conn = MCPServerConnection(
                server_id="operations",
                url=settings.MCP_SERVER_URL,
                domains=["aws", "kubernetes", "github", "runtime", "incidents"],
                auth_mode="static"
            )
            self.servers["operations"] = conn
            logger.info(f"Loaded default fallback operations server: {settings.MCP_SERVER_URL}")

    async def list_tools(self) -> List[Dict[str, Any]]:
        """Query all active servers and return union of discovered tools."""
        all_tools = []
        for server_id, conn in self.servers.items():
            if not conn.check_circuit_breaker():
                continue
            try:
                headers = conn.get_auth_headers()
                # Append /sse to the FastMCP URL for the endpoint
                sse_url = conn.url if conn.url.endswith("/sse") else f"{conn.url}/sse"
                async with sse_client(sse_url, headers=headers) as (read, write):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        server_tools = await session.list_tools()
                        
                        # Store metadata & cache
                        conn.tools = []
                        for tool in server_tools.tools:
                            tool_dict = {
                                "name": tool.name,
                                "description": tool.description,
                                "inputSchema": tool.inputSchema,
                                "server_id": server_id
                            }
                            conn.tools.append(tool_dict)
                            all_tools.append(tool_dict)
                        conn.record_success()
            except Exception as e:
                conn.record_failure(str(e))
                logger.error(f"Failed to list tools from server '{server_id}': {e}")
                
        return all_tools

    async def call_tool(
        self,
        tool_name: str,
        inputs: Dict[str, Any],
        request_id: Optional[str] = None,
        tenant_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Routes the tool call to the server advertising the tool using standard ClientSession.
        Redacts credentials in result and wraps standard evidence structure.
        """
        # Find which server hosts this tool
        target_server: Optional[MCPServerConnection] = None
        
        # Populate tool cache if empty
        if not any(conn.tools for conn in self.servers.values()):
            await self.list_tools()
            
        for conn in self.servers.values():
            if any(t["name"] == tool_name for t in conn.tools):
                target_server = conn
                break
                
        if not target_server:
            # Fallback check on domains or default server
            target_server = next(iter(self.servers.values()))
            
        if not target_server.check_circuit_breaker():
            raise MCPClientError(
                ErrorCode.MCP_SERVER_UNAVAILABLE,
                f"Circuit breaker is OPEN for server hosting tool '{tool_name}'"
            )
            
        start_time = time.monotonic()
        try:
            headers = target_server.get_auth_headers(tenant_id)
            sse_url = target_server.url if target_server.url.endswith("/sse") else f"{target_server.url}/sse"
            
            # Connect over streamable HTTP SSE client
            async with sse_client(sse_url, headers=headers) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    
                    # Execute tool call
                    result = await session.call_tool(tool_name, arguments=inputs)
                    elapsed_ms = int((time.monotonic() - start_time) * 1000)
                    target_server.record_success()
                    
                    # Parse result text
                    if not result.content or len(result.content) == 0:
                        raise MCPClientError(ErrorCode.INTERNAL_SERVICE_ERROR, "Empty response from tool execution")
                        
                    content_text = result.content[0].text
                    try:
                        data = json.loads(content_text)
                    except Exception:
                        data = {"raw_text": content_text}
                        
                    # Redact credentials and wrap evidence
                    redacted_data = redact_secrets(data)
                    
                    # Form standard evidence structure
                    evidence = redacted_data.get("evidence", [])
                    wrapped_evidence = []
                    for item in evidence:
                        wrapped_evidence.append({
                            "source": item.get("source", tool_name.split(".")[0]),
                            "tool": tool_name,
                            "retrievedAt": item.get("timestamp") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            "freshness": "live" if item.get("is_live", True) else "historical",
                            "data": redact_secrets(item)
                        })
                        
                    return {
                        "tool": tool_name,
                        "success": True,
                        "duration_ms": elapsed_ms,
                        "evidence": wrapped_evidence,
                        "raw_result": redacted_data
                    }
                    
        except Exception as e:
            target_server.record_failure(str(e))
            logger.error(f"Error calling tool '{tool_name}' on server '{target_server.server_id}': {e}")
            raise MCPClientError(
                ErrorCode.MCP_SERVER_UNAVAILABLE,
                f"Cannot execute tool '{tool_name}': {str(e)}"
            )

    async def health(self) -> Dict[str, Any]:
        """Verify health check on all servers."""
        status_map = {}
        for server_id, conn in self.servers.items():
            status_map[server_id] = {
                "url": conn.url,
                "status": conn.status,
                "breaker_state": conn.state
            }
        return {"servers": status_map}

    async def close(self) -> None:
        """Placeholder for shutdown hook."""
        pass

# Export ClientManager as mcp_client singleton for backwards compatibility in orchestrator imports
mcp_client = MCPClientManager()
