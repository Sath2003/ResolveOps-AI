# 05 — Amazon Bedrock Integration Guide

## Overview
`ai-rca-service` interacts with Amazon Bedrock via `boto3`.

## Configuration Parameters
- `AI_PROVIDER=bedrock`
- `AWS_REGION=ap-south-1`
- `BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0`

## Error Handling Policy
If Bedrock returns an error (e.g. rate limit, access denied, timeout), the system catches the exception and returns a structured internal error code (`AI_PROVIDER_RATE_LIMITED`, `AI_PROVIDER_ACCESS_DENIED`, etc.).
Raw AWS exception tracebacks are logged internally and never returned to the frontend.
