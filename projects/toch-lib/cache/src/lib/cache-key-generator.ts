import { Injectable } from '@angular/core';
import { HttpRequest } from '@angular/common/http';

/**
 * Builds the cache key for a request. Kept as its own class (rather than a
 * function call inline in the interceptor) so the key format can evolve —
 * or be overridden by an app — without touching `CacheInterceptor`.
 *
 * The key is `<method>:<urlWithParams>`, so it distinguishes method, URL,
 * and query parameters (`GET /api/users?page=1` and `GET /api/users?page=2`
 * never share an entry). It deliberately does **not** fold in headers —
 * including `Authorization` — into the key:
 *
 * - Headers are the wrong tool for scoping a cache entry to a user/tenant;
 *   an app that needs that isolation should put the distinguishing value in
 *   the URL or query string (where it already becomes part of the key), or
 *   call `noCache()` for requests where that isolation can't be guaranteed.
 * - Keying on a bearer token would also mean a token refresh silently
 *   fragments the cache instead of reusing existing entries.
 *
 * Two requests built with the same query parameters in a different order
 * (`?a=1&b=2` vs `?b=2&a=1`) currently produce different keys, since the key
 * is derived from `HttpRequest.urlWithParams` as Angular serializes it —
 * a known, documented limitation rather than a hidden gap; sort params
 * yourself before the request if that matters for your endpoints.
 */
@Injectable({ providedIn: 'root' })
export class CacheKeyGenerator {
  generate(req: HttpRequest<unknown>): string {
    return `${req.method}:${req.urlWithParams}`;
  }
}
