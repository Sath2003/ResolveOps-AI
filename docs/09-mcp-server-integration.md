# 09 — MCP Server Integration Guide

## Architecture
`mcp-server-service` is an internal-only HTTP server executing Model Context Protocol (MCP) tools.

## Security & Policies
- Authenticated via `X-MCP-Service-Token`.
- Enforces strict read-only allow-lists (`ALLOWED_TOOLS`).
- Rejects any write, delete, scale, or container restart commands.
