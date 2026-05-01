#!/usr/bin/env bash
set -euo pipefail

IMAGE="johnnyhalife/clawtask"
TAG="latest"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Building $IMAGE:$TAG from $ROOT (arm64)"
docker buildx build --platform linux/arm64 -t "$IMAGE:$TAG" --push .

echo "✓ Done: $IMAGE:$TAG"
