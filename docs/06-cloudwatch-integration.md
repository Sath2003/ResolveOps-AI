# 06 — CloudWatch Integration Guide

## Logs & Metrics Retrieval
CloudWatch log events and metric statistics are fetched via `aws-intelligence-service` and wrapped as read-only MCP tools (`aws_get_cloudwatch_log_evidence`, `aws_get_cloudwatch_metric_evidence`).

## Allowed Log Groups
Log groups must be explicitly allowed in the `ALLOWED_CLOUDWATCH_LOG_GROUPS` environment variable.
