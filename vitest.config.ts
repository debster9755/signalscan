import { defineConfig } from 'vitest/config';

/**
 * Three suites, matching PRD §26:
 *   unit        — pure functions, no services. Runs on every commit.
 *   integration — needs docker compose services (Postgres). PRD §26.2.
 *   evals       — AI gold-set evaluation gates. PRD §26.5.
 *
 * Browser E2E (§26.3) is Playwright, configured separately in playwright.config.ts.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/**/*.test.ts', 'workers/**/*.test.ts', 'db/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Tenant-isolation tests share a database; serialising keeps the
          // RLS session context deterministic.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'evals',
          include: ['tests/evals/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/*.d.ts'],
      thresholds: {
        // Global floor.
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
        // PRD §26.1: "Scoring-rule unit tests require 100% branch coverage."
        // This is a release gate, enforced in CI — not an aspiration.
        'packages/domain/src/scoring/**/*.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
