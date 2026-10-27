/**
 * Lami AI Office — E2E Test Runner Utilities & Framework
 * Lightweight, zero-dependency, structured test runner supporting async tests,
 * hierarchical test suites, tier reporting, and JSON exports.
 */

const assert = require('node:assert/strict');

class TestContext {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      startTime: 0,
      endTime: 0
    };
  }

  describe(name, fn) {
    const suite = {
      name,
      tests: [],
      beforeAll: [],
      afterAll: [],
      beforeEach: [],
      afterEach: []
    };
    const prev = this.currentSuite;
    this.currentSuite = suite;
    this.suites.push(suite);

    try {
      fn();
    } finally {
      this.currentSuite = prev;
    }
  }

  it(name, fn, options = {}) {
    if (!this.currentSuite) {
      this.describe('Default Suite', () => {});
    }
    this.currentSuite.tests.push({
      name,
      fn,
      skip: options.skip || false,
      timeout: options.timeout || 10000,
      status: 'pending',
      error: null,
      duration: 0
    });
  }

  test(name, fn, options = {}) {
    this.it(name, fn, options);
  }

  async run(filterPattern = null) {
    this.stats.startTime = Date.now();
    this.stats.total = 0;
    this.stats.passed = 0;
    this.stats.failed = 0;
    this.stats.skipped = 0;

    for (const suite of this.suites) {
      // Run beforeAll hooks
      for (const hook of suite.beforeAll) {
        await hook();
      }

      for (const t of suite.tests) {
        if (filterPattern && !t.name.includes(filterPattern) && !suite.name.includes(filterPattern)) {
          continue;
        }

        this.stats.total++;
        if (t.skip) {
          t.status = 'skipped';
          this.stats.skipped++;
          continue;
        }

        // Run beforeEach hooks
        for (const hook of suite.beforeEach) {
          await hook();
        }

        const t0 = Date.now();
        try {
          // Execute test with timeout
          let timer;
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Test timed out after ${t.timeout}ms`)), t.timeout);
          });
          const testPromise = Promise.resolve(t.fn());
          await Promise.race([testPromise, timeoutPromise]);
          clearTimeout(timer);

          t.status = 'passed';
          t.duration = Date.now() - t0;
          this.stats.passed++;
        } catch (err) {
          t.status = 'failed';
          t.error = err;
          t.duration = Date.now() - t0;
          this.stats.failed++;
        }

        // Run afterEach hooks
        for (const hook of suite.afterEach) {
          try {
            await hook();
          } catch (_) {}
        }
      }

      // Run afterAll hooks
      for (const hook of suite.afterAll) {
        try {
          await hook();
        } catch (_) {}
      }
    }

    this.stats.endTime = Date.now();
    this.stats.durationMs = this.stats.endTime - this.stats.startTime;
    return this.getReport();
  }

  getReport() {
    return {
      stats: { ...this.stats },
      suites: this.suites.map(s => ({
        name: s.name,
        tests: s.tests.map(t => ({
          name: t.name,
          status: t.status,
          durationMs: t.duration,
          error: t.error ? (t.error.stack || t.error.message || String(t.error)) : null
        }))
      }))
    };
  }

  printReport(verbose = false) {
    console.log('\n================================================================');
    console.log(` 📋 TEST EXECUTION RESULTS (${this.stats.total} total tests)`);
    console.log('================================================================');

    for (const suite of this.suites) {
      const suitePassed = suite.tests.filter(t => t.status === 'passed').length;
      const suiteFailed = suite.tests.filter(t => t.status === 'failed').length;
      const suiteSkipped = suite.tests.filter(t => t.status === 'skipped').length;
      const statusIcon = suiteFailed === 0 ? '✅' : '❌';

      console.log(`\n${statusIcon} [Suite] ${suite.name} (passed: ${suitePassed}, failed: ${suiteFailed}, skipped: ${suiteSkipped})`);

      for (const t of suite.tests) {
        if (t.status === 'passed') {
          if (verbose) {
            console.log(`   ✅ PASS: ${t.name} (${t.duration}ms)`);
          }
        } else if (t.status === 'failed') {
          console.log(`   ❌ FAIL: ${t.name} (${t.duration}ms)`);
          const errMsg = t.error ? (t.error.message || String(t.error)) : 'Unknown error';
          console.log(`      Error: ${errMsg}`);
          if (t.error && t.error.stack && verbose) {
            console.log(`      Stack:\n${t.error.stack.split('\n').slice(1, 4).map(l => '      ' + l).join('\n')}`);
          }
        } else if (t.status === 'skipped') {
          console.log(`   ⚠️ SKIP: ${t.name}`);
        }
      }
    }

    console.log('\n================================================================');
    console.log(` Summary: ${this.stats.passed} Passed | ${this.stats.failed} Failed | ${this.stats.skipped} Skipped | Duration: ${this.stats.durationMs}ms`);
    console.log('================================================================\n');
  }
}

// Global runner instance
const globalContext = new TestContext();

module.exports = {
  assert,
  describe: (name, fn) => globalContext.describe(name, fn),
  it: (name, fn, opts) => globalContext.it(name, fn, opts),
  test: (name, fn, opts) => globalContext.test(name, fn, opts),
  run: (filter) => globalContext.run(filter),
  getReport: () => globalContext.getReport(),
  printReport: (verbose) => globalContext.printReport(verbose),
  createContext: () => new TestContext()
};
