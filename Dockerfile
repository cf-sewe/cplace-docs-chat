FROM python:3.12-slim

LABEL org.opencontainers.image.title="cplace-docs-chat-api" \
      org.opencontainers.image.description="cplace Docs Chat (API)" \
      org.opencontainers.image.vendor="collaboration Factory AG" \
      org.opencontainers.image.authors="operations@cplace.com"

# Environment variables; normally loaded from a .env file
ENV EXTERNAL_URL="https://chat.example.com" \
    RECORD_MANAGER_DB_URL="sqlite:///data/record_manager.sqlite" \
    ELASTICSEARCH_URL="https://elasticsearch.example.com" \
    ELASTICSEARCH_API_KEY="SECRET" \
    ELASTICSEARCH_INDEX_NAME="cplace-docs-chat" \
    AZURE_OPENAI_ENDPOINT="https://example.openai.azure.com/" \
    AZURE_OPENAI_API_KEY="SECRET" \
    OPENAI_API_VERSION="2024-02-01" \
    LANGCHAIN_TRACING_V2="false" \
    LANGCHAIN_API_KEY="SECRET" \
    LANGCHAIN_PROJECT="default"

WORKDIR /app

# Install poetry and project dependencies in one layer to improve build performance.
COPY ./pyproject.toml ./poetry.lock* /app/
COPY ./backend/*.py /app/backend/

RUN set -e;\
    pip install poetry; \
    poetry config virtualenvs.create false; \
    poetry install --no-interaction --no-ansi --no-root; \
    groupadd -r appuser;\
    useradd -r -g appuser -d /app -s /sbin/nologin appuser; \
    chown -R appuser:appuser /app

EXPOSE 8080

CMD ["uvicorn", "--app-dir=/app/backend", "main:app", "--host", "0.0.0.0", "--port", "8080"]
