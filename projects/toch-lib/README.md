# toch-lib

Angular utilities for working with SAP and other backends:

- **OData v2 + v4 query builder** — one fluent API, version-aware output
- **Auth service** — token storage, JWT expiry, roles, auth state as observables
- **SSO service** — cookie/ticket SSO ping + OAuth2/OIDC redirect helpers with PKCE
- **Cache service** — TTL, tags, validate/invalidate, HTTP cache-through
- **Session service** — session data, idle timeout, backend keep-alive
- **CSRF interceptor** — SAP `X-CSRF-Token: Fetch` pattern with automatic 403 retry

Works with **Angular 16 through 20** (built in partial-Ivy mode, peer range `>=16 <21`).

## Install

```bash
npm install toch-lib
```

## Setup

Standalone bootstrap (or `providers` of your root NgModule):

```ts
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideTochLib } from 'toch-lib';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideTochLib({
      csrf: {
        fetchUrl: '/sap/opu/odata/sap/MY_SRV/',
        urlPrefixes: ['/sap/'],
      },
      cache: { defaultTtlMs: 120_000 },
      session: {
        idleTimeoutMs: 30 * 60_000,
        keepAliveUrl: '/sap/public/ping',
      },
      sso: { pingUrl: '/sap/opu/odata/sap/MY_SRV/' },
    }),
  ],
});
```

If you prefer functional interceptors: `provideHttpClient(withInterceptors([tochCsrfInterceptor]))`.

## OData query builder

```ts
import { odataV2, odataV4, ODataVersion, guid } from 'toch-lib';

const url = odataV4<Product>('Products')
  .select('Id', 'Name', 'Price')
  .filter(f => f.and(f.eq('Category', 'Beverages'), f.gt('Price', 10)))
  .expand('Supplier', e => e.select('CompanyName').top(3))
  .orderBy('Price', 'desc')
  .page(0, 20)          // $top=20&$skip=0
  .count()              // $count=true (v2: $inlinecount=allpages)
  .toUrl('/odata/v4/catalog/');

// SAP Gateway (OData v2)
const v2 = odataV2('OrderSet')
  .filter(f => f.contains('Customer', 'SAP'))   // -> substringof('SAP',Customer)
  .filter(f => f.in('Status', ['A', 'B']))      // -> (Status eq 'A' or Status eq 'B')
  .byKey({ OrderId: '500001', Guid: guid('...') })
  .param('sap-client', '100')
  .format('json');

this.http.get(v2.toUrl('/sap/opu/odata/sap/MY_SRV/'));
// or: this.http.get(path, { params: builder.toHttpParams() })
```

Version differences (contains/substringof, `$count`/`$inlinecount`, datetime and guid
literals, `in` support, per-expand options) are handled automatically.

## CSRF interceptor

The interceptor fetches a token from `csrf.fetchUrl` with `X-CSRF-Token: Fetch`,
caches it, attaches it to `POST/PUT/PATCH/DELETE/MERGE` requests, and when SAP
answers **403** (expired token) it fetches a fresh token and retries once.

```ts
// manual access if you need it:
csrfTokens.getToken().subscribe();
csrfTokens.invalidate();
```

## Cache — you decide what to save and when it stops

```ts
// cache-through for HTTP GETs (shares in-flight requests too)
products$ = this.cache.wrap(
  'products:all',
  this.http.get<Product[]>(url),
  { ttlMs: 60_000, tags: ['products'] },
);

this.cache.set('draft', order, { ttlMs: Infinity, tags: ['orders'] });
this.cache.validate('draft', o => o.userId === currentUser.id); // removes entry when rule fails

// after a mutation:
this.cache.invalidate('products:all');
this.cache.invalidateTag('products');
this.cache.invalidateWhere(/^orders:/);
this.cache.clear();
```

## Auth

```ts
// after your login call / code exchange:
auth.setTokens({ accessToken: jwt, refreshToken });
auth.setUser({ username: 'TOMY', roles: ['admin'] }); // optional; JWT claims used otherwise

auth.isAuthenticated();      // expiry-aware (JWT exp or explicit expiresAt)
auth.isAuthenticated$;       // observable for guards/templates
auth.hasRole('admin');
auth.expiresInMs();
auth.logout();
```

## SSO

```ts
// 1) Cookie/ticket SSO (SPNEGO, SAML, SAP logon ticket): establish/verify session
sso.ping().subscribe(ok => ok || sso.login());

// 2) OAuth2 / OIDC redirect flow with PKCE
const verifier = sso.generateCodeVerifier();
const challenge = await sso.computeCodeChallenge(verifier);
sso.login({ state, codeChallenge: challenge });

// on the redirect page:
const { code } = sso.parseCallback();
// exchange `code` (+ verifier) on your backend, then auth.setTokens(...)
```

## Session

```ts
session.start();                       // enables idle tracking + keep-alive pings
session.expired$.subscribe(() => auth.logout());
session.touch();                       // manual activity mark
session.set('filters', currentFilters);
session.get<Filters>('filters');
session.end();                         // on logout: stop timers, clear data
```

## Build

```bash
npm run build
```

Output lands in `dist/toch-lib`, ready for `npm publish` or `npm pack`.
