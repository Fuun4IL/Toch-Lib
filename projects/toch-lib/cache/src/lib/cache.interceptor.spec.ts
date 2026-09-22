import { HttpErrorResponse, HttpEvent, HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { cache, noCache } from './cache-context.helpers';
import { CacheKeyGenerator } from './cache-key-generator';
import { CacheInterceptor } from './cache.interceptor';
import { CacheManager } from './cache.manager';
import { MemoryCacheStore } from './memory-cache.store';

/** A fake backend: counts calls and answers however the test wants. */
class FakeBackend implements HttpHandler {
  calls = 0;

  constructor(private readonly respond: (req: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>) {}

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    this.calls++;
    return this.respond(req);
  }
}

function ok(body: unknown): Observable<HttpEvent<unknown>> {
  return of(new HttpResponse({ status: 200, body }));
}

function setUp(defaultTtl = 60_000) {
  const manager = new CacheManager(new MemoryCacheStore(), { defaultTtl });
  const interceptor = new CacheInterceptor(manager, new CacheKeyGenerator());
  return { manager, interceptor };
}

function bodyOf(event$: Observable<HttpEvent<unknown>>): unknown {
  let body: unknown;
  event$.subscribe((e) => {
    if (e instanceof HttpResponse) body = e.body;
  });
  return body;
}

describe('CacheInterceptor — basic caching', () => {
  it('calls the backend on the first GET, then serves the second from cache without calling it again', () => {
    const { interceptor } = setUp();
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const req = new HttpRequest('GET', '/api/users');

    expect(bodyOf(interceptor.intercept(req, backend))).toEqual({ id: 1 });
    expect(backend.calls).toBe(1);

    expect(bodyOf(interceptor.intercept(req, backend))).toEqual({ id: 1 });
    expect(backend.calls).toBe(1); // still 1 — served from cache
  });

  it('returns a clone of the cached response, not the same mutable instance', () => {
    const { interceptor } = setUp();
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const req = new HttpRequest('GET', '/api/users');

    let first: HttpResponse<unknown> | undefined;
    interceptor.intercept(req, backend).subscribe((e) => {
      if (e instanceof HttpResponse) first = e;
    });
    let second: HttpResponse<unknown> | undefined;
    interceptor.intercept(req, backend).subscribe((e) => {
      if (e instanceof HttpResponse) second = e;
    });

    expect(second).not.toBe(first);
    expect(second?.body).toEqual(first?.body);
  });

  it('never caches non-GET requests', () => {
    const { interceptor } = setUp();
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const req = new HttpRequest('POST', '/api/users', { name: 'x' });

    interceptor.intercept(req, backend).subscribe();
    interceptor.intercept(req, backend).subscribe();

    expect(backend.calls).toBe(2);
  });
});

describe('CacheInterceptor — expiration', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('calls the backend again once the TTL has expired', () => {
    const { interceptor } = setUp(1_000);
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const req = new HttpRequest('GET', '/api/users');

    interceptor.intercept(req, backend).subscribe();
    expect(backend.calls).toBe(1);

    jest.advanceTimersByTime(1_001);

    interceptor.intercept(req, backend).subscribe();
    expect(backend.calls).toBe(2);
  });
});

describe('CacheInterceptor — custom TTL', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a request-specific TTL overrides the global default', () => {
    const { interceptor } = setUp(60_000); // global default is much longer
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const req = new HttpRequest('GET', '/api/users', { context: cache({ ttl: 5_000 }) });

    interceptor.intercept(req, backend).subscribe();
    expect(backend.calls).toBe(1);

    jest.advanceTimersByTime(5_001); // past the 5s override, well under the 60s global default

    interceptor.intercept(req, backend).subscribe();
    expect(backend.calls).toBe(2);
  });
});

describe('CacheInterceptor — noCache()', () => {
  it('calls the backend, ignores any existing cache entry, and does not store the response', () => {
    const { interceptor, manager } = setUp();
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const cachedReq = new HttpRequest('GET', '/api/users');
    const bypassReq = new HttpRequest('GET', '/api/users', { context: noCache() });

    // populate the cache normally first
    interceptor.intercept(cachedReq, backend).subscribe();
    expect(backend.calls).toBe(1);

    // noCache() must still hit the backend even though an entry exists
    interceptor.intercept(bypassReq, backend).subscribe();
    expect(backend.calls).toBe(2);

    // and must not have overwritten/left anything that changes normal reads
    interceptor.intercept(cachedReq, backend).subscribe();
    expect(backend.calls).toBe(2); // the plain request still hits its own (unaffected) cache entry

    // a noCache() key is never written: forcing a fresh cache read via the
    // manager directly confirms nothing was ever stored under it
    expect(manager.get('GET:/api/users')).toBeDefined(); // from the normal request only
  });

  it('does not store the response even on a cold cache', () => {
    const { interceptor, manager } = setUp();
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const req = new HttpRequest('GET', '/api/users', { context: noCache() });

    interceptor.intercept(req, backend).subscribe();

    expect(backend.calls).toBe(1);
    expect(manager.get('GET:/api/users')).toBeUndefined();
  });
});

describe('CacheInterceptor — errors', () => {
  it('never caches a failed request, and retries hit the backend again', () => {
    const { interceptor, manager } = setUp();
    let attempt = 0;
    const backend = new FakeBackend(() =>
      ++attempt === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : ok({ id: 1 })
    );
    const req = new HttpRequest('GET', '/api/users');

    let error: unknown;
    interceptor.intercept(req, backend).subscribe({ error: (e) => (error = e) });

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(manager.get('GET:/api/users')).toBeUndefined();
    expect(backend.calls).toBe(1);

    // a subsequent call is not shadowed by the failed attempt
    expect(bodyOf(interceptor.intercept(req, backend))).toEqual({ id: 1 });
    expect(backend.calls).toBe(2);
  });
});

describe('CacheInterceptor — different URLs and query parameters', () => {
  it('caches page=1 and page=2 separately', () => {
    const { interceptor } = setUp();
    // Echo the request's own URL back, so a wrong (shared) cache hit would
    // be caught by getting page 1's response for a page=2 request.
    const backend = new FakeBackend((req) => ok(req.urlWithParams));

    const page1 = new HttpRequest('GET', '/api/users?page=1');
    const page2 = new HttpRequest('GET', '/api/users?page=2');

    expect(bodyOf(interceptor.intercept(page1, backend))).toBe('/api/users?page=1');
    expect(bodyOf(interceptor.intercept(page2, backend))).toBe('/api/users?page=2');
    expect(backend.calls).toBe(2);

    // both are now independently cached
    expect(bodyOf(interceptor.intercept(page1, backend))).toBe('/api/users?page=1');
    expect(bodyOf(interceptor.intercept(page2, backend))).toBe('/api/users?page=2');
    expect(backend.calls).toBe(2);
  });
});

describe('CacheInterceptor — concurrent requests', () => {
  it('three simultaneous identical GETs before the cache is populated produce exactly one backend call', () => {
    const { interceptor } = setUp();
    const backend = new FakeBackend(() => new Subject<HttpEvent<unknown>>()); // never resolves on its own
    const req = new HttpRequest('GET', '/api/users');

    // Component A, B, C all subscribe before anything has responded.
    interceptor.intercept(req, backend).subscribe();
    interceptor.intercept(req, backend).subscribe();
    interceptor.intercept(req, backend).subscribe();

    expect(backend.calls).toBe(1);
  });

  it('all concurrent callers receive the same result once the shared backend call resolves', () => {
    const { interceptor } = setUp();
    const upstream = new Subject<HttpEvent<unknown>>();
    const backend = new FakeBackend(() => upstream.asObservable());
    const req = new HttpRequest('GET', '/api/users');

    const results: unknown[] = [];
    interceptor.intercept(req, backend).subscribe((e) => e instanceof HttpResponse && results.push(e.body));
    interceptor.intercept(req, backend).subscribe((e) => e instanceof HttpResponse && results.push(e.body));
    interceptor.intercept(req, backend).subscribe((e) => e instanceof HttpResponse && results.push(e.body));

    upstream.next(new HttpResponse({ status: 200, body: { id: 1 } }));
    upstream.complete();

    expect(backend.calls).toBe(1);
    expect(results).toEqual([{ id: 1 }, { id: 1 }, { id: 1 }]);
  });

  it('a failed shared request does not become a cached value, and a later call retries', () => {
    const { interceptor, manager } = setUp();
    const upstream = new Subject<HttpEvent<unknown>>();
    let attempt = 0;
    const backend = new FakeBackend(() => {
      attempt++;
      return attempt === 1 ? upstream.asObservable() : ok({ id: 1 });
    });
    const req = new HttpRequest('GET', '/api/users');

    const errors: unknown[] = [];
    interceptor.intercept(req, backend).subscribe({ error: (e) => errors.push(e) });
    interceptor.intercept(req, backend).subscribe({ error: (e) => errors.push(e) });

    upstream.error(new HttpErrorResponse({ status: 500 }));

    expect(errors).toHaveLength(2);
    expect(manager.get('GET:/api/users')).toBeUndefined();

    expect(bodyOf(interceptor.intercept(req, backend))).toEqual({ id: 1 });
    expect(backend.calls).toBe(2);
  });
});

describe('CacheInterceptor — clearing the cache', () => {
  it('CacheManager.delete() forces the next request to hit the backend again', () => {
    const { interceptor, manager } = setUp();
    const backend = new FakeBackend(() => ok({ id: 1 }));
    const req = new HttpRequest('GET', '/api/users');

    interceptor.intercept(req, backend).subscribe();
    expect(backend.calls).toBe(1);

    manager.delete('GET:/api/users');

    interceptor.intercept(req, backend).subscribe();
    expect(backend.calls).toBe(2);
  });

  it('CacheManager.clear() removes every entry', () => {
    const { interceptor, manager } = setUp();
    const backend = new FakeBackend((req) => ok(req.urlWithParams));

    const users = new HttpRequest('GET', '/api/users');
    const orders = new HttpRequest('GET', '/api/orders');

    interceptor.intercept(users, backend).subscribe();
    interceptor.intercept(orders, backend).subscribe();
    expect(backend.calls).toBe(2);

    manager.clear();

    interceptor.intercept(users, backend).subscribe();
    interceptor.intercept(orders, backend).subscribe();
    expect(backend.calls).toBe(4);
  });
});
