#!/usr/bin/env bash
# ==============================================================================
# Smoke test for the (single) office service.
# Probes the endpoints a deploy must keep answering.
#
# Usage: ./scripts/ops/smoke_test.sh [HOST] [PORT]
# Example: ./scripts/ops/smoke_test.sh 192.168.3.33 8090
# ==============================================================================

set -uo pipefail

HOST="${1:-127.0.0.1}"
PORT="${2:-8090}"
TIMEOUT=10

FAILED_TESTS=0
TOTAL_TESTS=6

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE} Starting Smoke Test Probes for Lami AI Office${NC}"
echo -e " Target        : ${YELLOW}${HOST}:${PORT}${NC}"
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

# Port 443 goes through Cloudflare, so it must speak TLS.
if [ "${PORT}" = "443" ]; then SCHEME="https"; else SCHEME="http"; fi
base="${SCHEME}://${HOST}:${PORT}"

probe_endpoint 1 "office" "/healthz"          "${base}/healthz"          '"ok"[[:space:]]*:[[:space:]]*true'
probe_endpoint 2 "office" "/api/config"       "${base}/api/config"       '"mode"[[:space:]]*:[[:space:]]*"(live|demo)"'
probe_endpoint 3 "office" "/api/world"        "${base}/api/world"        '"chars"[[:space:]]*:[[:space:]]*\['
probe_endpoint 4 "office" "/api/roster"       "${base}/api/roster"       '"roster"'
probe_endpoint 5 "office" "/api/integration"  "${base}/api/integration"  '"events_total"'
probe_endpoint 6 "office" "GET / (HTML)"      "${base}/"                 '<title>|<html'

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
