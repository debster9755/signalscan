/**
 * Package entry point.
 *
 * `package.json` names this file as `main` and `types`, so without it every
 * `import … from '@signalscan/domain'` fails to resolve. Subpath imports
 * (`@signalscan/domain/scoring`) stay available and remain the better choice
 * inside the monorepo — they keep the dependency legible.
 */
export * from './assessment/index';
export * from './business-case/index';
export * from './intake/index';
export * from './scoring/index';
export * from './workflow/index';
