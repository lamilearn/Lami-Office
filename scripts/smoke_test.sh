#!/usr/bin/env bash
# ==============================================================================
# Smoke Test Verification Script for Lami AI Office Suite
# Probes all 7 health and status endpoints across ai-office and lami-office-react.
#
# Usage: ./scripts/smoke_test.sh [HOST] [AI_PORT] [LAMI_PORT]
# Example: ./scripts/smoke_test.sh 192.168.3.33 8088 8090
# ==============================================================================

set -uo pipefail

HOST="${1:-127.0.0.1}"
AI_PORT="${2:-8088}"
LAMI_PORT="${3:-8090}"
TIMEOUT=10

FAILED_TESTS=0
TOTAL_TESTS=7

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE} Starting Smoke Test Probes for Lami AI Office Suite${NC}"
echo -e " Target Host   : ${YELLOW}${HOST}${NC}"
echo -e " ai-office     : ${YELLOW}http://${HOST}:${AI_PORT}${NC}"
echo -e " lami-office   : ${YELLOW}http://${HOST}:${LAMI_PORT}${NC}"
echo -e "${BLUE}================================================================${NC}"

probe_endpoint() {
    local test_num="$1"
    local service="$2"
    local name="$3"
    local url="$4"
    local expected_pattern="$5"

    echo -ne "[${test_num}/${TOTAL_TESTS}] Probing ${service} ${name} (${url}) ... "

    # Perform GET request, capture HTTP code and body
    local response
    local http_code
    local body

    response=$(curl -sS -m "${TIMEOUT}" -w "\n%{http_code}" "${url}" 2>&1)
    local curl_exit=$?

    if [ ${curl_exit} -ne 0 ]; then
        echo -e "${RED}FAILED${NC} (Curl error: ${response})"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    http_code=$(echo "${response}" | tail -n1)
    body=$(echo "${response}" | sed '$d')

    if [ "${http_code}" != "200" ]; then
        echo -e "${RED}FAILED${NC} (HTTP ${http_code}, expected 200)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    if echo "${body}" | grep -Eq "${expected_pattern}"; then
        echo -e "${GREEN}PASS${NC} (HTTP 200, payload validated)"
        return 0
    else
        echo -e "${RED}FAILED${NC} (Payload pattern '${expected_pattern}' not matched)"
        echo -e "   Payload preview: $(echo "${body}" | head -c 200)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo -e "\n${BLUE}--- Probing ai-office (Port ${AI_PORT}) ---${NC}"
probe_endpoint 1 "ai-office" "/api/health" "http://${HOST}:${AI_PORT}/api/health" '"status"[[:space:]]*:[[:space:]]*"ok"'
probe_endpoint 2 "ai-office" "/api/boss" "http://${HOST}:${AI_PORT}/api/boss" '"id"[[:space:]]*:[[:space:]]*"lami"'
probe_endpoint 3 "ai-office" "/api/agents" "http://${HOST}:${AI_PORT}/api/agents" '"agents"'
probe_endpoint 4 "ai-office" "GET / (HTML)" "http://${HOST}:${AI_PORT}/" '<title>|<html'

echo -e "\n${BLUE}--- Probing lami-office-react (Port ${LAMI_PORT}) ---${NC}"
probe_endpoint 5 "lami-office" "/healthz" "http://${HOST}:${LAMI_PORT}/healthz" '"ok"[[:space:]]*:[[:space:]]*true'
probe_endpoint 6 "lami-office" "/api/config" "http://${HOST}:${LAMI_PORT}/api/config" '"mode"'
probe_endpoint 7 "lami-office" "GET / (HTML)" "http://${HOST}:${LAMI_PORT}/" '<title>|<html'

echo -e "\n${BLUE}================================================================${NC}"
if [ ${FAILED_TESTS} -eq 0 ]; then
    echo -e "${GREEN}✅ ALL ${TOTAL_TESTS} SMOKE TESTS PASSED SUCCESSFULLY!${NC}"
    echo -e "${BLUE}================================================================${NC}"
    exit 0
else
    echo -e "${RED}❌ SMOKE TEST FAILED: ${FAILED_TESTS} of ${TOTAL_TESTS} checks failed.${NC}"
    echo -e "${BLUE}================================================================${NC}"
    exit 1
fi
