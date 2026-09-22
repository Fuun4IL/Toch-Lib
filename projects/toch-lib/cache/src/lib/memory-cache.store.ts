import { Injectable } from '@angular/core';
import { CacheEntry, CacheStore } from './cache.store';

/** In-memory `CacheStore` backed by a `Map`. Cleared on page reload; nothing is persisted. */
@Injectable({ providedIn: 'root' })
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): CacheEntry<T> | undefined {
    return this.entries.get(key) as CacheEntry<T> | undefined;
  }

  set<T>(key: string, entry: CacheEntry<T>): void {
    this.entries.set(key, entry as CacheEntry<unknown>);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
