from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import re
import json

app = FastAPI(title="ai-rca-service")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "ai-rca-service"}

class AnalyzeRequest(BaseModel):
    source: str
    context: str
    logs: str

@app.post("/api/v1/rca/analyze")
def analyze_rca(req: AnalyzeRequest):
    ai_provider = os.getenv("AI_PROVIDER", "bedrock")
    
    prompt = f"""
You are an expert DevSecOps SRE Assistant.
Analyze the following logs for root cause analysis.
Context: {req.context}
Logs:
{req.logs}

Generate your analysis in valid JSON format with the following keys:
- summary: Short title of the issue
- probable_root_cause: Detailed explanation
- recommended_fix: Array of string steps to fix
- evidence: Array of log lines proving the root cause
"""

    if ai_provider == "azure_foundry":
        # Use Azure AI Foundry
        azure_endpoint = os.getenv("AZURE_AI_FOUNDRY_ENDPOINT") or os.getenv("AZURE_OPENAI_ENDPOINT")
        azure_api_key = os.getenv("AZURE_AI_FOUNDRY_API_KEY") or os.getenv("AZURE_OPENAI_API_KEY")
        azure_deployment = os.getenv("AZURE_AI_FOUNDRY_DEPLOYMENT_NAME") or os.getenv("AZURE_OPENAI_DEPLOYMENT")
        
        if not azure_endpoint or not azure_api_key:
            raise HTTPException(status_code=500, detail="Azure AI Foundry credentials not configured")
            
        try:
            from langchain_openai import AzureChatOpenAI
            from langchain_core.messages import HumanMessage, SystemMessage
            
            chat = AzureChatOpenAI(
                azure_endpoint=azure_endpoint,
                api_key=azure_api_key,
                azure_deployment=azure_deployment,
                api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2023-05-15"),
                temperature=0.1,
            )
            
            res = chat.invoke([
                SystemMessage(content="You are a helpful AI that returns strictly valid JSON."),
                HumanMessage(content=prompt)
            ])
            
            content = res.content
            json_match = re.search(r'(\{.*\})', content, re.DOTALL)
            if json_match:
                content = json_match.group(1)
            parsed = json.loads(content)
            
            return {
                "status": "success",
                "analysis": {
                    "status": "ai_generated",
                    "provider": "azure_foundry",
                    "summary": parsed.get("summary", "Analysis"),
                    "probable_root_cause": parsed.get("probable_root_cause", ""),
                    "recommended_fix": parsed.get("recommended_fix", []),
                    "evidence": parsed.get("evidence", []),
                    "ai_provider_status": "available"
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Azure AI Foundry error: {str(e)}")

    elif ai_provider == "bedrock":
        try:
            import boto3
            from langchain_aws import ChatBedrock
            from langchain_core.messages import HumanMessage, SystemMessage
            
            aws_region = os.getenv("AWS_REGION", "us-east-1")
            bedrock_client = boto3.client("bedrock-runtime", region_name=aws_region)
            chat = ChatBedrock(
                client=bedrock_client,
                model_id=os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"),
                model_kwargs={"temperature": 0.1}
            )
            
            res = chat.invoke([
                SystemMessage(content="You are a helpful AI that returns strictly valid JSON."),
                HumanMessage(content=prompt)
            ])
            
            content = res.content
            json_match = re.search(r'(\{.*\})', content, re.DOTALL)
            if json_match:
                content = json_match.group(1)
            parsed = json.loads(content)
            
            return {
                "status": "success",
                "analysis": {
                    "status": "ai_generated",
                    "provider": "bedrock",
                    "summary": parsed.get("summary", "Analysis"),
                    "probable_root_cause": parsed.get("probable_root_cause", ""),
                    "recommended_fix": parsed.get("recommended_fix", []),
                    "evidence": parsed.get("evidence", []),
                    "ai_provider_status": "available"
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Amazon Bedrock error: {str(e)}")
            
    raise HTTPException(status_code=500, detail="No valid AI provider configured")
