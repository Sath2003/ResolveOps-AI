# 11 — RAG & Knowledge Base Integration

## Retrieval Architecture
Historical incident runbooks and architectural post-mortems are retrieved via Amazon Bedrock Knowledge Bases (`bedrock_knowledge_base`).
If unavailable, FAISS local vector storage acts as an optional fallback (`RAG_FAISS_FALLBACK_ENABLED=false` by default).
