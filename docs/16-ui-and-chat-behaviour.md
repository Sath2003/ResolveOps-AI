# 16 — UI & Chat Behavior Specifications

## Application Navigation & Layout
- **Sidebar**: Collapsible navigation supporting AWS EC2 runtime, Docker services, AI Copilot, Suggestions, Analytics, and Integrations.
- **Responsive Drawer**: Collapses into a drawer on tablet and mobile viewports.

## Chat Request Flow
1. User enters natural-language query or incident ID.
2. Secrets (`AKIA...`, `ghp_...`, tokens) are automatically redacted in client state.
3. Message dispatched to `POST /api/chat` (forwarded to `ai-rca-service`).
4. Investigation states progress (`preparing` -> `collecting` -> `correlating` -> `generating` -> `completed`).
5. AI-RCA output rendered as structured RCA or standard assistant markdown.

## Dynamic Provider Badge
- Reads status from `GET /api/v1/ai/provider-status`.
- Displays `Amazon Bedrock — Active` or `OpenAI — Active` based on active backend provider.
- Never hardcodes provider strings in frontend components.

## Error Handling & Retry Behavior
- If an API error occurs, `frontend/src/lib/api.js` normalizes the error into a structured object.
- Rendered in a dedicated `ErrorCard` with:
  - User-safe message
  - Retry trigger (preserves user prompt, does not duplicate message in history)
  - Request ID (copyable)
  - Expandable technical details
