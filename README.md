# cplace Docs Chat

This is a Gen-AI chat for the cplace documentation.
It is currently intended for demonstration purposes only - it is **not** intended to be used in production.

## Use-Case

The main use case of this chat is to provide a conversational interface to the cplace documentation.
It is not intended for forth and back conversation, but rather for querying the documentation.

Therefore, the LLM will be configured to respond concise (up to 200 words) and include citations of the sources.

## Components

- Elasticsearch 8.x hosted on IDP Docker Swarm
- LangChain Chat API and Frontend hosted on IDP Docker Swarm
- A ingestion script that reads the cplace documentation and indexes it into Elasticsearch
- SQLite database as record manager
- Azure OpenAI for Embedding and LLM.
  Note: Azure OpenAI does not provide the latest models in EU regions, but using GPT 3.5 Turbo is sufficient for this use case.

## Data Ingestion

The data ingestion script is a [Python script](./backend/ingest.py).
It reads the customer facing cplace documentation and indexes it into Elasticsearch.

Data Sources:

1. cplace Documentation will be provided as a Markdown bundle file ([created](https://github.com/collaborationFactory/cplace-jenkins/blob/master/pipelines/build-rag-index.jdp) by IDP Jenkins).
   It contains markdown files from all relevant product repositories.
2. cplace Release Notes: https://roadmap.cplace.io/tabs/1-launched
3. Low-Code API: https://docs.cplace.io/lowcode/api/
4. API Changes: https://docs.cplace.io/api-changes-en/

The [LangChain indexing API](https://python.langchain.com/docs/modules/data_connection/indexing/) is used to keep documents in sync with the Elasticsearch index.

Specifically, it helps:

- Avoid writing duplicated content into the vector store
- Avoid re-writing unchanged content
- Avoid re-computing embeddings over unchanged content

A SQLite database is used as record manager.