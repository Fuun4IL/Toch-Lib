import { HttpContextToken } from '@angular/common/http';

/** Per-request cache configuration, set via the `cache()` helper. */
export interface CacheOptions {
  /** TTL for this request's cached response, ms. Overrides the global default. */
  ttl?: number;
}

/**
 * Per-request cache options. Holds configuration only — no caching logic
 * lives here or in `CacheInterceptor`'s reading of it; see `CacheManager`.
 * `null` (the default) means "use the global default TTL".
 */
export const CACHE_OPTIONS = new HttpContextToken<CacheOptions | null>(() => null);

/** When `true`, `CacheInterceptor` skips this request entirely: no read, no write. */
export const CACHE_BYPASS = new HttpContextToken<boolean>(() => false);
