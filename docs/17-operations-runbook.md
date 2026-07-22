# 17 — Operations Runbook

## Routine Health Monitoring
1. Check overall container health:
   ```bash
   docker compose ps
   ```
2. Verify provider status:
   ```bash
   curl http://localhost:8000/api/v1/ai/provider-status
   ```
3. Inspect `ai-rca-service` logs:
   ```bash
   docker compose logs -f ai-rca-service
   ```
