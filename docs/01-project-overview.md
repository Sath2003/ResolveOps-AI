# 01 — Project Overview

## Mission & Goal
ResolveOps AI is an AWS-hosted, MCP-powered evidence-first incident investigation and Root Cause Analysis (RCA) platform.

During operational incidents, ResolveOps AI correlates live diagnostics from AWS CloudWatch, CloudTrail, GitHub Actions, Docker Compose containers, and historical incident knowledge bases to produce deterministic, evidence-backed Root Cause Analysis reports.

## Core Design Principles
1. **Evidence-First**: No speculation. All conclusions cite verified live or historical evidence items.
2. **Strictly Read-Only**: The platform does not execute automated remediation, container restarts, rollbacks, resource scaling, or deletions.
3. **Single EC2 Instance**: Runs exclusively via Docker Compose on a single AWS EC2 instance (`t2.large`).
4. **Thin Gateway**: API Gateway is a stateless routing and authentication proxy. All AI and RCA orchestration is owned by `ai-rca-service`.
5. **Bedrock-First**: Amazon Bedrock via EC2 IAM instance roles is the primary AI provider.
