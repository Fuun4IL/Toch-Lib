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
import { provideTochLogger } from 'toch-lib/logger';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideTochLib({
      csrf: { fetchUrl: '/sap/opu/odata/sap/ZMY_SRV/', urlPrefixes: ['/sap/'] },
      cache: { interceptor: { urlPrefixes: ['/sap/'], ttlMs: 60_000 } },
      sso: { pingUrl: '/sap/opu/odata/sap/ZMY_SRV/', userInfoUrl: '/sap/bc/ui2/start_up' },
    }),
    ...provideMockAuth(MOCK_USER),          // dev — swap for ...provideSsoAuth() in prod
    ...provideTochLogger('matomo'),         // 'console' (default) | 'matomo' | custom adapter
  ],
};
```

`provideTochLib` registers the CSRF and cache interceptors; both stay inactive until their config section exists, so enabling them is purely a config decision.

## Entry points — take only what you need

Each area is its own entry point; anything you don't import tree-shakes away.

| Import from | Contents |
| --- | --- |
| `toch-lib/core` | `TOCH_LIB_CONFIG` + config types (csrf, sso, cache) |
| `toch-lib/odata` | Fluent OData **v2 + v4** query builder (pure, no Angular services) |
| `toch-lib/csrf` | SAP `X-CSRF-Token: Fetch` interceptor + `CsrfTokenService` |
| `toch-lib/cache` | `CacheService` (TTL, tags, validate/invalidate) + HTTP GET cache interceptor |
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

You decide what to save and when it stops being valid:

```ts
// transparent HTTP caching — enable via config: cache.interceptor
// after a mutation, clear exactly what it affected:
cache.invalidate(httpCacheKey(url));
cache.invalidateWhere(/OrderSet/);
cache.invalidateTag(HTTP_CACHE_TAG);      // all cached responses

// manual/service-level caching:
cache.wrap('products', this.http.get<Product[]>(url), { ttlMs: 60_000, tags: ['products'] });
cache.set('draft', order, { ttlMs: Infinity });
cache.validate('draft', o => o.userId === user.id);   // entry removed when the rule fails
```

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
  @Log({ level: 'info', message: 'Fetching orders', on: 'call' })
  getOrders() { return this.api.get<Order[]>('OrderSet'); }

  @Log({ level: 'error', message: 'Save failed', on: 'failure' })
  saveOrder(order: Order) { return this.api.post<Order>('OrderSet', order); }

  @Log({ level: 'info', message: 'Sync', on: 'always', includeDuration: true, warnIfDurationExceeds: 1000 })
  syncCatalog() { return this.api.get<Catalog>('CatalogSet'); }
}
```

A bare string is shorthand for `{ message }` (level `'info'`, `on: 'call'`): `@Log('Fetching orders')`.

**`LogOptions`:**

| Field | Default | Meaning |
| --- | --- | --- |
| `level` | `'info'` | `'debug' \| 'info' \| 'warn' \| 'error'` — which `Logger` method this decorator's entries go to. Independent of `on`: a `failure` trigger can log at `'warn'` if that's the right severity for you: severity and execution outcome are separate axes. |
| `message` | the method name | The text logged. |
| `on` | `'call'` | One or more of `'call'` (fires at invocation, before the method runs), `'success'` (completed without error), `'failure'` (threw/rejected/errored), `'always'` (logs exactly one completion entry either way). Pass an array (`on: ['call', 'failure']`) to log on more than one trigger. |
| `includeDuration` | `false` | Attaches elapsed ms to `success`/`failure`/`always` entries. Ignored for a `call`-only decorator (nothing has run yet). For an Observable, duration is measured **per subscription** — from subscribe to complete/error, never from when the method was called — and nothing is subscribed to on your behalf. |
| `warnIfDurationExceeds` | — | When a completion entry's duration exceeds this (ms), its level is escalated to at least `'warn'` (an `'error'` entry is never downgraded). No second entry is added — the one completion log just gets louder. |
| `includeArgs` | `false` | Attach the raw call arguments to `call` entries. Off by default: arguments often carry request bodies or credentials that shouldn't land in logs unreviewed. |
| `metadata` | — | Extra structured context: a static object, or `({ args }) => object`. |
| `logger` | the configured logger | Override the backend for this one decorator (mainly for tests). |

Return-type handling is automatic and detected at call time (`instanceof Promise` / `instanceof Observable`), not from static typing — the same `@Log(...)` works unmodified on synchronous, Promise-returning, and Observable-returning methods:

- **Synchronous** — the return value passes through untouched; a thrown error is logged (if `on` includes `failure`/`always`) and rethrown.
- **Promise** — resolves/rejects with the exact original value/reason; when nothing needs to log on completion (`on: 'call'` only), the original Promise is returned unwrapped.
- **Observable** — cold semantics are preserved: nothing is subscribed to on your behalf, each subscriber gets its own duration measurement, unsubscribing tears down the source subscription, and when `on: 'call'` is the only trigger the original Observable reference is returned with no wrapping at all.

Pick the log backend once, at app startup:

```ts
...provideTochLogger('matomo')    // or 'console' (default), or your own Logger class
```

The Matomo backend pushes entries as `trackEvent('app-log', 'trigger:level', message)` to the `_paq` queue (the Matomo snippet stays in the app's `index.html`) and mirrors to the console; it degrades to console-only when Matomo isn't loaded. Before `provideTochLogger` runs (or in code that never calls it — this module has no hard Angular dependency), `@Log()` falls back to a plain console sink.

### Deprecated: `@log`/`@warn`/`@error`

The single-purpose decorators from the previous iteration of this library still work, implemented as thin wrappers over `@Log()`:

```ts
@log('fetching orders')     // same as @Log({ level: 'info',  message: 'fetching orders', on: 'call' })
@warn('legacy endpoint')    // same as @Log({ level: 'warn',  message: 'legacy endpoint',  on: 'call' })
@error('save failed')       // same as @Log({ level: 'error', message: 'save failed',      on: 'failure' })
```

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
