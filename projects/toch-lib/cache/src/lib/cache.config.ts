import { InjectionToken } from '@angular/core';

/** Global configuration for `toch-lib/cache`. */
export interface CacheConfig {
  /** Default time-to-live for a cached response, in milliseconds. */
  defaultTtl: number;
}

/** 1 minute — the default TTL when neither `provideCache()` nor a per-request `cache()` overrides it. */
export const DEFAULT_CACHE_CONFIG: CacheConfig = { defaultTtl: 60_000 };

export const CACHE_CONFIG = new InjectionToken<CacheConfig>('CACHE_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_CACHE_CONFIG,
});
