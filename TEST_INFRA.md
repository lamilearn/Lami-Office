# Test Infrastructure: 2D Top-Down / RPG Office Suite

## 1. Overview
This document describes the end-to-end (E2E) testing infrastructure, harness architecture, test suites, and execution methodology for the 2D Top-Down / RPG Office Suite (`ai-office` & `lami-office-react`).

The testing track uses an opaque-box, requirement-driven 4-tier testing methodology strictly derived from `ORIGINAL_REQUEST.md` (R1, R2, R3) and `PROJECT.md` (§ Feature Inventory & Interface Contracts).

---

## 2. Architecture & Design Principles

### 2.1 Zero-Dependency Headless Runner
- **Engine**: Native Node.js (v20+) with `node:assert/strict`.
- **Performance**: High-speed synchronous & asynchronous test execution (<300ms for the complete 146-test suite).
- **Isolation**: Each test suite creates isolated browser/DOM/canvas mock environments. No shared mutated state across tests.

### 2.2 Test Harness (`tests/harness.js`)
- **Mock DOM Environment**: Emulates required HTML elements matching `web/index.html` (`#office`, `#hud`, `#card`, `#chat-drawer`, `#ticker`, `#whiteboard-modal`, `#ctx-modal`).
- **Canvas 2D Context Mock**: Records and inspects `fillRect`, `clearRect`, `strokeRect`, `drawImage`, `save`, `restore`, `translate`, `scale`, and text operations.
- **Audio & Time Mocks**: Emulates `window.AudioContext`, `performance.now()`, `requestAnimationFrame`, and `setTimeout`.

### 2.3 Specification Oracle (`tests/oracle.js`)
- Contains the authoritative mathematical specifications and reference logic:
  - Orthogonal grid coordinate projection: `tileToScreen(x, y)` and `screenToTile(sx, sy)`.
  - 6 themed office room bounds, door coordinates, and color schemes.
  - 4-directional cardinal vectors (`S`, `N`, `E`, `W`) and compatibility aliases (`SE -> S`, `SW -> W`, etc.).
  - 2D orthogonal BFS pathfinding avoiding solid obstacle tiles.
  - Desktop 16:9 viewport scale and dynamic chat drawer offset calculations.
  - 2D Euclidean hit-testing in unskewed coordinates.

---

## 3. Directory Layout

```
Project/Lami/ai-office/
├── package.json                   # Root package definition with npm test scripts
├── scripts/
│   ├── push_to_github.sh          # Git dev push and branch management
│   ├── smoke_test.sh              # 7-point live endpoint smoke probe
│   ├── generate_tileset.py        # Builds assets/tiles/tileset.png (+ --check)
│   └── generate_tilemap.py        # Builds assets/map/office.map.json from config.js (+ --check)
├── services/
│   ├── ai-office/                 # Backend proxy & agent runner (Port 8088)
│   └── lami-office-react/         # 2D RPG Office frontend & SSE server (Port 8090)
│       ├── server.py              # Single-port HTTP & SSE streaming server
│       └── web/
│           ├── index.html         # Canvas UI & DOM overlays
│           ├── assets/            # tiles/tileset.png + tileset.json + map/office.map.json
│           └── js/                # Game simulation modules (incl. tilemap.js)
└── tests/
    ├── harness.js                 # Headless DOM and Canvas 2D mock harness
    ├── oracle.js                  # Authoritative specification oracle reference
    ├── runner_utils.js            # Structured test context, assertions & reporter
    ├── run_all_e2e.js             # Master test suite runner executable
    └── e2e/
        ├── tier1_feature_coverage.test.js    # Tier 1: 18 Features (87 tests)
        ├── tier2_boundary_corner.test.js     # Tier 2: 9 Edge Categories (45 tests)
        ├── tier3_cross_feature.test.js       # Tier 3: Pairwise Combinations (9 tests)
        ├── tier1_world_authority.test.js  # Tier 1: server-authoritative world parity (10 tests)
        ├── tier4_real_world_scenarios.test.js# Tier 4: E2E Scenarios (5 tests)
        └── tier4_http_integration.test.js # Tier 4: HTTP integration (34 tests)
```

---

## 4. 4-Tier Test Suite Structure

| Tier | Suite Name | File | Test Count | Description |
|------|------------|------|------------|-------------|
| **Tier 1** | World Authority | `tests/e2e/tier1_world_authority.test.js` + `scripts/check_world_sync.py` | 10 | Python `world.py` vs client engine parity: identical collision grid, equal-cost A* routes, config sync (rooms/slots/residents/routines/furniture), every desk and routine spot reachable, and the browser stays render-only in live mode. |
| **Tier 1** | Feature Coverage | `tests/e2e/tier1_feature_coverage.test.js` + `tier1_responsive_a2a.test.js` + `tier1_world_authority.test.js` | 97 | Validates primary happy-path behavior across all 18 core features: map/collision, responsive camera, drawer-aware layout, floorplan decoration and A2A peers. |
| **Tier 2** | Boundary & Corner Cases | `tests/e2e/tier2_boundary_corner.test.js` | 45 | Exercises degenerate inputs, extreme viewports (0x0 to 8K), zero/max coordinates, obstacle trapping, text overflow, and error handling. |
| **Tier 3** | Cross-Feature Combinations | `tests/e2e/tier3_cross_feature.test.js` | 9 | Verifies pairwise interactions: Pathfinding across sealed doorways, viewport resize with drawer, tool event slotting, task completion reporting, modal conflicts, tribute mode skinning. |
| **Tier 4** | Real-World Application Scenarios | `tests/e2e/tier4_real_world_scenarios.test.js` | 5 | Validates realistic end-to-end office workflows: Full day office cycle, 6-agent concurrency storm, user interactive session, tool fault recovery, and dual-service smoke probes. |
| **Tier 4** | HTTP Integration | `tests/e2e/tier4_http_integration.test.js` + `tests/http_helpers.js` | 42 | Boots the real `server.py` subprocess and drives it over real HTTP: ingest auth matrix, 413/400 body limits, keep-alive poisoning, SSE fan-out, A2A custom + official protocol via stub peers, the real Hermes bridge, and the server-authoritative world (`/api/world`, identical positions across two clients, movement with no browser open, restart persistence). Fully offline on 127.0.0.1. |
| **Total** | **Complete Suite** | — | **301** | Comprehensive automated acceptance gate. |

---

## 5. Execution Commands

### 5.1 Run Full Test Suite
```bash
# Via npm
npm test

# Via Node directly
node tests/run_all_e2e.js
```

### 5.2 Run Specific Tiers
```bash
# Run only Tier 1
node tests/run_all_e2e.js --tier=1

# Run Tiers 1 and 2
node tests/run_all_e2e.js --tier=1,2

# Run Tier 3 and 4
node tests/run_all_e2e.js --tier=3,4
```

### 5.3 Filter by Pattern or Feature
```bash
# Run tests matching a specific feature
node tests/run_all_e2e.js --filter="Feature 1"

# Run smoke test subset
node tests/run_all_e2e.js --smoke
```

### 5.4 Structured JSON Output (CI/CD Pipeline)
```bash
node tests/run_all_e2e.js --json > test_results.json
```

---

## 6. Milestone Acceptance Gates
- **Milestone 1 Gate**: Passing Tier 1 (Features 1-4) and Tier 2 (Categories 1, 4, 8).
- **Milestone 2 Gate**: Passing Tier 1 (Features 5-10), Tier 2 (Categories 5, 6, 7), and Tier 3 (Scenarios X1-X6).
- **Milestone 3 Gate**: Passing Tier 1 (Features 11-12), Tier 2 (Categories 2, 3, 9), and Tier 4 (Scenario S5).
- **Milestone 4 Gate (Final Acceptance)**: 100% pass rate across all 301 tests in Tiers 1–4.
