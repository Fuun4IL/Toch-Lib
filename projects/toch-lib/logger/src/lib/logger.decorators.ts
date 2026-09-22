import { Observable } from 'rxjs';
import { getLogger } from './logger.bridge';
import { LogEntry, LogLevel, LogOptions, LogTrigger, Logger } from './logger.types';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const TRIGGERS: readonly LogTrigger[] = ['call', 'success', 'failure', 'always'];

interface NormalizedLogOptions {
  level: LogLevel;
  message?: string;
  on: LogTrigger[];
  includeDuration: boolean;
  warnIfDurationExceeds?: number;
  includeArgs: boolean;
  metadata?: LogOptions['metadata'];
  logger?: Logger;
}

/** Validates and fills in defaults. Throws at decoration time on unsupported values. */
function normalizeLogOptions(options: LogOptions): NormalizedLogOptions {
  const level = options.level ?? 'info';
  if (!LEVELS.includes(level)) {
    throw new Error(`@Log: unsupported level "${level}". Expected one of ${LEVELS.join(', ')}.`);
  }
  const onRaw = options.on ?? 'call';
  const on = Array.isArray(onRaw) ? onRaw : [onRaw];
  if (on.length === 0) {
    throw new Error('@Log: "on" must name at least one trigger.');
  }
  for (const trigger of on) {
    if (!TRIGGERS.includes(trigger)) {
      throw new Error(`@Log: unsupported trigger "${trigger}". Expected one of ${TRIGGERS.join(', ')}.`);
    }
  }
  if (
    options.warnIfDurationExceeds !== undefined &&
    (!Number.isFinite(options.warnIfDurationExceeds) || options.warnIfDurationExceeds < 0)
  ) {
    throw new Error('@Log: "warnIfDurationExceeds" must be a non-negative, finite number of milliseconds.');
  }
  return {
    level,
    message: options.message,
    on,
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
 * Unified logging decorator — see `LogOptions` for every field.
 *
 * ```ts
 * @Log({ level: 'info', message: 'Fetching orders', on: 'call' })
 * getOrders() { return this.api.get<Order[]>('OrderSet'); }
 *
 * @Log({ level: 'error', message: 'Save failed', on: 'failure' })
 * saveOrder(order: Order) { return this.api.post('OrderSet', order); }
 * ```
 *
 * A bare string is shorthand for `{ message }` (level `'info'`, `on: 'call'`):
 * `@Log('Fetching orders')`.
 *
 * Works on synchronous methods, Promise-returning methods, and
 * Observable-returning methods — detected at call time from the actual
 * return value, not from static typing. The original return value/behavior
 * is preserved: synchronous results pass through untouched, and when no
 * duration/completion logging is configured, Promises and Observables are
 * returned exactly as produced (no wrapping, no extra subscription).
 */
export function Log(optionsOrMessage: string | LogOptions = {}): MethodDecorator {
  const options = normalizeLogOptions(
    typeof optionsOrMessage === 'string' ? { message: optionsOrMessage } : optionsOrMessage
  );

  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const original = descriptor.value as DecoratedMethod;
    const className = (target as { constructor?: { name?: string } })?.constructor?.name;
    const methodName = String(propertyKey);
    const message = options.message ?? methodName;
    const needsCompletion = options.on.some((t) => t !== 'call');

    function build(trigger: LogTrigger, extra: Partial<LogEntry> = {}): LogEntry {
      return {
        level: options.level,
        trigger,
        message,
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
      startedAt: number | undefined,
      err?: unknown
    ): void {
      if (!options.on.includes(trigger) && !options.on.includes('always')) return;

      const duration =
        options.includeDuration && startedAt !== undefined ? now() - startedAt : undefined;
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

      if (options.on.includes('call')) {
        write(
          logger,
          options.level,
          build('call', {
            args: options.includeArgs ? args : undefined,
            metadata: resolveMetadata(options.metadata, args),
          })
        );
      }

      const startedAt = needsCompletion ? now() : undefined;

      let result: unknown;
      try {
        result = original.apply(this, args);
      } catch (err) {
        emitCompletion(logger, 'failure', args, startedAt, err);
        throw err;
      }

      if (result instanceof Observable) {
        const source = result; // `const` so the narrowed type survives into the closure below
        if (!needsCompletion) return source;
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
        if (!needsCompletion) return result;
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

      if (needsCompletion) emitCompletion(logger, 'success', args, startedAt);
      return result;
    };

    return descriptor;
  };
}

// ---------------------------------------------------------------------------
// Deprecated aliases — thin wrappers over Log(), kept for methods already
// decorated with @log/@warn/@error. Behavior is unchanged: @log/@warn fire
// on every call; @error fires (and rethrows/re-emits) only on failure.
// Prefer @Log(...) directly in new code.
// ---------------------------------------------------------------------------

/** @deprecated Use `@Log({ level: 'info', message, on: 'call' })` instead. */
export function log(label?: string): MethodDecorator {
  return Log({ level: 'info', message: label, on: 'call' });
}

/** @deprecated Use `@Log({ level: 'warn', message, on: 'call' })` instead. */
export function warn(label?: string): MethodDecorator {
  return Log({ level: 'warn', message: label, on: 'call' });
}

/** @deprecated Use `@Log({ level: 'error', message, on: 'failure' })` instead. */
export function error(label?: string): MethodDecorator {
  return Log({ level: 'error', message: label, on: 'failure' });
}
