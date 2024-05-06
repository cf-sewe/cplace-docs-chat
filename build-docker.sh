#!/bin/bash

# URL of the chat API used by frontend
export NEXT_PUBLIC_API_BASE_URL=https://chat-api.example.com

echo ">>> Building frontend"
docker build -t cplace-docs-chat:latest frontend
echo ">>> Building backend"
docker build -t cplace-docs-chat-api:latest .