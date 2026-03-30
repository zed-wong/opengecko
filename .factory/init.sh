#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bun install --frozen-lockfile
mkdir -p data
mkdir -p data/coingecko-snapshots
mkdir -p .factory/research
mkdir -p .factory/validation
