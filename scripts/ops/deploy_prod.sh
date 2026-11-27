#!/usr/bin/env bash
# Deploy the released version to the live server.
#
# Production is a pure mirror of `master`: this script never merges, never
# commits, and refuses to run when the server checkout has local changes to
# tracked files. Environment-specific things (secrets, container name) live in
# untracked files next to the checkout, so `git pull` is always clean.
#
# Usage:
#   bash scripts/deploy_prod.sh              # deploy origin/master
#   bash scripts/deploy_prod.sh v2.2.3       # deploy a specific tag
set -euo pipefail

HOST="${DEPLOY_HOST:-rumi@192.168.3.33}"
DIR="${DEPLOY_DIR:-/home/rumi/projects/office-suite}"
REF="${1:-master}"
HEALTH_PORT="${HEALTH_PORT:-8090}"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

say "Checking the release in this repo"
git rev-parse --verify --quiet "$REF" >/dev/null || fail "ref '$REF' does not exist locally"
LOCAL_SHA="$(git rev-parse "$REF")"
git ls-remote --exit-code origin "refs/heads/master" >/dev/null 2>&1 || fail "origin/master is unreachable"

say "Checking the server checkout ($HOST:$DIR)"
DRIFT="$(ssh -o BatchMode=yes "$HOST" "cd '$DIR' && git status --porcelain --untracked-files=no")"
if [ -n "$DRIFT" ]; then
  printf '%s\n' "$DRIFT" >&2
  fail "tracked files are modified on the server; prod must stay a clean mirror. Move overrides to untracked files first."
fi

say "Pulling $REF"
ssh -o BatchMode=yes "$HOST" "cd '$DIR' && git fetch --tags -q origin && git checkout -q master 2>/dev/null || true; git pull --ff-only origin master"
REMOTE_SHA="$(ssh -o BatchMode=yes "$HOST" "cd '$DIR' && git rev-parse HEAD")"
[ "$REMOTE_SHA" = "$(git rev-parse master)" ] || fail "server HEAD $REMOTE_SHA does not match origin/master"

say "Building and restarting"
ssh -o BatchMode=yes "$HOST" "cd '$DIR' && docker compose --env-file .env.production --env-file .env.production.secrets up -d --build"

say "Waiting for health"
for _ in $(seq 1 40); do
  if ssh -o BatchMode=yes "$HOST" "curl -fsS -m 3 http://127.0.0.1:$HEALTH_PORT/healthz >/dev/null 2>&1"; then
    break
  fi
  sleep 2
done
ssh -o BatchMode=yes "$HOST" "curl -fsS -m 5 http://127.0.0.1:$HEALTH_PORT/healthz" >/dev/null \
  || fail "health check failed on port $HEALTH_PORT"

say "Deployed"
printf 'local  %s -> %s\n' "$REF" "$LOCAL_SHA"
printf 'server HEAD           %s\n' "$REMOTE_SHA"
printf 'healthz               OK\n'
