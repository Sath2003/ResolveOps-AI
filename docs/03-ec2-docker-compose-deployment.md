# 03 — EC2 Docker Compose Deployment

## Target Platform Specs
- **Cloud**: Amazon Web Services (AWS)
- **Compute**: Amazon EC2 `t2.large` (2 vCPU, 8 GB RAM)
- **OS**: Amazon Linux 2023 or Ubuntu 22.04 LTS
- **Orchestration**: Single-node Docker Compose v2

## Deployment Steps
1. Launch an EC2 `t2.large` instance with an attached IAM Role (see [Doc 04](04-aws-iam-instance-role.md)).
2. Clone the repository:
   ```bash
   git clone https://github.com/Sath2003/ResolveOps-AI.git
   cd ResolveOps-AI
   ```
3. Copy environment template:
   ```bash
   cp .env.example .env
   ```
4. Start services:
   ```bash
   docker compose up -d --build
   ```
5. Verify container status:
   ```bash
   docker compose ps
   ```
