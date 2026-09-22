# Toch-Lib (MVP)

Angular utilities for working with SAP backends — the shared logic layer for projects started from **toch-template**, so this MVP slice covers the OData query builder, adapter-based auth/SSO with Matomo logging, caching and the CSRF interceptor. Other template areas (SAP API client, generic HTTP client, session handling, overlay) will follow in later branches.

Works with **Angular 16 through 20** (partial-Ivy build, peer range `>=16 <21`).

## Installing in a project

```bash
npm install toch-lib
```

Until the package is on an npm registry, install it from a packed tarball:

```bash
# in this repo
npm run pack        # produces dist/toch-lib/toch-lib-0.1.0.tgz

# in your app
npm install ../path/to/toch-lib-0.1.0.tgz
```

## Setup

Register the config and interceptors once in `app.config.ts`:

```ts
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideTochLib } from 'toch-lib';
import { provideMockAuth } from 'toch-lib/auth';        // or provideSsoAuth()
import { provideCache } from 'toch-lib/cache';
import { provideTochLogger } from 'toch-lib/logger';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideTochLib({
      csrf: { fetchUrl: '/sap/opu/odata/sap/ZMY_SRV/', urlPrefixes: ['/sap/'] },
      sso: { pingUrl: '/sap/opu/odata/sap/ZMY_SRV/', userInfoUrl: '/sap/bc/ui2/start_up' },
    }),
    provideCache(),                         // optional config: provideCache({ defaultTtl: 120_000 })
    ...provideMockAuth(MOCK_USER),          // dev — swap for ...provideSsoAuth() in prod
    ...provideTochLogger('matomo'),         // 'console' (default) | 'matomo' | custom adapter
  ],
};
```

`provideTochLib` registers the CSRF interceptor; it stays inactive until the `csrf` config section exists, so enabling it is purely a config decision. `toch-lib/cache` and `toch-lib/logger` are opted into separately, via their own `provide*()` calls — nothing in either activates just by importing `toch-lib`.

## Entry points — take only what you need

Each area is its own entry point; anything you don't import tree-shakes away.

| Import from | Contents |
| --- | --- |
| `toch-lib/core` | `TOCH_LIB_CONFIG` + config types (csrf, sso) |
| `toch-lib/odata` | Fluent OData **v2 + v4** query builder (pure, no Angular services) |
| `toch-lib/csrf` | SAP `X-CSRF-Token: Fetch` interceptor + `CsrfTokenService` |
| `toch-lib/cache` | HTTP GET cache interceptor — `cache()`/`noCache()`, configurable TTL, request de-duplication |
| `toch-lib/auth` | Adapter-based `AuthService` (signal), mock/SSO adapters, `SsoService` |
| `toch-lib/logger` | `@log`/`@warn`/`@error` method decorators, console/Matomo adapters |
| `toch-lib` | everything above, plus `provideTochLib()` |

## OData query builder (`toch-lib/odata`)

One fluent API for both protocol versions — v2/v4 differences (`substringof` vs `contains`, `$inlinecount` vs `$count`, date/guid literals, `in` support) are handled per version:

```ts
import { odataV2, odataV4, guid } from 'toch-lib/odata';

odataV4<Product>('Products')
  .select('Id', 'Name', 'Price')
  .filter(f => f.and(f.eq('Category', 'Beverages'), f.between('Price', 10, 100)))
  .expand('Supplier', e => e.select('CompanyName'))
  .orderBy('Price', 'desc')
  .page(0, 20)
  .count()
  .toUrl('/odata/v4/catalog/');

odataV2('OrderSet')
  .filter(f => f.contains('Customer', 'SAP'))         // -> substringof('SAP',Customer)
  .byKey({ OrderId: '500001', Guid: guid('...') })
  .param('sap-client', '100');
```

## Auth / SSO (`toch-lib/auth`)

Adapter pattern, exactly like the template — components inject `AuthService`, the data source is decided by providers. No JWT/token flow in this MVP; auth state comes from the SSO session or a mock user:

```ts
// app.config.ts — dev
...provideMockAuth<MyUser>({ displayName: 'ישראל ישראלי', personalNumber: '123456789' })
// app.config.ts — prod: loads the user at startup from sso.userInfoUrl (with credentials)
...provideSsoAuth()

// anywhere
export class TopBarComponent {
  private readonly auth = inject<AuthService<MyUser>>(AuthService);
  readonly user = this.auth.getCurrentUser();   // readonly Signal<MyUser>
}
```

A custom source (e.g. a non-SSO API) is one class implementing `AuthAdapter<TUser>` bound to `AUTH_PROVIDER`.

`SsoService` covers both SSO shapes used against SAP backends: cookie/ticket SSO (`ping()`) and OAuth2/OIDC redirect SSO (`buildAuthorizeUrl()`, `login()`, `parseCallback()`, PKCE helpers).

## Caching (`toch-lib/cache`)

Caches successful `GET` responses in memory, with a configurable global default TTL (1 minute out of the box) and a per-request escape hatch. No decorators, no method wrapping, no URL/query-string hacks — just an `HttpInterceptor` plus two small `HttpContext` helpers.

### What it does

- Every `GET` request is cached by default — the interceptor is opt-in at the app level (`provideCache()`), but once registered, no per-request `cache()` call is needed for the common case.
- A response is cached only once it succeeds: a failed request (`HttpErrorResponse`, network error, etc.) is never stored, and never poisons later attempts.
- An expired entry is treated exactly like a miss and is removed, never returned stale.
- Three concurrent identical `GET`s (three components requesting the same URL before any of them has resolved) result in **one** backend call — not three — with all three receiving the same result.
- Non-`GET` requests are never touched.

### Setup

```ts
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideCache } from 'toch-lib/cache';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideCache(), // default TTL: 60_000ms (1 minute)
  ],
};
```

NgModule apps: add `provideCache(...)` to the root module's `providers` (`HttpClientModule` picks it up automatically, same as any other `HTTP_INTERCEPTORS` entry).

### Global configuration

```ts
provideCache({ defaultTtl: 120_000 }); // 2 minutes, applies to every request that doesn't override it
```

`defaultTtl` is the only setting in V1 (see "Cache policy" below for why the API stays this small on purpose). Omit it (`provideCache()`) to keep the 1-minute default.

### Per-request TTL and bypass

```ts
import { cache, noCache } from 'toch-lib/cache';

// Default: 1 minute (or whatever provideCache({ defaultTtl }) set)
this.http.get('/api/products');

// Cache for 5 minutes, overriding the global default for this request only
this.http.get('/api/products', { context: cache({ ttl: 5 * 60 * 1000 }) });

// Never cache — always hits the backend, never reads or writes the cache
this.http.get('/api/current-user', { context: noCache() });
```

`cache()`/`noCache()` return an `HttpContext` — nothing is encoded into the URL or query string, so cached requests look identical on the wire to uncached ones.

### How the interceptor works

```text
Angular Service
      |
      | HttpClient
      v
CacheInterceptor   — detects eligibility, reads HttpContext, gets a key, checks/stores through CacheManager
      |
      v
CacheManager       — get/set/delete/clear on the store, expiration, in-flight request de-duplication
      |
      v
CacheStore (interface)
      |
      v
MemoryCacheStore   — the only implementation today; swap it via the CACHE_STORE token later
```

`CacheInterceptor` is intentionally thin — every actual caching decision (is this fresh? what evicts it? is a request already in flight for this key?) lives in `CacheManager`, not scattered through the interceptor. `CacheStore` is a small interface (`get`/`set`/`delete`/`clear` over a `CacheEntry<T> { value, expiresAt }`) specifically so a different storage backend can be swapped in later without touching `CacheManager` or the interceptor at all.

For a request that isn't a `GET`, or carries `noCache()`, the interceptor does nothing but forward to `next.handle(req)` — it never touches `CacheManager`.

### Cache key behavior

`CacheKeyGenerator` builds the key as `` `${method}:${urlWithParams}` ``, so method, URL, and query parameters are all part of the key — `GET /api/users?page=1` and `GET /api/users?page=2` never collide. It's a dedicated class specifically so the key format can change later without touching the interceptor.

It deliberately does **not** use request headers (including `Authorization`) as part of the key — see Security, below.

### Cache expiration

Every stored entry carries `expiresAt` (epoch ms). A read compares `entry.expiresAt > Date.now()`: true is a hit, false is treated exactly like an outright miss **and** the stale entry is deleted from the store on that read. There's no separate sweep/timer — expiry is checked lazily, on read.

### Concurrent request handling

```text
             ┌── Component A
             │
GET /users ──┼── Component B  ──►  ONE HTTP request, shared by all three
             │
             └── Component C
```

When a request misses the cache, `CacheManager.dedupe(key, factory)` runs `factory()` (the actual backend call) once and multicasts the result to every caller for the same key that arrives while it's still pending — implemented with RxJS `shareReplay`, so it's a normal cold-Observable-becomes-shared-hot pattern, not custom bookkeeping. The in-flight entry is removed the moment the request settles, on **either** success or failure, so:

- a failed shared request is never cached, and
- the very next call (including an immediate retry after that failure) starts a fresh request rather than replaying the old one.

### Cache clearing / invalidation

```ts
import { CacheManager } from 'toch-lib/cache';

export class OrdersService {
  private readonly cacheManager = inject(CacheManager);

  saveOrder(order: Order) {
    return this.api.post('/api/orders', order).pipe(
      tap(() => this.cacheManager.delete('GET:/api/orders')) // or .clear() for everything
    );
  }
}
```

`noCache()` and invalidation are different things, and it's worth keeping them that way: `noCache()` means *don't read, don't write* for one specific request; `delete`/`clear` mean *remove something that's already stored*. V1 ships `delete(key)` and `clear()`; tag-based or pattern-based invalidation (`invalidateTag(...)`, `invalidateByTag(...)`) is a natural future extension of `CacheManager`/`CacheStore`, not added here because nothing in this library needs it yet.

### Security considerations

Be conservative about what ends up cached and for how long:

- **The cache key does not include headers.** `Authorization` (or any other header) is deliberately left out of `CacheKeyGenerator` — keying on a bearer token would make a token refresh silently fragment the cache instead of reusing entries, and is generally the wrong tool for scoping data to a user. If a request's result differs per user/tenant, make that explicit in the URL or query string (where `CacheKeyGenerator` already picks it up) — or reach for `noCache()`.
- **`toch-lib/cache` does not know which of your endpoints are sensitive.** It caches every successful `GET` by default. For anything user-specific, permission-sensitive, or where staleness would be unsafe (current-user profile, permissions, one-time tokens, anything behind per-request authorization that isn't in the URL), use `noCache()` explicitly rather than relying on a short TTL:
  ```ts
  this.http.get('/api/current-user', { context: noCache() });
  ```
- **When in doubt, use `noCache()`.** It's a single, obvious, per-request opt-out — the safe default when you're not sure whether caching a given endpoint is safe.
- The cache is in-memory and per-tab/session (`MemoryCacheStore`, backed by a `Map`) — it does not persist across reloads and is not shared across browser tabs, which limits (but does not eliminate) the blast radius of caching something that shouldn't have been.

### Cache policy (why there's no `bypass`/`refresh`/`no-store` enum)

V1 supports exactly two policies: normal caching (read on a hit, request + store on a miss) and `noCache()` (skip entirely). A `CachePolicy` enum with `refresh`/`no-store`/etc. was deliberately left out — nothing in this library needs it yet, and adding options that don't do anything meaningful yet would make the API lie about what's supported. `CacheOptions`/`CACHE_OPTIONS` (the `HttpContext` tokens) hold configuration only, no logic, so a future policy is additive: a new field plus a branch in `CacheInterceptor`, not a rewrite.

### Future extension points

- **Storage**: implement `CacheStore` and provide it via the `CACHE_STORE` token to back the cache with something other than a `Map` (e.g. persisted storage) without touching `CacheManager` or the interceptor.
- **Invalidation**: tag- or pattern-based invalidation on top of the existing `delete`/`clear`.
- **Cache policy**: additional `CacheOptions` fields (e.g. a `refresh`/force-reload flag) read by the interceptor alongside `ttl`.
- **Observability**: optional cache hit/miss/store events or hooks — deliberately not built in yet, and deliberately **not** wired into `toch-lib/logger` automatically; caching and logging stay independent modules. An app that wants to log cache activity can call `toch-lib/logger`'s `@Log()` on its own service methods, or `CacheManager` could later expose an event stream to subscribe to explicitly.

### API reference

| Export | What it is |
| --- | --- |
| `provideCache(config?)` | Registers `CACHE_CONFIG` and the interceptor. Call once, at app startup. |
| `cache(options?)` / `noCache()` | Per-request `HttpContext` helpers. |
| `CacheManager` | `get`/`set`/`delete`/`clear`/`dedupe` — inject it directly for manual invalidation or programmatic caching. |
| `CacheStore` / `CACHE_STORE` | The storage abstraction and its DI token, for swapping in a different backend. |
| `MemoryCacheStore` | The default (and only, for now) `CacheStore`. |
| `CacheKeyGenerator` | Builds `` `${method}:${urlWithParams}` `` cache keys; inject and override for a custom format. |
| `CacheConfig` / `CACHE_CONFIG` | `{ defaultTtl: number }` and its DI token. |

## CSRF interceptor (`toch-lib/csrf`)

Implements the SAP `X-CSRF-Token: Fetch` pattern: fetches and caches the token, attaches it to mutating requests, and retries once with a fresh token on a 403.

```ts
provideTochLib({ csrf: { fetchUrl: '/sap/opu/odata/sap/ZMY_SRV/', urlPrefixes: ['/sap/'] } });
```

Stays inactive (passes every request through untouched) until the `csrf` config section is set.

## Logger / Matomo (`toch-lib/logger`)

Logging is decorator-driven — no injected service, no manual `logger.log(...)` calls. One unified decorator, `@Log()`, covers every case:

```ts
import { Log } from 'toch-lib/logger';

@Injectable()
export class OrdersService {
  @Log({ level: 'info', message: 'Fetching orders' })
  getOrders() { return this.api.get<Order[]>('OrderSet'); }

  @Log({ level: 'error', message: 'Saving order', includeDuration: true, warnIfDurationExceeds: 1000 })
  saveOrder(order: Order) { return this.api.post<Order>('OrderSet', order); }
}
```

`level` and `message` are the only two things you decide on — there's no trigger to configure. Every decorated call always logs once at invocation and exactly once on completion, whichever actually happens (`LogEntry.trigger` tells you which: `'call'`, `'success'`, or `'failure'`).

A bare string is shorthand for `{ level: 'info', message }`: `@Log('Fetching orders')`.

**`LogOptions`:**

| Field | Required? | Meaning |
| --- | --- | --- |
| `level` | **required** | `'debug' \| 'info' \| 'warn' \| 'error'` — which `Logger` method every entry this decorator produces goes to (both the call entry and its completion entry). This only picks a severity — it has no effect on whether the method actually fails; log severity and execution outcome are separate axes. |
| `message` | **required** | The text logged, on both the call entry and its completion entry. |
| `includeDuration` | optional, default `false` | Attaches elapsed ms to the completion entry. For an Observable, duration is measured **per subscription** — from subscribe to complete/error, never from when the method was called — and nothing is subscribed to on your behalf. |
| `warnIfDurationExceeds` | optional | When the completion entry's duration exceeds this (ms), its level is escalated to at least `'warn'` (an `'error'` entry is never downgraded). No second entry is added — the one completion log just gets louder. |
| `includeArgs` | optional, default `false` | Attach the raw call arguments to the call entry. Off by default: arguments often carry request bodies or credentials that shouldn't land in logs unreviewed. |
| `metadata` | optional | Extra structured context: a static object, or `({ args }) => object`. |
| `logger` | optional | Override the backend for this one decorator (mainly for tests). |

Return-type handling is automatic and detected at call time (`instanceof Promise` / `instanceof Observable`), not from static typing — the same `@Log(...)` works unmodified on synchronous, Promise-returning, and Observable-returning methods:

- **Synchronous** — the return value passes through untouched; a thrown error is logged and rethrown.
- **Promise** — resolves/rejects with the exact original value/reason (a new Promise wrapping the original, so completion can be logged).
- **Observable** — cold semantics are preserved: nothing is subscribed to on your behalf, each subscriber gets its own duration measurement and its own completion log entry, and unsubscribing tears down the source subscription.

Pick the log backend once, at app startup:

```ts
...provideTochLogger('matomo')    // or 'console' (default), or your own Logger class
```

The Matomo backend pushes entries as `trackEvent('app-log', 'trigger:level', message)` to the `_paq` queue (the Matomo snippet stays in the app's `index.html`) and mirrors to the console; it degrades to console-only when Matomo isn't loaded. Before `provideTochLogger` runs (or in code that never calls it — this module has no hard Angular dependency), `@Log()` falls back to a plain console sink.

### Deprecated: `@log`/`@warn`/`@error`

The single-purpose decorators from the previous iteration of this library still work, implemented as thin wrappers over `@Log()`:

```ts
@log('fetching orders')     // same as @Log({ level: 'info',  message: 'fetching orders' })
@warn('legacy endpoint')    // same as @Log({ level: 'warn',  message: 'legacy endpoint' })
@error('save failed')       // same as @Log({ level: 'error', message: 'save failed' })
```

**Behavior change from the previous release:** `@Log()` no longer supports picking a trigger, so these aliases now log a completion entry too, at the same level as the call entry. `@log`/`@warn` previously logged only on call, and `@error` only logged (at `'error'`) when the method actually failed — now all three log **every** entry they produce (call, and whichever of success/failure happens) at their one configured level. In practice this means `@error('x')` will call `logger.error(...)` even for successful calls, not just failing ones. If you relied on `@error` staying silent on success, switch to `@Log({ level: 'error', message: 'x' })` and filter/ignore the `'success'`-trigger entries in your `Logger`, or migrate to a `Logger` that only escalates on `entry.trigger === 'failure'`.

They're marked `@deprecated` and kept only for code already using them — write new code against `@Log(...)` directly.

### Custom logging backends

`Logger` is the only seam the decorators talk to — nothing calls `console.*` directly outside the built-in `ConsoleLogger`/`MatomoLogger`:

```ts
export interface Logger {
  log(entry: LogEntry): void;
  warn(entry: LogEntry): void;
  error(entry: LogEntry): void;
  debug?(entry: LogEntry): void; // optional — falls back to log() when absent
}
```

`provideTochLogger(MyLogger)` registers any class implementing `Logger` through Angular DI. `LogEntry` is the structured, extensible shape every backend receives (level, trigger, message, timestamp, class/method name, duration, error, metadata) — see `logger.types.ts` for the full shape and field-by-field documentation.

### Enforcing `@Log()` with ESLint

A method carrying a logging decorator today can have it deleted tomorrow — decorators are a runtime mechanism, not a compile-time guarantee. To catch that in review/CI, `tools/eslint-rules/require-log-decorator.js` is a real, tested ESLint rule that flags class methods with none of `Log`/`log`/`warn`/`error` on them. It's deliberately **not** enabled repo-wide (most methods — pure helpers, trivial getters — don't need logging, and blanket enforcement is noise, not signal); enable it per file/folder via ESLint `overrides`, e.g. all your `*.service.ts` files:

```json
{
  "overrides": [
    {
      "files": ["src/**/*.service.ts"],
      "rules": {
        "require-log-decorator": ["warn", { "checkProtected": true, "ignoreNames": ["ngOnInit"] }]
      }
    }
  ]
}
```

See `.eslintrc.json` in this repo for a working example (scoped to the auth adapters) and run it with `npm run lint`. Options: `decoratorNames` (default `['Log','log','warn','error']`), `checkPrivate`/`checkProtected` (default `false`/`true`), `ignoreNames`. Constructors, getters/setters, and computed member names are always exempt.

## Development (this repo)

```bash
npm install
npm run build     # ng-packagr -> dist/toch-lib
npm run pack      # build + installable .tgz
npm test          # Jest: @Log() engine + the require-log-decorator ESLint rule's own tests
npm run lint      # ESLint, including require-log-decorator where .eslintrc.json enables it
```

## License

MIT
