#!/usr/bin/env bash
# Deploy the current `dev` to staging (host .32; .33 is production only).
#
# Staging is a mirror of `dev`, exactly like production mirrors `master`: this
# script only fast-forwards and it refuses a checkout with modified tracked
# files. Secrets (A2A tokens) live in an ignored file next to the checkout and
# are always supplied, so the office can actually talk to the mesh.
#
# Usage:
#   bash scripts/deploy_staging.sh
#
# Override the target with DEPLOY_HOST=user@host if staging ever moves again.
set -euo pipefail

# Staging lives on .32 so .33 can be dedicated to production/master.
HOST="${DEPLOY_HOST:-rumi@192.168.3.32}"
DIR="${DEPLOY_DIR:-/home/rumi/projects/office-suite-dev}"
BRANCH="${DEPLOY_BRANCH:-dev}"
HEALTH_PORT="${HEALTH_PORT:-13579}"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

say "Checking the release in this repo"
git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null || fail "origin/$BRANCH is unreachable"

say "Checking the staging checkout ($HOST:$DIR)"
DRIFT="$(ssh -o BatchMode=yes "$HOST" "cd '$DIR' && git status --porcelain --untracked-files=no")"
[ -z "$DRIFT" ] || { printf '%s\n' "$DRIFT" >&2; fail "tracked files are modified on staging; it must stay a clean mirror of $BRANCH"; }

say "Pulling $BRANCH"
ssh -o BatchMode=yes "$HOST" "cd '$DIR' && git fetch -q origin && git pull --ff-only origin $BRANCH"
REMOTE_SHA="$(ssh -o BatchMode=yes "$HOST" "cd '$DIR' && git rev-parse HEAD")"
[ "$REMOTE_SHA" = "$(git rev-parse "origin/$BRANCH")" ] || fail "staging HEAD $REMOTE_SHA does not match origin/$BRANCH"

say "Building and restarting"
# Two env files: the tracked profile plus the untracked secrets (A2A tokens).
ssh -o BatchMode=yes "$HOST" "cd '$DIR' && docker compose --env-file .env.development --env-file .env.development.secrets up -d --build"

say "Waiting for health"
for _ in $(seq 1 40); do
  if ssh -o BatchMode=yes "$HOST" "curl -fsS -m 3 http://127.0.0.1:$HEALTH_PORT/healthz >/dev/null 2>&1"; then
    break
  fi
  sleep 2
done
ssh -o BatchMode=yes "$HOST" "curl -fsS -m 5 http://127.0.0.1:$HEALTH_PORT/healthz" >/dev/null \
  || fail "health check failed on port $HEALTH_PORT"

say "Checking A2A"
A2A="$(ssh -o BatchMode=yes "$HOST" "curl -fsS -m 5 http://127.0.0.1:$HEALTH_PORT/api/a2a")"
printf '%s' "$A2A" | grep -q '"can_send": *true' \
  || fail "A2A can_send is false; the deployment has no peer token"

say "Deployed to staging"
printf 'branch %s -> %s\n' "$BRANCH" "$REMOTE_SHA"
printf 'healthz               OK\n'
printf 'A2A can_send          true\n'
