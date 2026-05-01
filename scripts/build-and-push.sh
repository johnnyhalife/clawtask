#!/usr/bin/env bash
set -euo pipefail

IMAGE="johnnyhalife/clawtask"
TAG="latest"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Building $IMAGE:$TAG from $ROOT"
docker build --platform linux/amd64 -t "$IMAGE:$TAG" .

echo "→ Pushing $IMAGE:$TAG"
docker push "$IMAGE:$TAG"

echo "✓ Done: $IMAGE:$TAG"
