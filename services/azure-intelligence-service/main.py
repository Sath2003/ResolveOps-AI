from fastapi import FastAPI

app = FastAPI(title="azure-intelligence-service")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "azure-intelligence-service"}
