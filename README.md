# cplace Docs Chat

This is a Gen-AI chat for the cplace documentation.
It is currently intended for demonstration purposes only - it is **not** intended to be used in production.

## Use-Case

The main use case of this chat is to provide a conversational interface to the cplace documentation.
It is not intended for forth and back conversation, but rather for querying the documentation.

Therefore, the LLM will be configured to respond concisely (up to 200 words) and include citations of the sources.

## Components

![cplace Docs Chat Overview](cplace-docs-chat-overview.png)

- Elasticsearch 8.x hosted on IDP Docker Swarm
- LangChain Chat API and Frontend hosted on IDP Docker Swarm
- An ingestion script that reads the cplace documentation and indexes it into Elasticsearch
- SQLite database as the record manager for the ingestion script
- Azure OpenAI for Embedding and Chat (LLM).
