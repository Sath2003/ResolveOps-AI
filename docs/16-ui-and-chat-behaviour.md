# 16 — UI & Chat Behavior Specifications

## UX Guidelines
- **Dynamic Provider Badge**: Fetched via `GET /api/v1/ai/provider-status`. Never hardcode provider strings in JSX.
- **Error Display**: Render friendly `ErrorCard` with retry button and copyable request ID. Never display raw exception traces or SDK bodies.
- **Status Indicators**: Show progressive investigation states (`preparing` -> `collecting` -> `correlating` -> `generating` -> `completed`).
