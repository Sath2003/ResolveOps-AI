# 18 — Troubleshooting Guide

## Common Issues & Resolutions

### 1. OpenAI 429 Insufficient Quota Error
- **Cause**: Legacy Gateway RAG path invoked OpenAI because `AI_PROVIDER=openai` was set in `.env`.
- **Fix**: Verify `.env` has `AI_PROVIDER=bedrock` and `AI_RCA_CHAT_ENABLED=true`.

### 2. Provider Status Degraded / Misconfigured
- **Cause**: Missing AWS region or invalid IAM instance role attached to EC2.
- **Fix**: Check `curl http://localhost:8000/api/v1/ai/provider-status` and verify EC2 IAM policy.

### 3. MCP Tool Call Failures
- **Cause**: Invalid service token or service name not in `ALLOWED_DOCKER_SERVICES`.
- **Fix**: Ensure `MCP_SERVICE_TOKEN` matches across services and service name is allowed.
