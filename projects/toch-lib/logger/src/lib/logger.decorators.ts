import { Observable } from 'rxjs';
import { getLogger } from './logger.bridge';
import { LogEntry, LogLevel, LogOptions, LogTrigger, Logger } from './logger.types';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

interface NormalizedLogOptions {
  level: LogLevel;
  message: string;
  includeDuration: boolean;
  warnIfDurationExceeds?: number;
  includeArgs: boolean;
  metadata?: LogOptions['metadata'];
  logger?: Logger;
}

/**
 * Validates and fills in defaults. `level`/`message` are required by the
 * `LogOptions` type, but this also enforces it at runtime (for plain-JS
 * callers, or the deprecated aliases below) and throws at decoration time
 * on any unsupported value rather than silently no-op'ing.
 */
function normalizeLogOptions(options: LogOptions, fallbackMessage: () => string): NormalizedLogOptions {
  const level = options.level ?? 'info';
  if (!LEVELS.includes(level)) {
    throw new Error(`@Log: unsupported level "${level}". Expected one of ${LEVELS.join(', ')}.`);
  }
  if (
    options.warnIfDurationExceeds !== undefined &&
    (!Number.isFinite(options.warnIfDurationExceeds) || options.warnIfDurationExceeds < 0)
  ) {
    throw new Error('@Log: "warnIfDurationExceeds" must be a non-negative, finite number of milliseconds.');
  }
  return {
    level,
    message: options.message || fallbackMessage(),
    includeDuration: options.includeDuration ?? false,
    warnIfDurationExceeds: options.warnIfDurationExceeds,
    includeArgs: options.includeArgs ?? false,
    metadata: options.metadata,
    logger: options.logger,
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function resolveMetadata(metadata: LogOptions['metadata'], args: unknown[]): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return typeof metadata === 'function' ? metadata({ args }) : metadata;
}

function write(logger: Logger, level: LogLevel, entry: LogEntry): void {
  switch (level) {
    case 'debug':
      (logger.debug ?? logger.log)(entry);
      return;
    case 'info':
      logger.log(entry);
      return;
    case 'warn':
      logger.warn(entry);
      return;
    case 'error':
      logger.error(entry);
      return;
  }
}

type DecoratedMethod = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Unified logging decorator — see `LogOptions` for every field. `level` and
 * `message` are the only two things you decide on; everything else is
 * optional.
 *
 * ```ts
 * @Log({ level: 'info', message: 'Fetching orders' })
 * getOrders() { return this.api.get<Order[]>('OrderSet'); }
 *
 * @Log({ level: 'error', message: 'Save failed', includeDuration: true })
 * saveOrder(order: Order) { return this.api.post('OrderSet', order); }
 * ```
 *
 * A bare string is shorthand for `{ level: 'info', message }`:
 * `@Log('Fetching orders')`.
 *
 * There is no trigger to configure — every call always logs once at
 * invocation and exactly once on completion (`success` or `failure`,
 * whichever actually happens; see `LogEntry.trigger`).
 *
 * Works on synchronous methods, Promise-returning methods, and
 * Observable-returning methods — detected at call time from the actual
 * return value, not from static typing. Return values/errors pass through
 * unchanged: synchronous results are returned as-is, Promises resolve/
 * reject with the original value/reason, and Observables preserve cold
 * semantics (nothing is subscribed to on your behalf; duration, when
 * enabled, is measured per subscription).
 */
export function Log(optionsOrMessage: string | LogOptions): MethodDecorator {
  const rawOptions: LogOptions =
    typeof optionsOrMessage === 'string' ? { level: 'info', message: optionsOrMessage } : optionsOrMessage;

  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const original = descriptor.value as DecoratedMethod;
    const className = (target as { constructor?: { name?: string } })?.constructor?.name;
    const methodName = String(propertyKey);
    const options = normalizeLogOptions(rawOptions, () => methodName);

    function build(trigger: LogTrigger, extra: Partial<LogEntry> = {}): LogEntry {
      return {
        level: options.level,
        trigger,
        message: options.message,
        timestamp: new Date().toISOString(),
        className,
        methodName,
        ...extra,
      };
    }

    function emitCompletion(
      logger: Logger,
      trigger: 'success' | 'failure',
      args: unknown[],
      startedAt: number,
      err?: unknown
    ): void {
      const duration = options.includeDuration ? now() - startedAt : undefined;
      let level = options.level;
      const metadata = resolveMetadata(options.metadata, args) ?? {};
      if (
        duration !== undefined &&
        options.warnIfDurationExceeds !== undefined &&
        duration > options.warnIfDurationExceeds
      ) {
        if (level !== 'error') level = 'warn';
        metadata['slow'] = true;
        metadata['warnIfDurationExceeds'] = options.warnIfDurationExceeds;
      }

      write(
        logger,
        level,
        build(trigger, {
          level,
          duration,
          error: trigger === 'failure' ? err : undefined,
          metadata: Object.keys(metadata).length ? metadata : undefined,
        })
      );
    }

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      const logger = options.logger ?? getLogger();

      write(
        logger,
        options.level,
        build('call', {
          args: options.includeArgs ? args : undefined,
          metadata: resolveMetadata(options.metadata, args),
        })
      );

      const startedAt = now();

      let result: unknown;
      try {
        result = original.apply(this, args);
      } catch (err) {
        emitCompletion(logger, 'failure', args, startedAt, err);
        throw err;
      }

      if (result instanceof Observable) {
        const source = result; // `const` so the narrowed type survives into the closure below
        return new Observable((subscriber) => {
          const subscriptionStart = now();
          const subscription = source.subscribe({
            next: (value: unknown) => subscriber.next(value),
            error: (err: unknown) => {
              emitCompletion(logger, 'failure', args, subscriptionStart, err);
              subscriber.error(err);
            },
            complete: () => {
              emitCompletion(logger, 'success', args, subscriptionStart);
              subscriber.complete();
            },
          });
          return () => subscription.unsubscribe();
        });
      }

      if (result instanceof Promise) {
        return result.then(
          (value) => {
            emitCompletion(logger, 'success', args, startedAt);
            return value;
          },
          (err) => {
            emitCompletion(logger, 'failure', args, startedAt, err);
            throw err;
          }
        );
      }

      emitCompletion(logger, 'success', args, startedAt);
      return result;
    };

    return descriptor;
  };
}

// ---------------------------------------------------------------------------
// Deprecated aliases — thin wrappers over Log(), kept for methods already
// decorated with @log/@warn/@error. They now also log a completion entry
// (previously @log/@warn logged on call only, and @error on failure only) —
// Log() no longer supports picking a trigger. Prefer @Log(...) directly.
// ---------------------------------------------------------------------------

/** @deprecated Use `@Log({ level: 'info', message })` instead. */
export function log(label?: string): MethodDecorator {
  return Log({ level: 'info', message: label ?? '' });
}

/** @deprecated Use `@Log({ level: 'warn', message })` instead. */
export function warn(label?: string): MethodDecorator {
  return Log({ level: 'warn', message: label ?? '' });
}

/** @deprecated Use `@Log({ level: 'error', message })` instead. */
export function error(label?: string): MethodDecorator {
  return Log({ level: 'error', message: label ?? '' });
}
