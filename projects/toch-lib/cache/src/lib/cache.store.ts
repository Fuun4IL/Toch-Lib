import { InjectionToken } from '@angular/core';
import { MemoryCacheStore } from './memory-cache.store';

/** A stored value and when it stops being valid (epoch ms, compared against `Date.now()`). */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Storage abstraction — swap the backing store (e.g. for a persistent one
 * later) without touching `CacheManager` or the interceptor. `CacheManager`
 * is the only thing that talks to a `CacheStore` directly.
 */
export interface CacheStore {
  get<T>(key: string): CacheEntry<T> | undefined;
  set<T>(key: string, entry: CacheEntry<T>): void;
  delete(key: string): void;
  clear(): void;
}

/**
 * The active `CacheStore`. Defaults to `MemoryCacheStore`; override it to
 * plug in a different storage implementation, e.g.:
 * `{ provide: CACHE_STORE, useClass: MyPersistentStore }`.
 */
export const CACHE_STORE = new InjectionToken<CacheStore>('CACHE_STORE', {
  providedIn: 'root',
  factory: () => new MemoryCacheStore(),
});
