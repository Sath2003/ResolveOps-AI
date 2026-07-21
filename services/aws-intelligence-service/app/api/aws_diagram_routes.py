from fastapi import APIRouter
from app.services.aws_architecture_diagram_service import AWSArchitectureDiagramService
# Importing the mocked DB cache from the resources route for prototyping purposes
from app.api.aws_resource_routes import _db_cache

router = APIRouter(prefix="/api/v1/aws/architecture", tags=["AWS Architecture"])

@router.get("")
def get_architecture_diagram():
    """
    Generates and returns a Mermaid JS diagram of all discovered AWS resources.
    """
    resources = _db_cache.get("resources", [])
    mermaid_code = AWSArchitectureDiagramService.generate_mermaid_diagram(resources)
    return {
        "diagram": mermaid_code,
        "format": "mermaid"
    }

@router.post("/generate")
def generate_architecture_diagram():
    # Similar to above, but might trigger a fresh async scan in production
    return get_architecture_diagram()
