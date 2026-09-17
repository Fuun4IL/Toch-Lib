# Toch-Lib

Angular utilities for working with SAP and other backends — one library, **Angular 16 through 20** (built in partial-Ivy mode, peer range `>=16 <21`).

- 🔎 **OData v2 + v4 query builder** — one fluent API, version-aware output
- 🔐 **Auth service** — token storage, JWT expiry, roles, auth state as observables
- 🎟️ **SSO service** — cookie/ticket SSO ping + OAuth2/OIDC redirect helpers with PKCE
- 🗃️ **Cache service** — TTL, tags, validate/invalidate, HTTP cache-through
- ⏱️ **Session service** — session data, idle timeout, backend keep-alive
- 🛡️ **CSRF interceptor** — SAP `X-CSRF-Token: Fetch` pattern with automatic 403 retry

## Quick start

```bash
npm install toch-lib
```

```ts
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideTochLib } from 'toch-lib';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideTochLib({
      csrf: { fetchUrl: '/sap/opu/odata/sap/MY_SRV/', urlPrefixes: ['/sap/'] },
      session: { idleTimeoutMs: 30 * 60_000, keepAliveUrl: '/sap/public/ping' },
    }),
  ],
});
```

NgModule apps: put `provideTochLib(...)` in the root module's `providers` instead.

## Entry points — take only what you need

Every area ships as its own entry point, so unused parts tree-shake away completely:

| Import from | Contents |
| --- | --- |
| `toch-lib/odata` | OData v2/v4 query builder (no Angular services, pure) |
| `toch-lib/auth` | `AuthService`, `SsoService`, JWT helpers |
| `toch-lib/cache` | `CacheService` (TTL, tags, validate/invalidate) |
| `toch-lib/session` | `SessionService` (idle timeout, keep-alive) |
| `toch-lib/csrf` | CSRF interceptor + `CsrfTokenService` |
| `toch-lib/core` | `TOCH_LIB_CONFIG` token, config types, storage helper |
| `toch-lib` | everything above + `provideTochLib()` |

```ts
import { odataV4 } from 'toch-lib/odata';   // pulls in only the query builder
import { CacheService } from 'toch-lib/cache';
```

When you skip `provideTochLib`, configure via the token from core:

```ts
import { TOCH_LIB_CONFIG } from 'toch-lib/core';
import { provideTochCsrfInterceptor } from 'toch-lib/csrf';

providers: [
  { provide: TOCH_LIB_CONFIG, useValue: { csrf: { fetchUrl: '/sap/opu/odata/sap/MY_SRV/' } } },
  provideTochCsrfInterceptor(),
]
```

## OData query builder

```ts
import { odataV2, odataV4, guid } from 'toch-lib';

// OData v4
const url = odataV4<Product>('Products')
  .select('Id', 'Name', 'Price')
  .filter(f => f.and(f.eq('Category', 'Beverages'), f.gt('Price', 10)))
  .expand('Supplier', e => e.select('CompanyName').top(3))
  .orderBy('Price', 'desc')
  .page(0, 20)
  .count()
  .toUrl('/odata/v4/catalog/');

// SAP Gateway (OData v2) — same API, different output
const v2 = odataV2('OrderSet')
  .filter(f => f.contains('Customer', 'SAP'))   // -> substringof('SAP',Customer)
  .filter(f => f.in('Status', ['A', 'B']))      // -> (Status eq 'A' or Status eq 'B')
  .byKey({ OrderId: '500001', Guid: guid('...') })
  .param('sap-client', '100')
  .format('json');
```

Version differences (`contains` vs `substringof`, `$count` vs `$inlinecount`,
`datetime'...'`/`guid'...'` literals, `in` support, per-expand options) are handled automatically.

## Cache — decide what to save and when it stops

```ts
products$ = cache.wrap('products:all', this.http.get<Product[]>(url), {
  ttlMs: 60_000,
  tags: ['products'],
});

cache.validate('draft', o => o.userId === currentUser.id); // drops entry when rule fails
cache.invalidate('products:all');
cache.invalidateTag('products');
cache.invalidateWhere(/^orders:/);
```

## Auth, SSO & session

```ts
auth.setTokens({ accessToken: jwt });   // after login / code exchange
auth.isAuthenticated$;                  // expiry-aware observable
auth.hasRole('admin');

sso.ping().subscribe(ok => ok || sso.login());  // ticket SSO or OAuth2 redirect
const { code } = sso.parseCallback();

session.start();                                 // idle tracking + keep-alive
session.expired$.subscribe(() => auth.logout());
```

Full documentation for every module: [projects/toch-lib/README.md](projects/toch-lib/README.md).

## Repository layout

```
projects/toch-lib/   library source (ng-packagr)
dist/toch-lib/       build output (npm publish-ready)
```

## Development

```bash
npm install
npm run build     # builds with ng-packagr into dist/toch-lib
npm run pack      # builds + creates an installable .tgz
```

## License

MIT
