import os

STORAGE_ACCOUNT_NAME = os.getenv("STORAGE_ACCOUNT_NAME")
BLOB_CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME")
LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR", "./data/artifacts")

blob_service_client = None
container_client = None
use_local_storage = True

def init_storage():
    global blob_service_client, container_client, use_local_storage
    if not STORAGE_ACCOUNT_NAME or not BLOB_CONTAINER_NAME or STORAGE_ACCOUNT_NAME.lower() == "local":
        print(f"Using Local Filesystem Storage (directory: {LOCAL_STORAGE_DIR})")
        use_local_storage = True
        os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)
        return

    try:
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import BlobServiceClient
        account_url = f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net"
        credential = DefaultAzureCredential()
        blob_service_client = BlobServiceClient(account_url=account_url, credential=credential)
        container_client = blob_service_client.get_container_client(BLOB_CONTAINER_NAME)
        use_local_storage = False
        print(f"Blob Storage Client initialized for account {STORAGE_ACCOUNT_NAME}.")
    except Exception as e:
        print(f"Failed to initialize Blob Storage Client: {e}. Falling back to Local Filesystem Storage.")
        use_local_storage = True
        os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)

def upload_artifact_blob(tenant_id: str, artifact_type: str, artifact_id: str, file_name: str, content: bytes, content_type: str) -> str:
    """Uploads bytes content to Azure Blob Storage or Local Filesystem Storage and returns the path."""
    blob_path = f"tenants/{tenant_id}/artifacts/{artifact_type}/{artifact_id}/{file_name}"
    
    if use_local_storage:
        local_path = os.path.join(LOCAL_STORAGE_DIR, blob_path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(content)
        return blob_path
        
    if not container_client:
        raise Exception("Azure Blob Storage client is not initialized.")
    
    blob_client = container_client.get_blob_client(blob_path)
    blob_client.upload_blob(content, overwrite=True)
    
    from azure.storage.blob import ContentSettings
    content_settings = ContentSettings(content_type=content_type)
    blob_client.set_http_headers(content_settings)
    return blob_path

def download_artifact_blob(blob_path: str) -> bytes:
    """Downloads blob content as bytes from Azure Blob Storage or Local Filesystem Storage."""
    if use_local_storage:
        local_path = os.path.join(LOCAL_STORAGE_DIR, blob_path)
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local artifact not found at {local_path}")
        with open(local_path, "rb") as f:
            return f.read()
            
    if not container_client:
        raise Exception("Azure Blob Storage client is not initialized.")
        
    blob_client = container_client.get_blob_client(blob_path)
    return blob_client.download_blob().readall()
