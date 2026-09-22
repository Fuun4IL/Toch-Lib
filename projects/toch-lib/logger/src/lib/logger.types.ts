/**
 * Severity of a log entry. `debug` is opt-in noise for local development;
 * `info` is the normal "this happened" level; `warn`/`error` flag something
 * that deserves attention. Severity is independent of *why* the entry was
 * produced — see {@link LogTrigger}.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Which phase of the decorated method's execution produced a given
 * {@link LogEntry}. Not configurable — every `@Log()`-decorated call always
 * produces a `call` entry at invocation and exactly one completion entry
 * (`success` or `failure`) once it finishes.
 */
export type LogTrigger = 'call' | 'success' | 'failure';

/**
 * A structured log entry, the only thing a {@link Logger} ever receives.
 * Nothing in this library formats a message directly to `console.*` — that
 * choice is entirely the configured `Logger`'s.
 */
export interface LogEntry {
  level: LogLevel;
  /** Which {@link LogTrigger} produced this entry. */
  trigger: LogTrigger;
  message: string;
  /** ISO-8601 timestamp, e.g. `2026-09-22T10:32:19.083Z`. */
  timestamp: string;
  className?: string;
  methodName?: string;
  /** Present on `success`/`failure` entries when `includeDuration` is set. Milliseconds. */
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
 * Configuration for the `@Log()` decorator. `level` and `message` are the
 * only two fields you must decide on — everything else is optional and
 * defaults to "off".
 *
 * There is no trigger to pick: every decorated call always logs once at
 * invocation and exactly once on completion (`success` or `failure`,
 * whichever actually happens) — see `LogEntry.trigger`.
 */
export interface LogOptions {
  /**
   * Severity for every entry this decorator produces — the call entry, and
   * whichever completion entry (`success`/`failure`) actually happens
   * (unless `warnIfDurationExceeds` escalates it — see there).
   *
   * This only selects which `Logger` method is called — it has no effect
   * on whether the decorated method actually fails. `level: 'warn'` on a
   * decorator whose method later throws is valid: log severity and
   * execution outcome are separate axes.
   */
  level: LogLevel;
  /** Message to log, on both the call entry and its completion entry. */
  message: string;
  /**
   * Measure and attach execution duration (ms) to the completion entry.
   * Default `false`.
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
   * Include the raw call arguments on the call entry. Off by default —
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
