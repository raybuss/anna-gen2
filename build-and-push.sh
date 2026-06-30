#!/usr/bin/env bash
set -euo pipefail

IMAGE="localhost:32000/anna-gen2:v1"

docker build -t "$IMAGE" .
docker push "$IMAGE"

echo "Pushed $IMAGE"
echo ""
echo "Apply manifests with:"
echo "  kubectl apply -f k8s/"
