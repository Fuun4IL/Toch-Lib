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
  it('preserves the return value and logs a call entry then a success entry', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ level: 'info', message: 'calculating total', logger })
      calculateTotal(a: number, b: number) {
        return a + b;
      }
    }

    const result = new Calc().calculateTotal(2, 3);

    expect(result).toBe(5);
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0]).toMatchObject({
      level: 'info',
      trigger: 'call',
      message: 'calculating total',
      className: 'Calc',
      methodName: 'calculateTotal',
    });
    expect(logger.entries[1]).toMatchObject({ trigger: 'success', message: 'calculating total' });
    expect(typeof logger.entries[0].timestamp).toBe('string');
  });

  it('defaults the message to the method name when none is given', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ level: 'info', message: '', logger })
      calculateTotal() {
        return 0;
      }
    }

    new Calc().calculateTotal();

    expect(logger.entries[0].message).toBe('calculateTotal');
    expect(logger.entries[1].message).toBe('calculateTotal');
  });

  it('accepts a bare string as shorthand for { level: "info", message }', () => {
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

    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0]).toMatchObject({ level: 'info', trigger: 'call', message: 'shorthand message' });
    expect(logger.entries[1]).toMatchObject({ level: 'info', trigger: 'success', message: 'shorthand message' });
  });

  it('logs a failure entry and rethrows synchronous exceptions unchanged', () => {
    const logger = createRecordingLogger();
    const boom = new Error('boom');

    class Calc {
      @Log({ level: 'error', message: 'calculating total', logger })
      calculateTotal(): number {
        throw boom;
      }
    }

    expect(() => new Calc().calculateTotal()).toThrow(boom);
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0].trigger).toBe('call');
    expect(logger.entries[1]).toMatchObject({ trigger: 'failure', error: boom });
  });

  it('does not include call arguments unless includeArgs is set', () => {
    const logger = createRecordingLogger();

    class Auth {
      @Log({ level: 'info', message: 'login', logger })
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
      @Log({ level: 'info', message: 'calc', includeArgs: true, logger })
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
      @Log({ level: 'info', message: 'static', metadata: { source: 'calc' }, logger })
      staticMeta() {
        return 0;
      }

      @Log({ level: 'info', message: 'dynamic', metadata: ({ args }) => ({ firstArg: args[0] }), logger })
      dynamicMeta(a: number) {
        return a;
      }
    }

    const calc = new Calc();
    calc.staticMeta();
    calc.dynamicMeta(42);

    expect(logger.entries[0].metadata).toEqual({ source: 'calc' }); // staticMeta call entry
    expect(logger.entries[2].metadata).toEqual({ firstArg: 42 }); // dynamicMeta call entry
  });
});

describe('@Log — Promise-returning methods', () => {
  it('logs success after resolution and preserves the resolved value', async () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ level: 'info', message: 'save', includeDuration: true, logger })
      async saveOrder(order: { id: number }) {
        return order;
      }
    }

    const result = await new Orders().saveOrder({ id: 1 });

    expect(result).toEqual({ id: 1 });
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[1]).toMatchObject({ trigger: 'success' });
    expect(typeof logger.entries[1].duration).toBe('number');
  });

  it('logs failure and preserves the original rejection reason', async () => {
    const logger = createRecordingLogger();
    const reason = new Error('save failed');

    class Orders {
      @Log({ level: 'error', message: 'save', logger })
      async saveOrder(): Promise<void> {
        throw reason;
      }
    }

    await expect(new Orders().saveOrder()).rejects.toBe(reason);
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[1]).toMatchObject({ trigger: 'failure', error: reason, level: 'error' });
  });

  it('resolves/rejects with the exact original value/reason (a new Promise wrapper, same result)', () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ level: 'info', message: 'save', logger })
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
      @Log({ level: 'info', message: 'get orders', logger })
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
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0].trigger).toBe('call');
    expect(logger.entries[1].trigger).toBe('success');
  });

  it('logs the error and re-emits it to the subscriber', () => {
    const logger = createRecordingLogger();
    const failure = new Error('network down');

    class OrdersApi {
      @Log({ level: 'error', message: 'get orders', logger })
      getOrders() {
        return new Observable((subscriber) => subscriber.error(failure));
      }
    }

    let seenError: unknown;
    new OrdersApi().getOrders().subscribe({ error: (e) => (seenError = e) });

    expect(seenError).toBe(failure);
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[1]).toMatchObject({ trigger: 'failure', error: failure });
  });

  it('does not subscribe to the source when nothing subscribes to the result', () => {
    const logger = createRecordingLogger();
    const subscribeCounter = { count: 0 };

    class OrdersApi {
      @Log({ level: 'info', message: 'get orders', logger })
      getOrders() {
        return coldObservable([1], subscribeCounter);
      }
    }

    new OrdersApi().getOrders(); // never subscribed

    expect(subscribeCounter.count).toBe(0);
    expect(logger.entries).toHaveLength(1); // only the call entry — no completion without a subscriber
    expect(logger.entries[0].trigger).toBe('call');
  });

  it('subscribes to the source exactly once per subscriber, preserving cold semantics', () => {
    const logger = createRecordingLogger();
    const subscribeCounter = { count: 0 };

    class OrdersApi {
      @Log({ level: 'info', message: 'get orders', logger })
      getOrders() {
        return coldObservable([1], subscribeCounter);
      }
    }

    const result$ = new OrdersApi().getOrders();
    result$.subscribe();
    result$.subscribe();

    expect(subscribeCounter.count).toBe(2);
    // 1 call entry + 2 completion entries (one per subscription)
    expect(logger.entries).toHaveLength(3);
    expect(logger.entries.filter((e) => e.trigger === 'success')).toHaveLength(2);
  });

  it('unsubscribing from the result tears down the source subscription', () => {
    const logger = createRecordingLogger();
    let torndown = false;

    class OrdersApi {
      @Log({ level: 'info', message: 'stream', logger })
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
      @Log({ level: 'info', message: 'stream', includeDuration: true, logger })
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

    const completion = logger.entries.find((e) => e.trigger === 'success');
    expect(completion).toBeDefined();
    // If duration were measured from the call above, it would be ~70ms.
    // Measured from subscription, it's ~20ms — proving the timer only
    // started once something actually subscribed.
    expect(completion?.duration).toBeGreaterThanOrEqual(15);
    expect(completion?.duration).toBeLessThan(50);
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
        @Log({ level: 'critical', message: 'x' })
        method() {}
      }
      return Bad;
    }).toThrow(/unsupported level/i);
  });

  it('rejects a negative duration threshold', () => {
    expect(() => {
      class Bad {
        @Log({ level: 'info', message: 'x', warnIfDurationExceeds: -1 })
        method() {}
      }
      return Bad;
    }).toThrow(/warnIfDurationExceeds/);
  });

  it('requires level and message at the type level', () => {
    // @ts-expect-error level and message are required — this must not compile
    Log({});
    // @ts-expect-error message is required even when level is given
    Log({ level: 'info' });
  });

  it('escalates the completion entry to "warn" when the duration threshold is exceeded', async () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ level: 'info', message: 'slow', includeDuration: true, warnIfDurationExceeds: 5, logger })
      async slow() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'done';
      }
    }

    await new Orders().slow();

    const completion = logger.entries.find((e) => e.trigger === 'success');
    expect(completion?.level).toBe('warn');
    expect(completion?.metadata).toMatchObject({ slow: true, warnIfDurationExceeds: 5 });
  });

  it('never downgrades an already-"error" entry when the threshold is exceeded', async () => {
    const logger = createRecordingLogger();

    class Orders {
      @Log({ level: 'error', message: 'slow failure', includeDuration: true, warnIfDurationExceeds: 5, logger })
      async slowFailure() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error('boom');
      }
    }

    await expect(new Orders().slowFailure()).rejects.toThrow('boom');

    const completion = logger.entries.find((e) => e.trigger === 'failure');
    expect(completion?.level).toBe('error');
    expect(completion?.metadata).toMatchObject({ slow: true });
  });

  it('does not measure duration on the call entry (nothing has run yet)', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ level: 'info', message: 'calc', includeDuration: true, logger })
      calculateTotal() {
        return 1;
      }
    }

    new Calc().calculateTotal();

    expect(logger.entries[0].trigger).toBe('call');
    expect(logger.entries[0].duration).toBeUndefined();
    expect(logger.entries[1].trigger).toBe('success');
    expect(typeof logger.entries[1].duration).toBe('number');
  });

  it('logs exactly two entries per call — one call entry, one completion entry — for either outcome', () => {
    const logger = createRecordingLogger();

    class Calc {
      @Log({ level: 'info', message: 'run', logger })
      run(shouldThrow: boolean) {
        if (shouldThrow) throw new Error('boom');
        return 'ok';
      }
    }

    const calc = new Calc();
    calc.run(false);
    expect(() => calc.run(true)).toThrow('boom');

    expect(logger.entries.map((e) => e.trigger)).toEqual(['call', 'success', 'call', 'failure']);
  });
});

describe('deprecated aliases (@log/@warn/@error)', () => {
  it('@log logs a call entry and a success entry, both at info level', () => {
    const entries: LogEntry[] = [];
    const logger: Logger = { log: (e) => entries.push(e), warn: () => undefined, error: () => undefined };
    setLogger(logger);

    class Svc {
      @log('doing work')
      run() {
        return 'ok';
      }
    }

    new Svc().run();

    expect(entries.map((e) => e.trigger)).toEqual(['call', 'success']);
    expect(entries[0]).toMatchObject({ level: 'info', message: 'doing work' });
  });

  it('@error logs every entry (call + completion) at error level, and rethrows on failure', () => {
    // NOTE: unlike the pre-@Log() @error, which fired only on failure, the
    // alias is now a thin wrapper over Log({ level: 'error', message }) —
    // and Log() always logs a call entry plus a completion entry. There is
    // no more per-trigger level, so @error now logs *everything* it produces
    // (including successful calls) at 'error' severity. This is a real
    // behavior change from the previous @error — see the README.
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
    expect(entries.map((e) => e.trigger)).toEqual(['call', 'success']);

    entries.length = 0;
    expect(() => svc.save(true)).toThrow('boom');
    expect(entries.map((e) => e.trigger)).toEqual(['call', 'failure']);
    expect(entries[1]).toMatchObject({ level: 'error', trigger: 'failure' });
  });

  it('@warn logs a call entry and a success entry, both at warn level', () => {
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

    expect(entries.map((e) => e.trigger)).toEqual(['call', 'success']);
  });
});
