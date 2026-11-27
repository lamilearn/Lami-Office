# Thin wrapper over the npm scripts, for boxes without node or for people who
# prefer make. Every target mirrors a package.json script; if you add one there,
# add it here too. `make check` is what CI runs.
.PHONY: help install test test-tier1 test-tier2 test-tier3 test-tier4
.PHONY: syntax guard assets assets-check stamp smoke check
.PHONY: build up down logs deploy-staging deploy-prod clean

PY ?= python3
NODE ?= node
COMPOSE ?= docker compose
ENV ?= .env.production

help:
	@echo "make install        install nothing; this repo has no runtime deps"
	@echo "make check          syntax + guard + assets + full e2e (what CI runs)"
	@echo "make test           full e2e suite (378 tests)"
	@echo "make test-tier1     one tier at a time (1..4)"
	@echo "make guard          fail if world.py drifts from config.js"
	@echo "make assets         regenerate tileset.png + office.map.json"
	@echo "make assets-check   fail if committed assets are stale"
	@echo "make stamp          rewrite the ?v= hashes in index.html"
	@echo "make smoke          probe a running deploy (HOST=... PORT=...)"
	@echo "make build          docker compose build"
	@echo "make up             docker compose up -d"
	@echo "make down           docker compose down"
	@echo "make logs           docker compose logs -f"
	@echo "make deploy-prod    fast-forward master on the prod host and rebuild"

install:
	@echo "No runtime dependencies: Python stdlib + vanilla JS."
	@echo "Node is only needed for the test runner."

test:
	$(NODE) tests/run_all_e2e.js

test-tier1:
	$(NODE) tests/run_all_e2e.js --tier=1
test-tier2:
	$(NODE) tests/run_all_e2e.js --tier=2
test-tier3:
	$(NODE) tests/run_all_e2e.js --tier=3
test-tier4:
	$(NODE) tests/run_all_e2e.js --tier=4

syntax:
	@for f in web/js/*.js; do $(NODE) -c "$$f" || exit 1; done
	@echo "web/js: syntax OK"

guard:
	$(PY) scripts/assets/check_world_sync.py

assets:
	$(PY) scripts/assets/generate_tileset.py
	$(PY) scripts/assets/generate_tilemap.py

assets-check:
	$(PY) scripts/assets/generate_tileset.py --check
	$(PY) scripts/assets/generate_tilemap.py --check
	$(PY) scripts/assets/stamp_assets.py --check

stamp:
	$(PY) scripts/assets/stamp_assets.py

smoke:
	bash scripts/ops/smoke_test.sh $(HOST) $(PORT)

check: syntax guard assets-check test
	@echo
	@echo "All checks passed."

build:
	$(COMPOSE) --env-file $(ENV) build

up:
	$(COMPOSE) --env-file $(ENV) up -d

down:
	$(COMPOSE) --env-file $(ENV) down

logs:
	$(COMPOSE) --env-file $(ENV) logs -f

deploy-staging:
	bash scripts/ops/deploy_staging.sh

deploy-prod:
	bash scripts/ops/deploy_prod.sh

clean:
	rm -rf __pycache__ scripts/assets/__pycache__ scripts/ops/__pycache__ \
	       deploy/agent/__pycache__ node_modules
