import { Observable } from 'rxjs';
import { Log, error, log, warn } from './logger.decorators';
import { setLogger } from './logger.bridge';
import { LogEntry, Logger } from './logger.types';

/** Captures every entry passed to it, keyed by which Logger method received it. */
function createRecordingLogger(): Logger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const record = (entry: LogEntry) => entries.push(entry);
  return { entries, debug: record, log: record, warn: record, error: record };
}

describe('@Log — synchronous methods', () => {
  it('preserves the return value and logs on call by default', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ message: 'calculating total', logger })
      calculateTotal(a: number, b: number) {
        return a + b;
      }
    }

    const result = new Calc().calculateTotal(2, 3);

    expect(result).toBe(5);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: 'info',
      trigger: 'call',
      message: 'calculating total',
      className: 'Calc',
      methodName: 'calculateTotal',
    });
    expect(typeof logger.entries[0].timestamp).toBe('string');
  });

  it('defaults the message to the method name when none is given', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ logger })
      calculateTotal() {
        return 0;
      }
    }

    new Calc().calculateTotal();

    expect(logger.entries[0].message).toBe('calculateTotal');
  });

  it('accepts a bare string as shorthand for { message }', () => {
    // The shorthand form has no `logger` field to override, so redirect the
    // global bridge (what it falls back to) for the duration of this test.
    const logger = createRecordingLogger();
    setLogger(logger);

    class Calc {
      @Log('shorthand message')
      calculateTotal() {
        return 0;
      }
    }

    new Calc().calculateTotal();

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ level: 'info', trigger: 'call', message: 'shorthand message' });
  });

  it('logs a failure entry and rethrows synchronous exceptions unchanged', () => {
    const logger = createRecordingLogger();
    const boom = new Error('boom');

    class Calc {
      @Log({ message: 'calculating total', on: 'failure', logger })
      calculateTotal(): number {
        throw boom;
      }
    }

    expect(() => new Calc().calculateTotal()).toThrow(boom);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ trigger: 'failure', error: boom });
  });

  it('does not log a failure entry when on: "success" and the call throws', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ on: 'success', logger })
      calculateTotal(): number {
        throw new Error('boom');
      }
    }

    expect(() => new Calc().calculateTotal()).toThrow('boom');
    expect(logger.entries).toHaveLength(0);
  });

  it('does not include call arguments unless includeArgs is set', () => {
    const logger = createRecordingLogger();

    class Auth {
      @Log({ logger })
      login(_username: string, _password: string) {
        return true;
      }
    }

    new Auth().login('alice', 'super-secret');

    expect(logger.entries[0].args).toBeUndefined();
  });

  it('includes call arguments when includeArgs is explicitly enabled', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ includeArgs: true, logger })
      calculateTotal(a: number, b: number) {
        return a + b;
      }
    }

    new Calc().calculateTotal(2, 3);

    expect(logger.entries[0].args).toEqual([2, 3]);
  });

  it('resolves metadata from a static object and from a function of the call args', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ metadata: { source: 'calc' }, logger })
      staticMeta() {
        return 0;
      }

      @Log({ metadata: ({ args }) => ({ firstArg: args[0] }), logger })
      dynamicMeta(a: number) {
        return a;
      }
    }

    const calc = new Calc();
    calc.staticMeta();
    calc.dynamicMeta(42);

    expect(logger.entries[0].metadata).toEqual({ source: 'calc' });
    expect(logger.entries[1].metadata).toEqual({ firstArg: 42 });
  });
});

describe('@Log — Promise-returning methods', () => {
  it('logs success after resolution and preserves the resolved value', async () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ on: 'success', includeDuration: true, logger })
      async saveOrder(order: { id: number }) {
        return order;
      }
    }

    const result = await new Orders().saveOrder({ id: 1 });

    expect(result).toEqual({ id: 1 });
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ trigger: 'success' });
    expect(typeof logger.entries[0].duration).toBe('number');
  });

  it('logs failure and preserves the original rejection reason', async () => {
    const logger = createRecordingLogger();
    const reason = new Error('save failed');

    class Orders {
      @Log({ level: 'error', on: 'failure', logger })
      async saveOrder(): Promise<void> {
        throw reason;
      }
    }

    await expect(new Orders().saveOrder()).rejects.toBe(reason);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ trigger: 'failure', error: reason, level: 'error' });
  });

  it('does not wrap the Promise when only "call" is configured', () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ on: 'call', logger })
      async saveOrder() {
        return 'ok';
      }
    }

    const promise = new Orders().saveOrder();
    expect(promise).toBeInstanceOf(Promise);
    return expect(promise).resolves.toBe('ok');
  });
});

describe('@Log — Observable-returning methods', () => {
  function coldObservable<T>(values: T[], subscribeCounter: { count: number }): Observable<T> {
    return new Observable((subscriber) => {
      subscribeCounter.count++;
      for (const value of values) subscriber.next(value);
      subscriber.complete();
    });
  }

  it('passes emitted values through unchanged and logs on completion', () => {
    const logger = createRecordingLogger();
    const subscribeCounter = { count: 0 };

    class OrdersApi {
      @Log({ on: 'success', logger })
      getOrders() {
        return coldObservable([1, 2, 3], subscribeCounter);
      }
    }

    const received: number[] = [];
    let completed = false;
    new OrdersApi().getOrders().subscribe({
      next: (v) => received.push(v),
      complete: () => (completed = true),
    });

    expect(received).toEqual([1, 2, 3]);
    expect(completed).toBe(true);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].trigger).toBe('success');
  });

  it('logs the error and re-emits it to the subscriber', () => {
    const logger = createRecordingLogger();
    const failure = new Error('network down');

    class OrdersApi {
      @Log({ level: 'error', on: 'failure', logger })
      getOrders() {
        return new Observable((subscriber) => subscriber.error(failure));
      }
    }

    let seenError: unknown;
    new OrdersApi().getOrders().subscribe({ error: (e) => (seenError = e) });

    expect(seenError).toBe(failure);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ trigger: 'failure', error: failure });
  });

  it('does not subscribe to the source when nothing subscribes to the result', () => {
    const logger = createRecordingLogger();
    const subscribeCounter = { count: 0 };

    class OrdersApi {
      @Log({ on: 'success', logger })
      getOrders() {
        return coldObservable([1], subscribeCounter);
      }
    }

    new OrdersApi().getOrders(); // never subscribed

    expect(subscribeCounter.count).toBe(0);
    expect(logger.entries).toHaveLength(0);
  });

  it('subscribes to the source exactly once per subscriber, preserving cold semantics', () => {
    const logger = createRecordingLogger();
    const subscribeCounter = { count: 0 };

    class OrdersApi {
      @Log({ on: 'success', logger })
      getOrders() {
        return coldObservable([1], subscribeCounter);
      }
    }

    const result$ = new OrdersApi().getOrders();
    result$.subscribe();
    result$.subscribe();

    expect(subscribeCounter.count).toBe(2);
    expect(logger.entries).toHaveLength(2);
  });

  it('returns the original Observable reference when only "call" is configured (no wrapping)', () => {
    const logger = createRecordingLogger();
    const source = new Observable<number>();

    class OrdersApi {
      @Log({ on: 'call', logger })
      getOrders() {
        return source;
      }
    }

    expect(new OrdersApi().getOrders()).toBe(source);
  });

  it('unsubscribing from the result tears down the source subscription', () => {
    const logger = createRecordingLogger();
    let torndown = false;

    class OrdersApi {
      @Log({ on: 'success', logger })
      stream() {
        return new Observable(() => () => (torndown = true));
      }
    }

    const sub = new OrdersApi().stream().subscribe();
    sub.unsubscribe();

    expect(torndown).toBe(true);
  });

  it('measures duration per subscription, not from when the method was called', async () => {
    const logger = createRecordingLogger();

    // A genuinely cold Observable: the setTimeout only starts once something
    // subscribes (the executor doesn't run at all until then).
    class OrdersApi {
      @Log({ on: 'success', includeDuration: true, logger })
      stream() {
        return new Observable<number>((subscriber) => {
          const timer = setTimeout(() => {
            subscriber.next(1);
            subscriber.complete();
          }, 20);
          return () => clearTimeout(timer);
        });
      }
    }

    const result$ = new OrdersApi().stream(); // "called" now, but nothing scheduled yet
    await new Promise((resolve) => setTimeout(resolve, 50)); // time passes before anyone subscribes
    await new Promise<void>((resolve) => result$.subscribe({ complete: resolve }));

    expect(logger.entries).toHaveLength(1);
    // If duration were measured from the call above, it would be ~70ms.
    // Measured from subscription, it's ~20ms — proving the timer only
    // started once something actually subscribed.
    expect(logger.entries[0].duration).toBeGreaterThanOrEqual(15);
    expect(logger.entries[0].duration).toBeLessThan(50);
  });
});

describe('@Log — configuration', () => {
  it('rejects an unsupported level', () => {
    // Decorators evaluate at class-definition time, so the class declaration
    // itself must be inside the callback under test (a decorated method on
    // an anonymous class *expression* used as an arrow's implicit return
    // isn't valid TS syntax — hence the block body here).
    expect(() => {
      class Bad {
        // @ts-expect-error intentionally invalid at the type level too
        @Log({ level: 'critical' })
        method() {}
      }
      return Bad;
    }).toThrow(/unsupported level/i);
  });

  it('rejects an unsupported trigger', () => {
    expect(() => {
      class Bad {
        // @ts-expect-error intentionally invalid at the type level too
        @Log({ on: 'sometimes' })
        method() {}
      }
      return Bad;
    }).toThrow(/unsupported trigger/i);
  });

  it('rejects a negative duration threshold', () => {
    expect(() => {
      class Bad {
        @Log({ warnIfDurationExceeds: -1 })
        method() {}
      }
      return Bad;
    }).toThrow(/warnIfDurationExceeds/);
  });

  it('escalates the completion entry to "warn" when the duration threshold is exceeded', async () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ level: 'info', on: 'success', includeDuration: true, warnIfDurationExceeds: 5, logger })
      async slow() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'done';
      }
    }

    await new Orders().slow();

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].level).toBe('warn');
    expect(logger.entries[0].metadata).toMatchObject({ slow: true, warnIfDurationExceeds: 5 });
  });

  it('never downgrades an already-"error" entry when the threshold is exceeded', async () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ level: 'error', on: 'failure', includeDuration: true, warnIfDurationExceeds: 5, logger })
      async slowFailure() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error('boom');
      }
    }

    await expect(new Orders().slowFailure()).rejects.toThrow('boom');

    expect(logger.entries[0].level).toBe('error');
    expect(logger.entries[0].metadata).toMatchObject({ slow: true });
  });

  it('does not measure or log duration for a call-only decorator', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ on: 'call', includeDuration: true, logger })
      calculateTotal() {
        return 1;
      }
    }

    new Calc().calculateTotal();

    expect(logger.entries[0].duration).toBeUndefined();
  });

  it('an "always" trigger logs exactly once per call, for either outcome', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ on: 'always', logger })
      run(shouldThrow: boolean) {
        if (shouldThrow) throw new Error('boom');
        return 'ok';
      }
    }

    const calc = new Calc();
    calc.run(false);
    expect(() => calc.run(true)).toThrow('boom');

    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0].trigger).toBe('success');
    expect(logger.entries[1].trigger).toBe('failure');
  });

  it('an "on" array logs once per matching trigger that actually occurs', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ on: ['call', 'failure'], logger })
      run(): number {
        throw new Error('boom');
      }
    }

    expect(() => new Calc().run()).toThrow('boom');

    expect(logger.entries.map((e) => e.trigger)).toEqual(['call', 'failure']);
  });
});

describe('deprecated aliases (@log/@warn/@error)', () => {
  it('@log fires on every call at info level', () => {
    const entries: LogEntry[] = [];
    const logger: Logger = { log: (e) => entries.push(e), warn: () => undefined, error: () => undefined };

    class Svc {
      @log('doing work')
      run() {
        return 'ok';
      }
    }
    // the deprecated decorators don't accept a per-call logger override, so
    // exercise them through the global bridge instead:
    setLogger(logger);

    new Svc().run();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'info', trigger: 'call', message: 'doing work' });
  });

  it('@error only fires on failure and rethrows', () => {
    const entries: LogEntry[] = [];
    const logger: Logger = { log: () => undefined, warn: () => undefined, error: (e) => entries.push(e) };
    setLogger(logger);

    class Svc {
      @error('save failed')
      save(shouldFail: boolean) {
        if (shouldFail) throw new Error('boom');
        return 'ok';
      }
    }

    const svc = new Svc();
    expect(svc.save(false)).toBe('ok');
    expect(entries).toHaveLength(0);

    expect(() => svc.save(true)).toThrow('boom');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'error', trigger: 'failure' });
  });

  it('@warn fires on every call at warn level', () => {
    const entries: LogEntry[] = [];
    const logger: Logger = { log: () => undefined, warn: (e) => entries.push(e), error: () => undefined };
    setLogger(logger);

    class Svc {
      @warn('legacy endpoint')
      run() {
        return 'ok';
      }
    }

    new Svc().run();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'warn', trigger: 'call' });
  });
});
