#!/usr/bin/env bash
# docker-build-fast.sh — build on the host, package into Docker
# Usage: ./scripts/docker-build-fast.sh [image-tag]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-clawtask:latest}"

echo "▶ Building Next.js on host..."
cd "$ROOT"
npm run build

echo "▶ Packaging into Docker image ($TAG)..."
docker build -f Dockerfile.fast -t "$TAG" .

echo "✓ Done: $TAG"
