# 07 — CloudTrail Integration Guide

## Audit Event Retrieval
CloudTrail management events are queried via `aws_get_cloudtrail_changes` to detect security group modifications, IAM role updates, or EC2 state changes made during an incident window.
All calls use `cloudtrail:LookupEvents` (read-only).
