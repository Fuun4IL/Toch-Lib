import { APP_INITIALIZER, inject, Injectable, InjectionToken, Provider, Type } from '@angular/core';
import { Logger, LogEntry } from './logger.types';
import { setLogger } from './logger.bridge';

export { setLogger, getLogger } from './logger.bridge';

export const LOGGER = new InjectionToken<Logger>('LOGGER');

/** Prefix used by the console logger, replaceable per app. */
export const LOGGER_PREFIX = new InjectionToken<string>('LOGGER_PREFIX', {
  providedIn: 'root',
  factory: () => '[app]',
});

function format(prefix: string, entry: LogEntry): unknown[] {
  const parts = [`${prefix} [${entry.trigger}]`, entry.message];
  if (entry.className || entry.methodName) {
    parts.push(`(${[entry.className, entry.methodName].filter(Boolean).join('.')})`);
  }
  if (entry.duration !== undefined) parts.push(`${entry.duration.toFixed(1)}ms`);
  const extra: Record<string, unknown> = {};
  if (entry.args !== undefined) extra['args'] = entry.args;
  if (entry.error !== undefined) extra['error'] = entry.error;
  if (entry.metadata !== undefined) extra['metadata'] = entry.metadata;
  return Object.keys(extra).length ? [...parts, extra] : parts;
}

@Injectable({ providedIn: 'root' })
export class ConsoleLogger implements Logger {
  private readonly prefix = inject(LOGGER_PREFIX);

  debug(entry: LogEntry): void {
    console.debug(...format(this.prefix, entry));
  }
  log(entry: LogEntry): void {
    console.log(...format(this.prefix, entry));
  }
  warn(entry: LogEntry): void {
    console.warn(...format(this.prefix, entry));
  }
  error(entry: LogEntry): void {
    console.error(...format(this.prefix, entry));
  }
}

/** Matomo's global command queue, created by the Matomo tracking snippet. */
declare global {
  interface Window {
    _paq?: unknown[][];
  }
}

/**
 * Sends log entries to Matomo as tracked events (category `app-log`).
 * Requires the Matomo tracking snippet to be loaded by the app (index.html);
 * entries are also mirrored to the console for local visibility, and fall
 * back to console-only when `_paq` is absent.
 */
@Injectable({ providedIn: 'root' })
export class MatomoLogger implements Logger {
  private readonly console = inject(ConsoleLogger);

  debug(entry: LogEntry): void {
    this.track(entry);
    this.console.debug(entry);
  }
  log(entry: LogEntry): void {
    this.track(entry);
    this.console.log(entry);
  }
  warn(entry: LogEntry): void {
    this.track(entry);
    this.console.warn(entry);
  }
  error(entry: LogEntry): void {
    this.track(entry);
    this.console.error(entry);
  }

  private track(entry: LogEntry): void {
    if (typeof window === 'undefined' || !Array.isArray(window._paq)) {
      return;
    }
    const label = entry.className ? `${entry.className}.${entry.methodName ?? ''}` : entry.methodName;
    const name = [entry.message, label, entry.duration !== undefined ? `${entry.duration.toFixed(1)}ms` : undefined]
      .filter(Boolean)
      .join(' | ');
    window._paq.push(['trackEvent', 'app-log', `${entry.trigger}:${entry.level}`, name]);
  }
}

/**
 * Picks the log backend used by the `@Log()` decorator:
 * `provideTochLogger('matomo')`, `provideTochLogger('console')`,
 * or `provideTochLogger(MyCustomLogger)`.
 */
export function provideTochLogger(backend: 'console' | 'matomo' | Type<Logger> = 'console'): Provider[] {
  const useClass = backend === 'console' ? ConsoleLogger : backend === 'matomo' ? MatomoLogger : backend;
  return [
    { provide: LOGGER, useClass },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (instance: Logger) => () => setLogger(instance),
      deps: [LOGGER],
    },
  ];
}

// ---------------------------------------------------------------------------
// Deprecated aliases (pre-@Log naming). Kept so code written against the
// previous logger.ts keeps compiling; new code should use the names above.
// ---------------------------------------------------------------------------

/** @deprecated Use {@link Logger} instead — same shape, structured-entry name. */
export type LoggerAdapter = Logger;
/** @deprecated Use {@link LOGGER} instead — same token. */
export const LOGGER_ADAPTER = LOGGER;
/** @deprecated Use {@link ConsoleLogger} instead — same class. */
export const ConsoleLoggerAdapter = ConsoleLogger;
/** @deprecated Use {@link MatomoLogger} instead — same class. */
export const MatomoLoggerAdapter = MatomoLogger;
/** @deprecated Use {@link setLogger} instead — same function. */
export const setLoggerAdapter = setLogger;
