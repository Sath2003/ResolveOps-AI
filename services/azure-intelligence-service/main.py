import os
import json
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from sqlalchemy import create_engine, Column, String, JSON
from sqlalchemy.orm import sessionmaker, declarative_base
from kubernetes_helper import fetch_aks_kubeconfig, get_kubernetes_workloads

app = FastAPI(title="azure-intelligence-service")

DATABASE_URL = os.getenv("DATABASE_URL")
SessionLocal = None

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    try:
        engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    except Exception as e:
        print(f"Failed to connect to database: {e}")

Base = declarative_base()

class User(Base):
    __tablename__ = "nexus_users"
    email = Column(String(255), primary_key=True)
    integrations = Column(JSON, nullable=True)

def get_user_integrations(email: str) -> dict:
    if not SessionLocal:
        return {}
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user and user.integrations:
            return json.loads(user.integrations) if isinstance(user.integrations, str) else user.integrations
        return {}
    except Exception as e:
        print(f"Error querying integrations: {e}")
        return {}
    finally:
        db.close()

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "azure-intelligence-service"}

@app.get("/api/v1/kubernetes/workloads")
def get_workloads(
    tenant_email: str = Query(..., description="Email identifying the tenant"),
    cluster_name: Optional[str] = Query(None, description="Optional target AKS cluster name"),
    resource_group: Optional[str] = Query(None, description="Optional target Azure Resource Group")
):
    """
    Retrieves sanitized Kubernetes workloads (pods, nodes, deployments, events) for the tenant.
    Avoids transmitting raw kubeconfig over the network.
    """
    integrations = get_user_integrations(tenant_email)
    azure_config = integrations.get("azure", {})
    connected = azure_config.get("connected", False)
    
    if not connected:
        # Fallback to returning clean, structured mock telemetry for testing/local development
        return {
            "cluster_id": cluster_name or "aks-prod-cluster-01",
            "provider": "Azure Kubernetes Service (Sanitized Mock)",
            "region": "eastus",
            "nodes": [
                {"name": "aks-nodepool1-vm-0", "status": "Ready", "cpu_util": "48%", "mem_util": "62%"},
                {"name": "aks-nodepool1-vm-1", "status": "Ready", "cpu_util": "35%", "mem_util": "50%"},
                {"name": "aks-nodepool1-vm-2", "status": "Ready", "cpu_util": "72%", "mem_util": "85%"}
            ],
            "pods": [
                {"name": "payment-api-cf7d685-z8a9s", "namespace": "production", "status": "Running", "restarts": 0, "cpu": "120m", "mem": "240Mi"},
                {"name": "auth-service-5421c9b-h2n3s", "namespace": "production", "status": "Running", "restarts": 2, "cpu": "80m", "mem": "150Mi"},
                {"name": "log-collector-flb-8h1n2", "namespace": "kube-system", "status": "Running", "restarts": 0, "cpu": "50m", "mem": "95Mi"},
                {"name": "notification-worker-6b998-f2nsd", "namespace": "production", "status": "Running", "restarts": 1, "cpu": "110m", "mem": "180Mi"}
            ],
            "deployments": [
                {"name": "payment-api", "desired": 3, "ready": 3, "updated": 3},
                {"name": "auth-service", "desired": 2, "ready": 2, "updated": 2},
                {"name": "notification-worker", "desired": 2, "ready": 2, "updated": 2}
            ],
            "events": [
                {"namespace": "production", "involved_object": "Pod/payment-api-cf7d685-z8a9s", "reason": "Started", "message": "Started container payment-api", "count": 1}
            ]
        }

    # If Azure is connected, try to fetch the real kubeconfig and get workloads
    try:
        from azure.identity import ClientSecretCredential
        
        creds = azure_config.get("credentials", {})
        client_id = creds.get("client_id")
        client_secret = creds.get("client_secret")
        tenant_id = creds.get("tenant_id")
        subscription_id = azure_config.get("subscription_id") or creds.get("subscription_id")
        
        if not (client_id and client_secret and tenant_id and subscription_id):
            raise HTTPException(status_code=400, detail="Azure integration is incomplete or missing credentials")
            
        credential = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret
        )
        
        # Determine RG and Cluster Name from query or fallback to integrations
        rg = resource_group or azure_config.get("resource_group", "rg-resolveops-prod")
        cluster = cluster_name or azure_config.get("cluster_name", "aks-resolveops-prod")
        
        kubeconfig_yaml = fetch_aks_kubeconfig(credential, subscription_id, rg, cluster)
        workloads = get_kubernetes_workloads(kubeconfig_yaml)
        return workloads
        
    except Exception as e:
        # Returns a sanitized connection failure summary instead of throwing raw traceback
        return {
            "enabled": False,
            "connection_status": "failed",
            "reason": "connection_failed",
            "message": f"Could not connect to AKS cluster: {str(e)}",
            "recommended_action": "Check subscription permissions and service principal assignment."
        }
