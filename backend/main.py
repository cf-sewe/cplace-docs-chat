"""Main entrypoint for the app."""

import asyncio
import os
from typing import Optional, Union
from uuid import UUID

import langsmith
from chain import ChatRequest, answer_chain
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langserve import add_routes
from langsmith import Client
from pydantic import BaseModel

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
        "LANGCHAIN_PROJECT": False
    }
    print("Environment Variables:")
    # Print each environment variable with appropriate masking for sensitive values
    for var, is_sensitive in env_vars.items():
        value = os.getenv(var, 'Not Defined')
        if is_sensitive and value != 'Not Defined':
            value = '****'
        print(f"  {var}: {value}")

print_env_variables()

# Create a LangSmith client instance
client = Client()

# Create a FastAPI application instance
app = FastAPI(
    title="cplace Chatbot API",
    version="1.0",
    docs_url=None, # Disable docs (Swagger UI)
    redoc_url=None, # Disable redoc
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
    answer_chain,
    path="/chat",
    input_type=ChatRequest,
    config_keys=["metadata", "configurable", "tags"],
    playground_type="chat",
    disabled_endpoints=[],
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


# # Define a helper function to run a blocking function asynchronously
# async def _arun(func, *args, **kwargs):
#     return await asyncio.get_running_loop().run_in_executor(None, func, *args, **kwargs)


# # Define a helper function to get a public trace URL for a LangSmith run
# async def aget_trace_url(run_id: str) -> str:
#     max_retries = 5
#     for i in range(max_retries):
#         try:
#             # Try to read the run using the LangSmith client
#             await _arun(client.read_run, run_id)
#             break
#         except langsmith.utils.LangSmithError:
#             # If an error occurs, wait for 1 second and retry
#             await asyncio.sleep(1**i)
#     else:
#         # If all retries fail, raise an exception
#         raise HTTPException(status_code=500, detail="Failed to read run")

#     # Check if the run is shared
#     if await _arun(client.run_is_shared, run_id):
#         # Return the shared link
#         return await _arun(client.read_run_shared_link, run_id)
#     # Otherwise, share the run and return the link
#     return await _arun(client.share_run, run_id)


# # Define a Pydantic model for get trace request body
# class GetTraceBody(BaseModel):
#     run_id: UUID


# Define a POST endpoint to get a trace URL
# @app.post("/get_trace")
# async def get_trace(body: GetTraceBody):
#     run_id = body.run_id
#     if run_id is None:
#         # Return an error response if LangSmith run ID is missing
#         return {
#             "result": "No LangSmith run ID provided",
#             "code": 400,
#         }
#     try:
#         # Return the trace URL
#         return await aget_trace_url(str(run_id))
#     except HTTPException as e:
#         return {
#             "result": "HTTP Exception: " + e.detail,
#             "code": 500,
#         }


# Run the application using Uvicorn if this is the main module
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
