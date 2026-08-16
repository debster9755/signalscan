/**
 * Package entry point.
 *
 * `package.json` names this file as `main` and `types`, so without it every
 * `import … from '@signalscan/domain'` fails to resolve. Subpath imports
 * (`@signalscan/domain/scoring`) stay available and remain the better choice
 * inside the monorepo — they keep the dependency legible.
 */
export * from './assessment/index.js';
export * from './business-case/index.js';
export * from './intake/index.js';
export * from './scoring/index.js';
export * from './workflow/index.js';
