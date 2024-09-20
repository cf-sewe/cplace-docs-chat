#!/bin/bash

echo ">>> Building frontend"
docker build --build-arg='NEXT_PUBLIC_API_BASE_URL=https://chat-api.example.com' -t cplace-docs-chat:latest frontend
echo ">>> Building backend"
docker build -t cplace-docs-chat-api:latest .