import { Observable, Subject, of, throwError } from 'rxjs';
import { CacheManager } from './cache.manager';
import { MemoryCacheStore } from './memory-cache.store';

function createManager(defaultTtl = 60_000): CacheManager {
  return new CacheManager(new MemoryCacheStore(), { defaultTtl });
}

describe('CacheManager — get/set/expiration', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns undefined on a miss', () => {
    const manager = createManager();
    expect(manager.get('missing')).toBeUndefined();
  });

  it('returns a stored value while it is still fresh', () => {
    const manager = createManager();
    manager.set('k', { id: 1 });
    expect(manager.get('k')).toEqual({ id: 1 });
  });

  it('uses the configured default TTL when none is given to set()', () => {
    const manager = createManager(1_000);
    manager.set('k', 'v');

    jest.advanceTimersByTime(999);
    expect(manager.get('k')).toBe('v');

    jest.advanceTimersByTime(2);
    expect(manager.get('k')).toBeUndefined();
  });

  it('honors a per-entry TTL override', () => {
    const manager = createManager(60_000); // global default is much longer
    manager.set('k', 'v', 5_000);

    jest.advanceTimersByTime(4_999);
    expect(manager.get('k')).toBe('v');

    jest.advanceTimersByTime(2);
    expect(manager.get('k')).toBeUndefined();
  });

  it('treats an expired entry as a miss and removes it from the store', () => {
    const store = new MemoryCacheStore();
    const manager = new CacheManager(store, { defaultTtl: 1_000 });
    manager.set('k', 'v');

    jest.advanceTimersByTime(1_001);
    expect(manager.get('k')).toBeUndefined();
    // it's gone from the underlying store too, not just "invisible"
    expect(store.get('k')).toBeUndefined();
  });

  it('delete() removes one entry', () => {
    const manager = createManager();
    manager.set('a', 1);
    manager.set('b', 2);

    manager.delete('a');

    expect(manager.get('a')).toBeUndefined();
    expect(manager.get('b')).toBe(2);
  });

  it('clear() removes every entry', () => {
    const manager = createManager();
    manager.set('a', 1);
    manager.set('b', 2);

    manager.clear();

    expect(manager.get('a')).toBeUndefined();
    expect(manager.get('b')).toBeUndefined();
  });
});

describe('CacheManager — dedupe (in-flight request de-duplication)', () => {
  it('shares one execution of factory() across concurrent callers for the same key', () => {
    const manager = createManager();
    let callCount = 0;
    const factory = () => {
      callCount++;
      return of('result');
    };

    const a = manager.dedupe('k', factory);
    const b = manager.dedupe('k', factory);
    const c = manager.dedupe('k', factory);

    expect(a).toBe(b);
    expect(b).toBe(c);

    let aValue: string | undefined;
    let bValue: string | undefined;
    let cValue: string | undefined;
    a.subscribe((v) => (aValue = v));
    b.subscribe((v) => (bValue = v));
    c.subscribe((v) => (cValue = v));

    expect(callCount).toBe(1);
    expect([aValue, bValue, cValue]).toEqual(['result', 'result', 'result']);
  });

  it('removes the in-flight entry once the request completes, so a later call starts fresh', () => {
    const manager = createManager();
    let callCount = 0;
    const factory = () => {
      callCount++;
      return of('result');
    };

    manager.dedupe('k', factory).subscribe();
    manager.dedupe('k', factory).subscribe();

    expect(callCount).toBe(2); // second call happened after the first settled
  });

  it('removes the in-flight entry on error, so a retry starts a fresh request', () => {
    const manager = createManager();
    let attempt = 0;
    const factory = () => {
      attempt++;
      return attempt === 1 ? throwError(() => new Error('boom')) : of('ok');
    };

    let firstError: unknown;
    manager.dedupe('k', factory).subscribe({ error: (e) => (firstError = e) });
    expect(firstError).toBeInstanceOf(Error);

    let secondValue: string | undefined;
    manager.dedupe('k', factory).subscribe((v) => (secondValue = v));

    expect(attempt).toBe(2);
    expect(secondValue).toBe('ok');
  });

  it('a failed in-flight request never produces a cached value on its own', () => {
    // dedupe() only shares the request; it never writes to the store — that
    // stays the caller's job (see CacheInterceptor), so a failure simply
    // propagates without ever touching CacheManager.set().
    const manager = createManager();

    let error: unknown;
    manager.dedupe('k', () => throwError(() => new Error('boom'))).subscribe({
      error: (e) => (error = e),
    });

    expect(error).toBeInstanceOf(Error);
    expect(manager.get('k')).toBeUndefined();
  });

  it('does not call factory() again for a subscriber that joins while the request is still pending', () => {
    const manager = createManager();
    let callCount = 0;
    const subject = new Subject<string>();
    const factory = (): Observable<string> => {
      callCount++;
      return subject.asObservable();
    };

    const first$ = manager.dedupe('k', factory);
    first$.subscribe();

    // a second caller for the same key joins before the first has resolved
    const second$ = manager.dedupe('k', factory);
    let secondValue: string | undefined;
    second$.subscribe((v) => (secondValue = v));

    expect(callCount).toBe(1);

    subject.next('done');
    subject.complete();

    expect(secondValue).toBe('done');
  });
});
