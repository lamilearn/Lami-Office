#!/usr/bin/env node
/**
 * Lami AI Office — Master E2E Test Suite Runner
 * Executes the 4-Tier test suite:
 * - Tier 1: Feature Coverage (>=5 per feature across 12 features)
 * - Tier 2: Boundary & Corner Cases (>=5 per category across 9 categories)
 * - Tier 3: Cross-Feature Combinations (Pairwise interactions)
 * - Tier 4: Real-World Application Scenarios (End-to-end office workflows)
 *
 * Usage:
 *   node tests/run_all_e2e.js [--tier=1,2,3,4] [--filter=<pattern>] [--verbose] [--json]
 */

const path = require('node:path');
const { createContext, printReport, assert } = require('./runner_utils');

// Parse CLI Arguments
const args = process.argv.slice(2);
let selectedTiers = [1, 2, 3, 4];
let verbose = false;
let jsonOutput = false;
let filterPattern = null;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    selectedTiers = arg.slice(7).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  } else if (arg === '--verbose' || arg === '-v') {
    verbose = true;
  } else if (arg === '--json') {
    jsonOutput = true;
  } else if (arg.startsWith('--filter=')) {
    filterPattern = arg.slice(9);
  } else if (arg === '--smoke') {
    filterPattern = 'Feature 12';
    selectedTiers = [1];
  }
}

async function main() {
  const runner = require('./runner_utils');

  if (!jsonOutput) {
    console.log('================================================================');
    console.log(' 🚀 Lami AI Office — 4-Tier E2E Test Suite');
    console.log(` Target Active Tiers : [${selectedTiers.join(', ')}]`);
    console.log(` Filter Pattern      : ${filterPattern || '(none)'}`);
    console.log('================================================================');
  }

  // Load selected tier suites
  if (selectedTiers.includes(1)) {
    require('./e2e/tier1_feature_coverage.test.js');
    require('./e2e/tier1_responsive_a2a.test.js');
  }
  if (selectedTiers.includes(2)) {
    require('./e2e/tier2_boundary_corner.test.js');
    require('./e2e/tier2_backend_hardening.test.js');
  }
  if (selectedTiers.includes(3)) {
    require('./e2e/tier3_cross_feature.test.js');
  }
  if (selectedTiers.includes(4)) {
    require('./e2e/tier4_real_world_scenarios.test.js');
  }

  // Run the tests
  const report = await runner.run(filterPattern);

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    runner.printReport(verbose);
  }

  // Exit with proper code
  if (report.stats.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
