import { Observable } from 'rxjs';
import { getLoggerAdapter } from './logger';

type AnyMethod = (this: unknown, ...args: unknown[]) => unknown;

function describe(propertyKey: string | symbol, label?: string): string {
  return label ?? String(propertyKey);
}

/**
 * Logs `label` (default: the method name) via the configured logger every
 * time the decorated method is called.
 *
 * ```ts
 * @log('fetching orders')
 * getOrders() { ... }
 * ```
 */
export function log(label?: string): MethodDecorator {
  return function (_target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const original = descriptor.value as AnyMethod;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      getLoggerAdapter().log(describe(propertyKey, label), args.length ? args : undefined);
      return original.apply(this, args);
    };
    return descriptor;
  };
}

/** Same as `@log`, but writes to the logger's `warn` level. */
export function warn(label?: string): MethodDecorator {
  return function (_target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const original = descriptor.value as AnyMethod;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      getLoggerAdapter().warn(describe(propertyKey, label), args.length ? args : undefined);
      return original.apply(this, args);
    };
    return descriptor;
  };
}

/**
 * Wraps the decorated method so any error it throws (sync, rejected Promise,
 * or an errored Observable) is reported via the configured logger's `error`
 * level, then rethrown — the caller still sees the failure.
 *
 * ```ts
 * @error('save order failed')
 * saveOrder(order: Order) { return this.api.post('OrderSet', order); }
 * ```
 */
export function error(label?: string): MethodDecorator {
  return function (_target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const original = descriptor.value as AnyMethod;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      const message = describe(propertyKey, label);
      const report = (err: unknown) => getLoggerAdapter().error(message, err);

      try {
        const result = original.apply(this, args);

        if (result instanceof Observable) {
          return new Observable((subscriber) => {
            const subscription = result.subscribe({
              next: (value) => subscriber.next(value),
              error: (err) => {
                report(err);
                subscriber.error(err);
              },
              complete: () => subscriber.complete(),
            });
            return () => subscription.unsubscribe();
          });
        }

        if (result instanceof Promise) {
          return result.catch((err: unknown) => {
            report(err);
            throw err;
          });
        }

        return result;
      } catch (err) {
        report(err);
        throw err;
      }
    };
    return descriptor;
  };
}
