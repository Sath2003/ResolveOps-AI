from fastapi import FastAPI

app = FastAPI(title="auth-service")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "auth-service"}
