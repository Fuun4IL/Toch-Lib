/**
 * Severity of a log entry. `debug` is opt-in noise for local development;
 * `info` is the normal "this happened" level; `warn`/`error` flag something
 * that deserves attention. Severity is independent of *why* the entry was
 * produced — see {@link LogTrigger}.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * When a `@Log()` entry is produced, relative to the decorated method's
 * execution:
 *
 * - `call` — the method was invoked. Fires synchronously, before the
 *   original method runs, for every return type.
 * - `success` — the method (or the Promise/Observable it returned)
 *   completed without error.
 * - `failure` — the method (or the Promise/Observable it returned) threw,
 *   rejected, or errored.
 * - `always` — logged once on completion regardless of outcome: `success`
 *   for a clean finish, `failure` for an error. Never logs twice for the
 *   same completion.
 *
 * `on` accepts one trigger or several (`on: ['call', 'failure']`); each
 * requested trigger that actually occurs produces its own entry.
 */
export type LogTrigger = 'call' | 'success' | 'failure' | 'always';

/**
 * A structured log entry, the only thing a {@link Logger} ever receives.
 * Nothing in this library formats a message directly to `console.*` — that
 * choice is entirely the configured `Logger`'s.
 */
export interface LogEntry {
  level: LogLevel;
  /** Which {@link LogTrigger} produced this entry. */
  trigger: LogTrigger;
  /** The configured message, or the method name when none was given. */
  message: string;
  /** ISO-8601 timestamp, e.g. `2026-09-22T10:32:19.083Z`. */
  timestamp: string;
  className?: string;
  methodName?: string;
  /** Present on `success`/`failure`/`always` entries when `includeDuration` is set. Milliseconds. */
  duration?: number;
  /**
   * The call arguments — only present when the decorator opts in via
   * `includeArgs: true`. Off by default so request bodies, tokens, etc.
   * are not logged accidentally; when you do opt in, don't decorate methods
   * that take secrets as plain arguments.
   */
  args?: unknown[];
  /** Present on `failure` entries — the thrown/rejected/errored value, unmodified. */
  error?: unknown;
  /** Free-form, extensible context supplied via `LogOptions.metadata`. */
  metadata?: Record<string, unknown>;
}

/**
 * Logging backend contract. `@Log()` never calls `console.*` itself — it
 * builds a {@link LogEntry} and hands it to whichever `Logger` is active
 * (see `provideTochLogger`/`setLogger`). `debug` is optional: entries at
 * `debug` level fall back to `log()` when a backend doesn't implement it.
 */
export interface Logger {
  log(entry: LogEntry): void;
  warn(entry: LogEntry): void;
  error(entry: LogEntry): void;
  debug?(entry: LogEntry): void;
}

/**
 * Configuration for the `@Log()` decorator. All fields are optional;
 * defaults are documented on each one and enforced by `normalizeLogOptions`.
 */
export interface LogOptions {
  /**
   * Severity used for `call`/`success` entries this decorator produces
   * (and for `failure`/`always` entries too, unless `warnIfDurationExceeds`
   * escalates one — see there). Default `'info'`.
   *
   * This only selects which `Logger` method is called — it has no effect
   * on whether the decorated method actually fails. A `failure` trigger
   * with `level: 'warn'` is valid: log severity and execution outcome are
   * separate axes.
   */
  level?: LogLevel;
  /** Message to log. Defaults to the decorated method's name. */
  message?: string;
  /** One or more triggers to log on. Default `'call'`. */
  on?: LogTrigger | LogTrigger[];
  /**
   * Measure and attach execution duration (ms) to `success`/`failure`/
   * `always` entries. Meaningless for a `call`-only decorator (nothing has
   * executed yet), so it is silently ignored unless `on` also includes
   * `success`, `failure`, or `always`. Default `false`.
   *
   * For an Observable-returning method, duration is measured **per
   * subscription** — from the moment something subscribes to the returned
   * Observable to the moment it completes or errors — never from when the
   * decorated method was merely called. The method is not subscribed to
   * on your behalf; if nothing subscribes, nothing is measured or logged.
   */
  includeDuration?: boolean;
  /**
   * When set and `includeDuration` is on, a completion entry whose
   * duration exceeds this many milliseconds has its level escalated to at
   * least `'warn'` (an `'error'` entry is never downgraded) and carries
   * `metadata.slow: true`. This never adds a second log entry — the single
   * completion entry is simply louder.
   */
  warnIfDurationExceeds?: number;
  /**
   * Include the raw call arguments on `call` entries. Off by default —
   * arguments often carry request bodies, credentials, or other data that
   * should not land in logs unreviewed. Turn this on only for methods you
   * know take safe, non-sensitive arguments.
   */
  includeArgs?: boolean;
  /** Extra structured context, static or derived from the call arguments. */
  metadata?: Record<string, unknown> | ((context: { args: unknown[] }) => Record<string, unknown>);
  /** Override the active `Logger` for this decorator only (mainly for tests). */
  logger?: Logger;
}
