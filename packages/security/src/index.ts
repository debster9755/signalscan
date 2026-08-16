/**
 * Package entry point.
 *
 * `package.json` names this file as `main` and `types`, so without it every
 * `import … from '@signalscan/security'` fails to resolve. Audit and retention
 * are specified in §22 and §25 but not yet built; they get re-exported here as
 * they land.
 */
export * from './authorization/index';
