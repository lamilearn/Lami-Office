#!/usr/bin/env bash
# ==============================================================================
# GitHub Remote Push Script for Lami AI Office Suite
# Checks repository readiness and pushes both master and dev branches.
#
# Usage: ./scripts/push_to_github.sh
# ==============================================================================

set -eo pipefail

REPO_URL="${1:-${GIT_REMOTE_URL:-git@github.com:lamilearn/Lami-Office.git}}"
REMOTE_NAME="origin"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE} Lami AI Office — GitHub Push Utility${NC}"
echo -e " Target Remote: ${YELLOW}${REPO_URL}${NC}"
echo -e "${BLUE}================================================================${NC}"

# Check git status
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Must be run from the root of the git repository.${NC}"
    exit 1
fi

# Ensure remote origin is configured
CURRENT_REMOTE=$(git remote get-url "${REMOTE_NAME}" 2>/dev/null || echo "")
if [ -z "${CURRENT_REMOTE}" ]; then
    echo -e "Adding remote ${REMOTE_NAME} -> ${REPO_URL}"
    git remote add "${REMOTE_NAME}" "${REPO_URL}"
elif [ "${CURRENT_REMOTE}" != "${REPO_URL}" ]; then
    # Origin preservation guard: Do not overwrite an existing valid and reachable remote unless explicitly requested
    if [ -z "${1:-}" ] && [ -z "${GIT_REMOTE_URL:-}" ] && git ls-remote "${CURRENT_REMOTE}" >/dev/null 2>&1; then
        echo -e "${GREEN}Preserving currently reachable remote ${REMOTE_NAME}: ${CURRENT_REMOTE}${NC}"
        REPO_URL="${CURRENT_REMOTE}"
    else
        echo -e "${YELLOW}Updating remote ${REMOTE_NAME}: ${CURRENT_REMOTE} -> ${REPO_URL}${NC}"
        git remote set-url "${REMOTE_NAME}" "${REPO_URL}"
    fi
fi

# Verify GitHub SSH Authentication
echo -n "Checking GitHub SSH authentication ... "
AUTH_OUTPUT=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 || true)
if echo "${AUTH_OUTPUT}" | grep -q "successfully authenticated"; then
    echo -e "${GREEN}AUTHENTICATED${NC}"
    echo "  ${AUTH_OUTPUT}"
else
    echo -e "${RED}AUTH FAILED${NC}"
    echo "  ${AUTH_OUTPUT}"
    exit 1
fi

# Check if repository exists on GitHub
echo -n "Checking reachability of ${REPO_URL} ... "
if git ls-remote "${REPO_URL}" >/dev/null 2>&1; then
    echo -e "${GREEN}REPOSITORY FOUND${NC}"
    
    echo -e "\n${BLUE}Pushing baseline branch 'master' to ${REMOTE_NAME} ...${NC}"
    git rev-parse --verify master >/dev/null 2>&1 && git push -u "${REMOTE_NAME}" master || echo "Master branch skipped or already up-to-date"

    echo -e "\n${BLUE}Pushing development branch 'dev' to ${REMOTE_NAME} ...${NC}"
    git push -u "${REMOTE_NAME}" dev

    echo -e "\n${GREEN}✅ Successfully pushed both master and dev branches to GitHub!${NC}"
    git branch -a -v
    exit 0
else
    echo -e "${RED}NOT FOUND${NC}"
    echo -e "${YELLOW}----------------------------------------------------------------${NC}"
    echo -e "${YELLOW}Repository 'lamilearn/Lami-Office' has not yet been created on GitHub.${NC}"
    echo -e "Please create an empty repository named 'Lami-Office' under the"
    echo -e "'lamilearn' organization at:"
    echo -e "  👉 https://github.com/organizations/lamilearn/repositories/new"
    echo -e "(Do NOT initialize with README, .gitignore, or license)."
    echo -e "Once created, re-run this script:"
    echo -e "  ./scripts/push_to_github.sh"
    echo -e "${YELLOW}----------------------------------------------------------------${NC}"
    exit 1
fi
