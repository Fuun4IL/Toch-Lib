import { APP_INITIALIZER, inject, Injectable, InjectionToken, Provider, Type } from '@angular/core';

/**
 * Adapter contract for log sinks. Bind one to LOGGER_ADAPTER (or use
 * `provideTochLogger`) — the `@log`/`@warn`/`@error` decorators write here.
 */
export interface LoggerAdapter {
  log(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

export const LOGGER_ADAPTER = new InjectionToken<LoggerAdapter>('LOGGER_ADAPTER');

/** Prefix used by the console adapter, replaceable per app. */
export const LOGGER_PREFIX = new InjectionToken<string>('LOGGER_PREFIX', {
  providedIn: 'root',
  factory: () => '[app]',
});

@Injectable({ providedIn: 'root' })
export class ConsoleLoggerAdapter implements LoggerAdapter {
  private readonly prefix = inject(LOGGER_PREFIX);

  log(message: string, extra?: unknown): void {
    console.log(this.prefix, message, extra ?? '');
  }
  warn(message: string, extra?: unknown): void {
    console.warn(this.prefix, message, extra ?? '');
  }
  error(message: string, extra?: unknown): void {
    console.error(this.prefix, message, extra ?? '');
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
export class MatomoLoggerAdapter implements LoggerAdapter {
  private readonly console = inject(ConsoleLoggerAdapter);

  log(message: string, extra?: unknown): void {
    this.track('log', message, extra);
    this.console.log(message, extra);
  }
  warn(message: string, extra?: unknown): void {
    this.track('warn', message, extra);
    this.console.warn(message, extra);
  }
  error(message: string, extra?: unknown): void {
    this.track('error', message, extra);
    this.console.error(message, extra);
  }

  private track(action: string, message: string, extra?: unknown): void {
    if (typeof window === 'undefined' || !Array.isArray(window._paq)) {
      return;
    }
    const name = extra !== undefined ? `${message} | ${safeStringify(extra)}` : message;
    window._paq.push(['trackEvent', 'app-log', action, name]);
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Adapter used by the `@log`/`@warn`/`@error` decorators. Defaults to a bare
 * console sink so decorated methods still log before the app finishes
 * bootstrapping (or in code that never calls `provideTochLogger`); swapped
 * for the configured adapter (console/Matomo/custom) once `provideTochLogger`
 * runs at app startup.
 */
let activeAdapter: LoggerAdapter = {
  log: (message, extra) => console.log('[app]', message, extra ?? ''),
  warn: (message, extra) => console.warn('[app]', message, extra ?? ''),
  error: (message, extra) => console.error('[app]', message, extra ?? ''),
};

/** Swaps the adapter the decorators write to. `provideTochLogger` calls this for you. */
export function setLoggerAdapter(adapter: LoggerAdapter): void {
  activeAdapter = adapter;
}

/** The adapter currently in effect for `@log`/`@warn`/`@error`. Internal to this entry point. */
export function getLoggerAdapter(): LoggerAdapter {
  return activeAdapter;
}

/**
 * Picks the log sink used by the `@log`/`@warn`/`@error` decorators:
 * `provideTochLogger('matomo')`, `provideTochLogger('console')`,
 * or `provideTochLogger(MyCustomAdapter)`.
 */
export function provideTochLogger(
  adapter: 'console' | 'matomo' | Type<LoggerAdapter> = 'console'
): Provider[] {
  const useClass =
    adapter === 'console'
      ? ConsoleLoggerAdapter
      : adapter === 'matomo'
      ? MatomoLoggerAdapter
      : adapter;
  return [
    { provide: LOGGER_ADAPTER, useClass },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (instance: LoggerAdapter) => () => setLoggerAdapter(instance),
      deps: [LOGGER_ADAPTER],
    },
  ];
}
