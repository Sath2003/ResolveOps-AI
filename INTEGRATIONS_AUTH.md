# Integration Authentication Guide: AWS, Azure, & GitHub

This document details the environment variables, permissions, and security policies required to authenticate and connect **ResolveOps AI** to your cloud providers and source code platforms.

---

## 1. AWS Integration (`aws-intelligence-service`)

The AWS intelligence service discovers cloud resources (like EKS clusters and EC2 instances), checks CloudWatch logs, and fetches Cost Explorer metrics.

### Environment Variables (add to `.env`):
```text
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
```

### AWS IAM Policy (Least Privilege)
Create a custom IAM Policy in AWS with the following permissions, and attach it to the IAM User associated with the keys above:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EKSReadOnlyAccess",
            "Effect": "Allow",
            "Action": [
                "eks:ListClusters",
                "eks:DescribeCluster",
                "eks:ListNodegroups",
                "eks:DescribeNodegroup",
                "eks:ListUpdates",
                "eks:DescribeUpdate"
            ],
            "Resource": "*"
        },
        {
            "Sid": "EC2AndVpcReadOnly",
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeSubnets",
                "ec2:DescribeVpcs",
                "ec2:DescribeVolumes"
            ],
            "Resource": "*"
        },
        {
            "Sid": "CloudWatchLogsAccess",
            "Effect": "Allow",
            "Action": [
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
                "logs:GetLogEvents",
                "logs:FilterLogEvents"
            ],
            "Resource": "*"
        },
        {
            "Sid": "CostExplorerAccess",
            "Effect": "Allow",
            "Action": [
                "ce:GetCostAndUsage",
                "ce:GetCostForecast",
                "ce:GetDimensionValues"
            ],
            "Resource": "*"
        }
    ]
}
```

---

## 2. Azure Integration (`azure-intelligence-service`)

The Azure service discovers virtual machines, AKS (Azure Kubernetes Service) workloads, and checks Azure Monitor logs and Azure Cost Management.

### Environment Variables (add to `.env`):
```text
AZURE_TENANT_ID=xxxx-xxxx-xxxx-xxxx  # Directory (tenant) ID
AZURE_CLIENT_ID=xxxx-xxxx-xxxx-xxxx  # Application (client) ID
AZURE_CLIENT_SECRET=xxxx~xxxxxxxxxx  # App registration Client Secret Value
AZURE_SUBSCRIPTION_ID=xxxx-xxxx-xxxx # Azure Subscription ID
```

### How to set up Azure Authentication:
1. Go to the **Azure Portal** -> **Microsoft Entra ID** (Active Directory) -> **App registrations**.
2. Click **New registration** and name it `ResolveOps-AI`. Keep single tenant, and click **Register**.
3. Copy the **Application (client) ID** and **Directory (tenant) ID** values.
4. Go to **Certificates & secrets** on the left menu -> Click **New client secret** -> Create it and copy the secret **Value** immediately.
5. Go to your **Azure Subscription** -> **Access control (IAM)** -> Click **Add** -> **Add role assignment**.
6. Select the **`Reader`** role, click Next, and select **Members** -> **Select members** -> Search for `ResolveOps-AI` (your registered App). Select it, and click **Review + assign**.

---

## 3. GitHub Integration (`github-intelligence-service`)

The GitHub integration reads repositories, tracks commits, monitors pull requests, and sets up webhooks to automatically trigger predictive RCA when code is deployed.

### Environment Variables (add to `.env`):
```text
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx # Personal Access Token
GITHUB_WEBHOOK_SECRET=your_webhook_secret_key # For securing payload verification
```

### Required Personal Access Token (PAT) Scopes:
Create a Developer Personal Access Token (Classic) with the following scopes:
* **`repo`** (Full control of private repositories - to read code structures, logs, and pull requests).
* **`admin:repo_hook`** (To write and update repository webhooks dynamically for real-time notification syncing).

---

## 4. AI Provider Integration (`ai-rca-service` & `api-gateway-service`)

The AI engines analyze logs and generate root cause analyses proactively.

### Environment Variables (add to `.env`):
```text
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL_NAME=gpt-4o-mini
```
