import { Inject, Injectable } from '@angular/core';
import { Observable, finalize, shareReplay } from 'rxjs';
import { CACHE_CONFIG, CacheConfig } from './cache.config';
import { CACHE_STORE, CacheStore } from './cache.store';

/**
 * The abstraction between `CacheInterceptor` and the storage implementation.
 * Owns: reading/writing entries (delegating expiration bookkeeping to the
 * `CacheStore`'s `expiresAt` field), removal, and in-flight request
 * de-duplication. Nothing here is HTTP-specific — `CacheManager` doesn't
 * know what an `HttpResponse` is; the interceptor decides what's worth
 * caching and hands it a plain value.
 *
 * Dependencies are constructor-injected (rather than via the `inject()`
 * function) specifically so this class can be constructed directly in unit
 * tests — `new CacheManager(new MemoryCacheStore(), { defaultTtl: 1000 })`
 * — without needing an Angular injection context.
 */
@Injectable({ providedIn: 'root' })
export class CacheManager {
  private readonly inFlight = new Map<string, Observable<unknown>>();

  constructor(
    @Inject(CACHE_STORE) private readonly store: CacheStore,
    @Inject(CACHE_CONFIG) private readonly config: CacheConfig
  ) {}

  /** The configured global default TTL (ms). */
  get defaultTtl(): number {
    return this.config.defaultTtl;
  }

  /**
   * The cached value for `key`, or `undefined` on a miss. An expired entry
   * is treated as a miss and removed — a stale value is never returned.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get<T>(key);
    if (!entry) return undefined;
    if (!(entry.expiresAt > Date.now())) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Stores `value` under `key`, expiring after `ttl` ms (defaults to the configured global TTL). */
  set<T>(key: string, value: T, ttl: number = this.config.defaultTtl): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  /** Removes one entry (and drops any in-flight request tracked for it). */
  delete(key: string): void {
    this.inFlight.delete(key);
    this.store.delete(key);
  }

  /** Removes every entry. */
  clear(): void {
    this.inFlight.clear();
    this.store.clear();
  }

  /**
   * Shares one in-flight execution of `factory()` across every concurrent
   * caller for the same `key`: the first caller runs `factory()`, and any
   * other caller for the same key while it's still pending gets the same
   * (multicasted) result instead of starting a second one — so three
   * components requesting the same URL at once produce exactly one HTTP
   * request. The in-flight entry is dropped once `factory()`'s observable
   * settles, whether it succeeded or failed, so a later call — including a
   * retry right after a failure — always starts a fresh request rather than
   * replaying a stale one.
   *
   * This only de-duplicates the *request*; it does not read or write the
   * cache store itself — callers (the interceptor) decide what to do with
   * the result.
   */
  dedupe<T>(key: string, factory: () => Observable<T>): Observable<T> {
    const pending = this.inFlight.get(key) as Observable<T> | undefined;
    if (pending) {
      return pending;
    }

    const shared$ = factory().pipe(
      finalize(() => this.inFlight.delete(key)),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.inFlight.set(key, shared$);
    return shared$;
  }
}
