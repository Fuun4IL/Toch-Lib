import { HttpContext } from '@angular/common/http';
import { CACHE_BYPASS, CACHE_OPTIONS, CacheOptions } from './cache-context';

/**
 * Opts a GET request into caching with the given options (or the global
 * default TTL when none are given — a plain `this.http.get(url)` already
 * gets that, so `cache()` is only needed to override something).
 *
 * ```ts
 * this.http.get('/api/orders', { context: cache({ ttl: 10_000 }) });
 * ```
 */
export function cache(options: CacheOptions = {}): HttpContext {
  return new HttpContext().set(CACHE_OPTIONS, options);
}

/**
 * Bypasses caching entirely for this request: no read, no write, the
 * request always goes straight to the backend. Use this for anything
 * user-specific, sensitive, or where staleness would be unsafe.
 *
 * ```ts
 * this.http.get('/api/current-user', { context: noCache() });
 * ```
 */
export function noCache(): HttpContext {
  return new HttpContext().set(CACHE_BYPASS, true);
}
