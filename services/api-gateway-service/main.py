# main.py — API Gateway Service entrypoint
# This imports and re-exports the full monolithic FastAPI app from api.py.
# As the microservices mature, routes will be split out to their own services.
from api import app  # noqa: F401 — 'app' is the FastAPI instance used by uvicorn
