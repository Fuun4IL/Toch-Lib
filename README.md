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
