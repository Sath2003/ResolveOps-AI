# 02 — Architecture & Request Flow

## Microservice Map

| Service | Port | Description | Access / Permissions |
|---|---|---|---|
| `frontend` | 3000 | Next.js UI | User browser |
| `api-gateway-service` | 8000 | Auth & routing proxy | External port 8000 |
| `ai-rca-service` | 8005 | RCA & Chat orchestrator | Internal Docker network |
| `mcp-server-service` | 8007 | MCP Tool execution server | Internal Docker network (Token required) |
| `docker-evidence-adapter` | 8008 | Docker socket read adapter | Internal Docker network (Docker socket mounted read-only) |
| `aws-intelligence-service` | 8004 | AWS API integration | Internal Docker network (AWS IAM credentials) |
| `github-intelligence-service` | 8002 | GitHub API integration | Internal Docker network (GitHub PAT) |

## End-to-End Request Flow (Investigation)

```
[User Browser]
      │
      │ 1. POST /api/v1/rca/investigate
      ▼
[api-gateway-service] (Authenticates JWT)
      │
      │ 2. Forward payload to http://ai-rca-service:8000/api/v1/rca/investigate
      ▼
[ai-rca-service (Orchestrator)]
      │
      ├──────► 3. Call MCP Tools ──► [mcp-server-service]
      │                                   │
      │                                   ├─► [aws-intelligence-service] ──► AWS CloudWatch / CloudTrail
      │                                   ├─► [github-intelligence-service] ─► GitHub API
      │                                   └─► [docker-evidence-adapter] ─────► /var/run/docker.sock (RO)
      │
      ├──────► 4. Query RAG Knowledge Base ──► Amazon Bedrock Knowledge Base
      │
      └──────► 5. Invoke Bedrock ───────────► Amazon Bedrock Runtime (Claude 3 Haiku)
                                                  │
[Structured RCA Response] ◄───────────────────────┘
```
