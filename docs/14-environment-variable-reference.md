# 14 — Environment Variable Reference

## Core Variables

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `bedrock` | Primary AI provider (`bedrock` or `openai`) |
| `AWS_REGION` | `ap-south-1` | Target AWS region for Bedrock & CloudWatch |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-haiku-20240307-v1:0` | Amazon Bedrock model ID |
| `MCP_RCA_ENABLED` | `true` | Feature flag for MCP evidence collection |
| `AI_RCA_CHAT_ENABLED` | `true` | Forward chat calls from Gateway to AI-RCA |
| `LEGACY_GATEWAY_RAG_ENABLED` | `false` | Disable legacy Gateway RAG path |
| `OPENAI_FALLBACK_ENABLED` | `false` | Disable automatic OpenAI fallback |
| `ALLOWED_DOCKER_SERVICES` | comma-separated list | Docker service name allow-list |
