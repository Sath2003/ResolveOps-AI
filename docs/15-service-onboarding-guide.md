# 15 — Service Onboarding Guide

## Adding a New Service
1. Add service container definition to `docker-compose.yml`.
2. Append service name to `ALLOWED_DOCKER_SERVICES` in `.env.example`.
3. If creating a custom tool, register the tool name in `mcp-server-service/app/policies.py`.
