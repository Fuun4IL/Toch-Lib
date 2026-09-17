# Toch-Lib

Angular utilities for working with SAP backends — the shared logic layer for projects started from **toch-template**, so base services, SAP helpers, caching, auth and logging live in one versioned package instead of being copy-pasted per project.

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

`toch-lib/overlay` additionally needs `@angular/cdk` (optional peer — only install it if you use the overlay entry).

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
      api:  { baseUrl: '/sap/opu/odata/sap' },
      sap:  { language: 'he', defaultParams: { 'sap-client': '100' } },
      csrf: { fetchUrl: '/sap/opu/odata/sap/ZMY_SRV/', urlPrefixes: ['/sap/'] },
      cache: { interceptor: { urlPrefixes: ['/sap/'], ttlMs: 60_000 } },
      sso:  { pingUrl: '/sap/opu/odata/sap/ZMY_SRV/', userInfoUrl: '/sap/bc/ui2/start_up' },
      session: { idleTimeoutMs: 30 * 60_000 },
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
| `toch-lib/core` | `TOCH_LIB_CONFIG` + config types, `BaseComponent`, utility types, `KeyValueStore` |
| `toch-lib/http` | `ApiClient` — explicit `get`/`post`/`put`/`patch`/`delete` against the configured base URL |
| `toch-lib/sap` | `SapApiClient` + `forService()`, `SapFilter` + formatter, SAP date/time parsers, `sap-message` processing |
| `toch-lib/odata` | Fluent OData **v2 + v4** query builder (pure, no Angular services) |
| `toch-lib/csrf` | SAP `X-CSRF-Token: Fetch` interceptor + `CsrfTokenService` |
| `toch-lib/cache` | `CacheService` (TTL, tags, validate/invalidate) + HTTP GET cache interceptor |
| `toch-lib/auth` | Adapter-based `AuthService` (signal), mock/SSO adapters, `TokenAuthService` (JWT), `SsoService` |
| `toch-lib/session` | `SessionService` — idle timeout, keep-alive, session data |
| `toch-lib/logger` | `LoggerService` with console/Matomo adapters |
| `toch-lib/overlay` | `BaseOverlayService` (ref-counted CDK overlay; needs `@angular/cdk`) |
| `toch-lib` | everything above except `overlay`, plus `provideTochLib()` |

## API clients (`toch-lib/http`, `toch-lib/sap`)

Composition, not inheritance: a feature service **injects a client object** and calls it — no `extends`, and every call site shows its verb. `forService()` gives you a client scoped to one OData service:

```ts
import { SapApiClient } from 'toch-lib/sap';

@Injectable()
export class OrdersService {
  private readonly api = inject(SapApiClient).forService('ZORDERS_SRV');

  getOrders() {
    return this.api.getEntitySet<Order>('OrderSet', {       // -> ZORDERS_SRV/OrderSet
      filters: [
        { path: 'Status', op: 'eq', value: 'A' },
        { path: 'Created', op: 'bt', low: from, high: to },
      ],
      expand: ['ToItems'],
    });                                                     // -> { results: Order[], count? }
  }

  getOrder(id: string) {
    return this.api.getEntity<Order>(`OrderSet('${id}')`);  // -> Order (d unwrapped)
  }

  createOrder(order: Partial<Order>) {
    return this.api.createEntity<Order>('OrderSet', order); // CSRF token added automatically
  }
}
```

- V2 envelopes (`{d: ...}`, `{d: {results, __count}}`) are unwrapped for you; use `getEntitySetResponse` when you need headers.
- `sap-language` (default `he`) and `sap.defaultParams` (e.g. `sap-client`) are appended to every request.
- Cross-service calls: inject `SapApiClient` itself and pass full `SERVICE/EntitySet` paths.

Non-SAP backends — same idea with the plain HTTP client:

```ts
import { ApiClient } from 'toch-lib/http';

@Injectable()
export class ReportsService {
  private readonly api = inject(ApiClient);                     // config api.baseUrl
  // private readonly other = inject(ApiClient).withBaseUrl('/other-api');

  getReports()          { return this.api.get<Report[]>('reports'); }
  saveReport(r: Report) { return this.api.post<Report>('reports', r); }
}
```

## SAP utilities (`toch-lib/sap`)

Replaces the vendored `@toch/sap-utils` with the same call signatures (typos fixed):

```ts
parseDateForSAP(date)          // '/Date(1705307400000)/'         (JSON bodies)
parseDateForSAPKey(date)       // "datetime'2024-01-15T08:30:00'" (keys & filters)
parseDateOffsetForSAPKey(date) // "datetimeoffset'...+02:00'"
parseTimeForSAP('08:30:15')    // 'PT08H30M15S'
parseSAPDate('/Date(...)/')    // Date
parseSAPTime('PT08H30M15S')    // '08:30:15'
parseSapFilterString(filters)  // SapFilter[] -> V2 $filter string
parseArrayToFilter(['A','B'], 'Status')  // -> (Status eq 'A' or Status eq 'B')
```

Read SAP messages without digging through the envelope:

```ts
processSapSuccessMessages(response.headers)  // from the sap-message header
processSapErrorMessages(httpError)           // from OData error details (skips tech wrapper)
```

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

## Auth (`toch-lib/auth`)

Adapter pattern, exactly like the template — components inject `AuthService`, the data source is decided by providers:

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

For OAuth2/JWT token flows there is also `TokenAuthService` (token storage, expiry from the JWT `exp`, roles, `isAuthenticated$`) and `SsoService` (authorize-redirect + PKCE helpers, `parseCallback`).

## Session (`toch-lib/session`)

```ts
session.start();                                  // idle tracking + optional keep-alive pings
session.expired$.subscribe(() => /* logout, dialog, ... */);
session.set('filters', f);  session.get<F>('filters');
session.end();                                    // on logout
```

## Logger (`toch-lib/logger`)

```ts
...provideTochLogger('matomo')    // or 'console' (default), or your own LoggerAdapter class

logger.log('order saved', order);
logger.warn('slow response', ms);
logger.error('save failed', err);
```

The Matomo adapter pushes entries as `trackEvent('app-log', level, message)` to the `_paq` queue (the Matomo snippet stays in the app's `index.html`) and mirrors to the console; it degrades to console-only when Matomo isn't loaded.

## Overlay (`toch-lib/overlay`)

Ref-counted fullscreen overlays — `LoadingService`/`SplashScreenService` in the app shrink to a portal factory:

```ts
import { BaseOverlayService } from 'toch-lib/overlay';   // needs @angular/cdk

@Injectable({ providedIn: 'root' })
export class LoadingService extends BaseOverlayService {
  protected getComponentPortal() { return new ComponentPortal(SpinnerComponent); }
}
```

## Base component (`toch-lib/core`)

```ts
export class MyComponent extends BaseComponent {
  data$ = this.service.load().pipe(takeUntil(this.destroyed$));
}
```

## Migrating a toch-template project

| In the template | Replace with |
| --- | --- |
| `@toch/sap-utils` (vendored folder) | `toch-lib/sap` (same function names; `proccess*` → `process*Messages`) |
| `base/base-api.service.ts` | inject `ApiClient` from `toch-lib/http` (explicit verbs instead of `_request`, composition instead of `extends`) |
| `base/base-sap-api.service.ts` | inject `SapApiClient` from `toch-lib/sap` (use `.forService('ZXXX_SRV')`) |
| `base/base.component.ts`, `base/utility.types.ts` | `toch-lib/core` |
| `base/base-overlay.service.ts` | `toch-lib/overlay` |
| `core/interceptors/cache.interceptor.ts` | config-gated interceptor from `toch-lib/cache` (adds TTL + invalidation) |
| `core/services/auth/**` | `toch-lib/auth` (`provideMockAuth`/`provideSsoAuth`; mock user data stays in the app) |
| `core/services/logger.service.ts` | `toch-lib/logger` |
| `environment.api` usage in base services | `provideTochLib({ api: { baseUrl: environment.api } })` |

Components, routes, feature adapters, styles, i18n and mock data stay in the project — the template keeps the scaffolding, the library keeps the logic.

## Development (this repo)

```bash
npm install
npm run build     # ng-packagr -> dist/toch-lib
npm run pack      # build + installable .tgz
```

## License

MIT
