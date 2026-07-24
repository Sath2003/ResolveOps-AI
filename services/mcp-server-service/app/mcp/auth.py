import os
import time
import hmac
import logging
import jwt
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List, Dict, Any
import httpx

logger = logging.getLogger(__name__)

MCP_SERVICE_TOKEN = os.getenv("MCP_SERVICE_TOKEN", "")
APP_ENV = os.getenv("APP_ENV", "dev")

JWKS_URL = os.getenv("JWKS_URL", "")
JWKS_PUBLIC_KEY_PEM = os.getenv("JWKS_PUBLIC_KEY_PEM", "")
JWKS_AUDIENCE = os.getenv("JWKS_AUDIENCE", "resolveops-mcp-server")
JWKS_ISSUER = os.getenv("JWKS_ISSUER", "resolveops-auth-service")

_jwks_cache: Dict[str, Any] = {}
_jwks_cache_expiry: float = 0.0
JWKS_CACHE_TTL = 3600

security = HTTPBearer(auto_error=False)

def get_jwks_keys() -> List[Dict[str, Any]]:
    global _jwks_cache, _jwks_cache_expiry
    if not JWKS_URL:
        return []
    now = time.time()
    if _jwks_cache and now < _jwks_cache_expiry:
        return _jwks_cache.get("keys", [])
    try:
        resp = httpx.get(JWKS_URL, timeout=5)
        if resp.status_code == 200:
            _jwks_cache = resp.json()
            _jwks_cache_expiry = now + JWKS_CACHE_TTL
            return _jwks_cache.get("keys", [])
    except Exception as e:
        logger.error(f"Failed to fetch JWKS from {JWKS_URL}: {e}")
    return _jwks_cache.get("keys", []) if _jwks_cache else []

def verify_asymmetric_jwt(token: str, required_scopes: List[str]) -> Dict[str, Any]:
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed JWT header")
        
    public_key = None
    if JWKS_PUBLIC_KEY_PEM:
        public_key = JWKS_PUBLIC_KEY_PEM
    elif kid and JWKS_URL:
        keys = get_jwks_keys()
        for k in keys:
            if k.get("kid") == kid:
                public_key = jwt.algorithms.RSAAlgorithm.from_jwk(k)
                break
                
    if not public_key:
        if APP_ENV == "dev" and os.getenv("TESTING_PUBLIC_KEY_PEM"):
            public_key = os.getenv("TESTING_PUBLIC_KEY_PEM")
        else:
            raise HTTPException(status_code=401, detail="Public signing key matching kid not found")
            
    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=JWKS_AUDIENCE,
            issuer=JWKS_ISSUER
        )
        
        token_scopes = payload.get("scopes", [])
        if isinstance(token_scopes, str):
            token_scopes = token_scopes.split(" ")
            
        for scope in required_scopes:
            if scope not in token_scopes:
                raise HTTPException(
                    status_code=403,
                    detail=f"Required scope '{scope}' is missing."
                )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Service token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid service token: {str(e)}")

async def verify_mcp_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Dict[str, Any]:
    token = ""
    if credentials:
        token = credentials.credentials
    else:
        token = request.headers.get("X-MCP-Service-Token", "") or request.headers.get("Authorization", "")
        if token.startswith("Bearer "):
            token = token[7:]
            
    if not token:
        raise HTTPException(status_code=401, detail="Authentication token missing")
        
    if MCP_SERVICE_TOKEN and hmac.compare_digest(token, MCP_SERVICE_TOKEN):
        if APP_ENV == "dev":
            return {"client_id": "mcp-dev-fallback", "scopes": ["mcp:read", "mcp:write"]}
            
    # Production verification: scopes depend on path / method called
    # By default, require mcp:read scope for listings and tool runs
    required_scopes = ["mcp:read"]
    return verify_asymmetric_jwt(token, required_scopes)
