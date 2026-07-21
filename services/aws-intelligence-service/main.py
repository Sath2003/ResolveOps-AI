from fastapi import FastAPI
from app.api.aws_connection_routes import router as aws_connection_router
from app.api.aws_resource_routes import router as aws_resource_router
from app.api.aws_diagram_routes import router as aws_diagram_router
from app.api.aws_rca_routes import router as aws_rca_router

app = FastAPI(title="aws-intelligence-service")

app.include_router(aws_connection_router)
app.include_router(aws_resource_router)
app.include_router(aws_diagram_router)
app.include_router(aws_rca_router)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "aws-intelligence-service"}
