FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Note: docker-evidence-adapter needs root/docker group access for /var/run/docker.sock
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
