#!/usr/bin/env bash
# Install the Lami Office metrics endpoint on an agent host.
#
# The office's Server Room shows CPU/RAM per agent, so each agent host needs to
# report them. This installs a tiny stdlib-only HTTP endpoint as a systemd user
# service (no root, no dependencies) and verifies it answers on /metrics.
#
# Usage (run on the agent host):
#   bash install_metrics_agent.sh <agent-id> [port]
#
# Remove with:
#   systemctl --user disable --now lami-metrics && rm -rf ~/.lami-metrics
set -euo pipefail

AGENT_ID="${1:?usage: install_metrics_agent.sh <agent-id> [port]}"
PORT="${2:-8010}"
DIR="$HOME/.lami-metrics"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$DIR" "$HOME/.config/systemd/user"
install -m 0644 "$HERE/metrics_agent.py" "$DIR/metrics_agent.py"

sed -e "s/^Environment=AGENT_ID=.*/Environment=AGENT_ID=$AGENT_ID/" \
    -e "s/^Environment=METRICS_PORT=.*/Environment=METRICS_PORT=$PORT/" \
    "$HERE/lami-metrics.service" > "$HOME/.config/systemd/user/lami-metrics.service"

systemctl --user daemon-reload
systemctl --user enable --now lami-metrics
sleep 2

if curl -fsS -m 5 "http://127.0.0.1:$PORT/metrics" | grep -q '"cpu"'; then
  echo "metrics endpoint up for '$AGENT_ID' on port $PORT"
  curl -fsS -m 5 "http://127.0.0.1:$PORT/metrics"
  echo
else
  echo "metrics endpoint did not answer; check: journalctl --user -u lami-metrics -n 30" >&2
  exit 1
fi
