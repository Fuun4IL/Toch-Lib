import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { Provider } from '@angular/core';
import { CACHE_CONFIG, CacheConfig, DEFAULT_CACHE_CONFIG } from './cache.config';
import { CacheInterceptor } from './cache.interceptor';

/**
 * Registers the global cache configuration and the `CacheInterceptor`.
 * Without this, GET requests are never cached — `CacheManager`/
 * `MemoryCacheStore` are tree-injectable on their own, but the interceptor
 * only runs once it's added to `HTTP_INTERCEPTORS`, which is this
 * function's job.
 *
 * ```ts
 * // app.config.ts
 * providers: [
 *   provideHttpClient(withInterceptorsFromDi()),
 *   provideCache({ defaultTtl: 120_000 }), // optional — defaults to 60_000 (1 minute)
 * ]
 * ```
 *
 * NgModule apps: add `provideCache(...)` to the root module's `providers`
 * (`HttpClientModule` picks up the DI-based interceptor automatically).
 */
export function provideCache(config: Partial<CacheConfig> = {}): Provider[] {
  return [
    { provide: CACHE_CONFIG, useValue: { ...DEFAULT_CACHE_CONFIG, ...config } },
    { provide: HTTP_INTERCEPTORS, useClass: CacheInterceptor, multi: true },
  ];
}
