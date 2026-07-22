# 19 — Operational Analytics & Telemetry

## Overview
The ResolveOps AI Analytics page (`/analytics`) provides a live operational dashboard for the single EC2 instance Docker Compose deployment.

## Data Sources
- **Backend API**: `GET /api/v1/analytics/overview` (aggregated at API Gateway).
- **AI Provider Status**: `GET /api/v1/ai/provider-status` (queried from `ai-rca-service`).
- **PostgreSQL Database**: Queries `nexus_incidents` and `nexus_logs`.
- **MCP Server Telemetry**: Diagnostic tool execution counts and status.
- **GitHub Intelligence**: Workflow run conclusions (`failure` vs `success`).

## Metric Definitions

| Metric | Definition | Source |
|---|---|---|
| **System Operational Status** | `healthy` if 0 degraded services & 0 open incidents, else `degraded`. | Gateway Aggregation |
| **Active Incidents** | Count of stored incidents with status `active`, `open`, or `investigating`. | `nexus_incidents` Table |
| **Docker Services Health** | Ratio of healthy vs degraded containers in `ALLOWED_DOCKER_SERVICES`. | `docker-evidence-adapter` |
| **AI RCA Engine Status** | Active AI provider (`bedrock` or `openai`) and status (`available`/`degraded`). | `ai-rca-service` |
| **MCP Diagnostic Tools** | Count and status of the 10 allowed read-only MCP evidence tools. | `mcp-server-service` |

## Refresh & Performance Policy
- **Default Refresh**: 60 seconds auto-refresh interval.
- **Manual Refresh**: Available via top header action button.
- **No Polling Overload**: Queries single consolidated `/analytics/overview` endpoint to preserve EC2 `t2.large` CPU/Memory bandwidth.
