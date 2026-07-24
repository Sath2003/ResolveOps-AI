import os
import time
import hmac
import logging
import jwt
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List, Dict, Any
import requests

logger = logging.getLogger(__name__)

# Load static tokens from environment
MCP_SERVICE_TOKEN = os.getenv("MCP_SERVICE_TOKEN", "")
APP_ENV = os.getenv("APP_ENV", "dev")

# JWKS and Asymmetric identity environment variables
JWKS_URL = os.getenv("JWKS_URL", "")
JWKS_PUBLIC_KEY_PEM = os.getenv("JWKS_PUBLIC_KEY_PEM", "")  # Static PEM public key string
JWKS_AUDIENCE = os.getenv("JWKS_AUDIENCE", "resolveops-api-gateway")
JWKS_ISSUER = os.getenv("JWKS_ISSUER", "resolveops-auth-service")

# Simple in-memory cache for JWKS keys to avoid constant fetch
_jwks_cache: Dict[str, Any] = {}
_jwks_cache_expiry: float = 0.0
JWKS_CACHE_TTL = 3600  # Cache key sets for 1 hour

security = HTTPBearer(auto_error=False)

def get_jwks_keys() -> List[Dict[str, Any]]:
    """Retrieve keys from the configured JWKS endpoint, utilizing in-memory cache."""
    global _jwks_cache, _jwks_cache_expiry
    
    if not JWKS_URL:
        return []
        
    now = time.time()
    if _jwks_cache and now < _jwks_cache_expiry:
        return _jwks_cache.get("keys", [])
        
    try:
        resp = requests.get(JWKS_URL, timeout=5)
        if resp.status_code == 200:
            _jwks_cache = resp.json()
            _jwks_cache_expiry = now + JWKS_CACHE_TTL
            return _jwks_cache.get("keys", [])
    except Exception as e:
        logger.error(f"Failed to fetch JWKS from {JWKS_URL}: {e}")
        
    # Return cache even if expired as fallback
    return _jwks_cache.get("keys", []) if _jwks_cache else []

def verify_asymmetric_jwt(token: str, required_scopes: List[str]) -> Dict[str, Any]:
    """Verify standard RS256 token using configured public key or JWKS."""
    try:
        # 1. Unverified decode to get key ID (kid) from header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Malformed JWT header")
        
    public_key = None
    
    # 2. Check static public key PEM
    if JWKS_PUBLIC_KEY_PEM:
        public_key = JWKS_PUBLIC_KEY_PEM
    # 3. Else fetch from JWKS endpoint matching kid
    elif kid and JWKS_URL:
        keys = get_jwks_keys()
        for k in keys:
            if k.get("kid") == kid:
                # pyjwt can decode public keys directly from jwk dict if it matches standard fields
                public_key = jwt.algorithms.RSAAlgorithm.from_jwk(k)
                break
                
    if not public_key:
        # Fallback to dev key pair verification for testing if configured
        if APP_ENV == "dev" and os.getenv("TESTING_PUBLIC_KEY_PEM"):
            public_key = os.getenv("TESTING_PUBLIC_KEY_PEM")
        else:
            raise HTTPException(status_code=401, detail="Public signing key matching kid not found or unconfigured")
            
    try:
        # Verify signature, expiry, issuer, and audience
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=JWKS_AUDIENCE,
            issuer=JWKS_ISSUER
        )
        
        # Verify scopes
        token_scopes = payload.get("scopes", [])
        if isinstance(token_scopes, str):
            token_scopes = token_scopes.split(" ")
            
        for scope in required_scopes:
            if scope not in token_scopes:
                raise HTTPException(
                    status_code=403,
                    detail=f"Required scope '{scope}' is missing from token."
                )
                
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Service token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid service token: {str(e)}")

async def verify_mcp_service(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Dict[str, Any]:
    """
    FastAPI dependency that enforces service identity authentication.
    Supports static token in dev, and asymmetric JWT signature verification in production.
    """
    # 1. Extract token from header (either Bearer or X-MCP-Service-Token)
    token = ""
    is_bearer = False
    
    if credentials:
        token = credentials.credentials
        is_bearer = True
    else:
        token = request.headers.get("X-MCP-Service-Token", "")
        
    if not token:
        raise HTTPException(status_code=401, detail="Authentication token missing")
        
    # 2. Local development static token comparison (dev mode fallback)
    if MCP_SERVICE_TOKEN:
        # Constant-time comparison for static token
        if hmac.compare_digest(token, MCP_SERVICE_TOKEN):
            if APP_ENV == "dev":
                logger.info("Authenticated using static development MCP_SERVICE_TOKEN")
                return {"client_id": "mcp-dev-fallback", "scopes": ["mcp:read", "mcp:write"]}
            else:
                logger.warning("Attempted static token auth in non-dev environment. Blocked.")
                
    # 3. Asymmetric JWT verification (Production flow)
    # Define required scopes based on path
    path = request.url.path
    required_scopes = []
    
    if "/mcp/incidents" in path:
        required_scopes = ["mcp:incidents:read"]
    elif "/mcp/service-health" in path:
        required_scopes = ["mcp:runtime:read"]
        
    return verify_asymmetric_jwt(token, required_scopes)
