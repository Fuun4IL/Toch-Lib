/*
 * Public API surface of toch-lib (primary entry point).
 *
 * MVP scope: OData query builder, adapter-based auth/SSO (+ Matomo logging),
 * caching and the CSRF interceptor. Everything is also available from the
 * granular sub-entry points, which is the recommended way to import so
 * unused areas tree-shake away:
 *   toch-lib/core, toch-lib/odata, toch-lib/csrf,
 *   toch-lib/auth, toch-lib/cache, toch-lib/logger
 */
export * from 'toch-lib/core';
export * from 'toch-lib/odata';
export * from 'toch-lib/csrf';
export * from 'toch-lib/auth';
export * from 'toch-lib/cache';
export * from 'toch-lib/logger';
export { provideTochLib } from './lib/provide-toch-lib';
