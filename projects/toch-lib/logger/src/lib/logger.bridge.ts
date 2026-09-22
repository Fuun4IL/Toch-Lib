import { Logger } from './logger.types';

/**
 * Backend used by `@Log()` (and its deprecated `@log`/`@warn`/`@error`
 * aliases). Deliberately framework-agnostic and dependency-free: decorators
 * run at arbitrary call time, not inside an Angular injection context, so
 * they cannot call `inject()` themselves. `provideTochLogger` (in
 * `logger.ts`) resolves the configured Angular logger through DI once at
 * app startup and bridges it here via `setLogger`. Until that runs — or in
 * non-Angular code, or tests, that never call it at all — decorated methods
 * fall back to this bare console sink.
 *
 * Kept in its own module (no `@angular/core` import) so the decorator engine
 * — and anything that tests it — never has to load Angular.
 */
let activeLogger: Logger = {
  debug: (entry) => console.debug('[app]', entry.trigger, entry.message, entry),
  log: (entry) => console.log('[app]', entry.trigger, entry.message, entry),
  warn: (entry) => console.warn('[app]', entry.trigger, entry.message, entry),
  error: (entry) => console.error('[app]', entry.trigger, entry.message, entry),
};

/** Swaps the logger `@Log()` writes to. `provideTochLogger` calls this for you. */
export function setLogger(logger: Logger): void {
  activeLogger = logger;
}

/** The logger currently in effect for `@Log()` and its aliases. */
export function getLogger(): Logger {
  return activeLogger;
}
