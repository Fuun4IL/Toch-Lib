import { inject, Injectable } from '@angular/core';
import { defer, Observable, of, shareReplay, tap } from 'rxjs';
import { TOCH_LIB_CONFIG } from '../config';

export interface CacheSetOptions {
  /** Time-to-live in ms; falls back to the configured default (5 min). `Infinity` never expires. */
  ttlMs?: number;
  /** Tags for group invalidation, e.g. `['orders']` — `invalidateTag('orders')` clears all of them. */
  tags?: string[];
}

export interface CacheEntryInfo {
  key: string;
  createdAt: number;
  expiresAt: number;
  tags: string[];
}

interface CacheEntry {
  value: unknown;
  createdAt: number;
  expiresAt: number;
  tags: string[];
}

/**
 * In-memory cache with TTL, tag-based invalidation and validation hooks —
 * you decide what gets saved (`set`/`wrap`) and when it stops being valid
 * (`invalidate`, `invalidateTag`, `invalidateWhere`, `validate`).
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly config = inject(TOCH_LIB_CONFIG, { optional: true })?.cache ?? {};
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Observable<unknown>>();

  private get defaultTtl(): number {
    return this.config.defaultTtlMs ?? 5 * 60_000;
  }

  private get maxEntries(): number {
    return this.config.maxEntries ?? 200;
  }

  /** Store a value under a key. */
  set<T>(key: string, value: T, options: CacheSetOptions = {}): void {
    const ttl = options.ttlMs ?? this.defaultTtl;
    const now = Date.now();
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      createdAt: now,
      expiresAt: ttl === Infinity ? Infinity : now + ttl,
      tags: options.tags ?? [],
    });
    // Evict oldest entries beyond the cap (Map preserves insertion order).
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Get a cached value, or undefined when missing or expired. */
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /** True when the key exists and has not expired. */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Check a cached value against your own rule; entries that fail are removed.
   * Returns true only when the entry exists, is fresh, and passes the validator.
   *
   * ```ts
   * cache.validate('user', u => u.id === currentUserId)
   * ```
   */
  validate<T>(key: string, validator?: (value: T, info: CacheEntryInfo) => boolean): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return false;
    }
    if (validator) {
      const ok = validator(entry.value as T, {
        key,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        tags: entry.tags,
      });
      if (!ok) {
        this.entries.delete(key);
        return false;
      }
    }
    return true;
  }

  /** Remove one key. Returns true when something was removed. */
  invalidate(key: string): boolean {
    this.inflight.delete(key);
    return this.entries.delete(key);
  }

  /** Remove all keys carrying the given tag. Returns the number of removed entries. */
  invalidateTag(tag: string): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.tags.includes(tag)) {
        this.entries.delete(key);
        this.inflight.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Remove all keys matching a prefix or RegExp. Returns the number of removed entries. */
  invalidateWhere(match: string | RegExp): number {
    let removed = 0;
    for (const key of [...this.entries.keys()]) {
      const hit = typeof match === 'string' ? key.startsWith(match) : match.test(key);
      if (hit) {
        this.entries.delete(key);
        this.inflight.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Remove everything. */
  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  /** Currently cached keys (including expired-but-not-yet-purged ones). */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Cache-through helper for observables (typically HTTP GETs):
   * returns the cached value when fresh, otherwise subscribes to `source`,
   * caches the result and shares one in-flight request between concurrent callers.
   *
   * ```ts
   * cache.wrap('products', this.http.get<Product[]>(url), { ttlMs: 60_000, tags: ['products'] })
   * ```
   */
  wrap<T>(key: string, source: Observable<T>, options: CacheSetOptions = {}): Observable<T> {
    return defer(() => {
      const cached = this.get<T>(key);
      if (cached !== undefined) {
        return of(cached);
      }
      const pending = this.inflight.get(key) as Observable<T> | undefined;
      if (pending) {
        return pending;
      }
      const request$ = source.pipe(
        tap((value) => {
          this.set(key, value, options);
          this.inflight.delete(key);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.inflight.set(key, request$);
      return request$;
    });
  }
}
