"""Main entrypoint for the app."""

import asyncio
import os
from typing import Optional, Union, Dict, Any
from uuid import UUID

import langsmith
from chain import ChatRequest, answer_chain
from fastapi import FastAPI, HTTPException

from fastapi.middleware.cors import CORSMiddleware
from langserve import add_routes
from langsmith import Client
from pydantic import BaseModel

from constants import RESPONSE_TEMPLATE, REPHRASE_TEMPLATE, RETRIEVER_CONFIG
from chain import llm


def print_env_variables():
    # List of environment variables and their sensitivity status
    env_vars = {
        "EXTERNAL_URL": False,
        "ELASTICSEARCH_URL": False,
        "ELASTICSEARCH_API_KEY": True,
        "ELASTICSEARCH_INDEX_NAME": False,
        "DISCUSS_ES_INDEX_NAME": False,
        "AZURE_OPENAI_ENDPOINT": False,
        "AZURE_OPENAI_API_KEY": True,
        "LANGCHAIN_TRACING_V2": False,
        "LANGCHAIN_API_KEY": True,
        "LANGCHAIN_PROJECT": False,
    }
    print("Environment Variables:")
    # Print each environment variable with appropriate masking for sensitive values
    for var, is_sensitive in env_vars.items():
        value = os.getenv(var, "Not Defined")
        if is_sensitive and value != "Not Defined":
            value = "****"
        print(f"  {var}: {value}")


print_env_variables()

# Create a LangSmith client instance
client = Client()

# Create a FastAPI application instance
app = FastAPI(
    title="cplace Chatbot API",
    version="1.0",
    docs_url=None,  # Disable docs (Swagger UI)
    redoc_url=None,  # Disable redoc
)


# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("EXTERNAL_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Type"],
)

# Add routes for chat functionality
add_routes(
    app,
    answer_chain.with_types(input_type=ChatRequest),
    path="/chat",
    config_keys=["metadata", "configurable", "tags"],
    playground_type="chat",
    disabled_endpoints=["playground"],
    include_callback_events=False,
    enable_feedback_endpoint=True,
    enable_public_trace_link_endpoint=True,
)


# Define a Pydantic model for send feedback request body
class SendFeedbackBody(BaseModel):
    run_id: UUID
    key: str = "user_score"

    score: Union[float, int, bool, None] = None
    feedback_id: Optional[UUID] = None
    comment: Optional[str] = None


# Define a POST endpoint to send feedback
@app.post("/feedback")
async def send_feedback(body: SendFeedbackBody):
    # Create feedback using the LangSmith client
    try:
        client.create_feedback(
            body.run_id,
            body.key,
            score=body.score,
            comment=body.comment,
            feedback_id=body.feedback_id,
        )
    except langsmith.utils.LangSmithError as e:
        # Handle LangSmithError and return a meaningful error response
        return {
            "result": "Failed to create feedback: " + e.detail,
            "code": 500,
        }
    # Return a success response
    return {"result": "posted feedback successfully", "code": 200}


@app.get("/rag-config")
async def get_rag_config() -> Dict[str, Any]:
    """Endpoint to get the RAG pipeline configuration."""
    return {
        "prompts": {
            "response_prompt": RESPONSE_TEMPLATE,
            "rephrase_prompt": REPHRASE_TEMPLATE,
        },
        "retriever": {
            "algorithm": RETRIEVER_CONFIG["algorithm"],
            "parameters": RETRIEVER_CONFIG["parameters"],
        },
        "llm": {
            "provider": "Azure OpenAI",
            "model": llm.model_name,
            "version": llm.model_version,
            "temperature": llm.temperature,
        },
        "knowledge_base": {
            "docs_index": os.getenv("ELASTICSEARCH_INDEX_NAME", "default-docs-index"),
            "discuss_index": os.getenv(
                "DISCUSS_ES_INDEX_NAME", "default-discuss-index"
            ),
        },
    }


# Run the application using Uvicorn if this is the main module
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
