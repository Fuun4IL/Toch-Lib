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

Logging is decorator-driven — no injected service, no manual `logger.log(...)` calls. Decorate the method you want logged; the label is optional and defaults to the method name:

```ts
import { log, warn, error } from 'toch-lib/logger';

@Injectable()
export class OrdersService {
  @log('fetching orders')
  getOrders() { return this.api.get<Order[]>('OrderSet'); }

  @warn('slow endpoint — legacy service')
  getLegacyOrders() { return this.api.get<Order[]>('LegacyOrderSet'); }

  @error('save order failed')
  saveOrder(order: Order) { return this.api.post<Order>('OrderSet', order); }
}
```

- `@log`/`@warn` fire on every call, logging the label plus the call's arguments.
- `@error` wraps the call (sync throws, rejected Promises, and errored Observables all count), logs the failure, then rethrows — the caller still sees the error.

Pick the sink once, at app startup:

```ts
...provideTochLogger('matomo')    // or 'console' (default), or your own LoggerAdapter class
```

The Matomo adapter pushes entries as `trackEvent('app-log', level, message)` to the `_paq` queue (the Matomo snippet stays in the app's `index.html`) and mirrors to the console; it degrades to console-only when Matomo isn't loaded. Before `provideTochLogger` runs (or in code that never calls it), the decorators fall back to a plain console sink.

## Development (this repo)

```bash
npm install
npm run build     # ng-packagr -> dist/toch-lib
npm run pack      # build + installable .tgz
```

## License

MIT
