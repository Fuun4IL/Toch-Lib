import { StorageKind } from '../config';

/**
 * JSON key-value store over memory / sessionStorage / localStorage.
 * Falls back to memory when web storage is unavailable (SSR, blocked storage).
 */
export class KeyValueStore {
  private readonly memory = new Map<string, string>();
  private readonly storage: Storage | null;

  constructor(kind: StorageKind, private readonly prefix: string) {
    this.storage = resolveStorage(kind);
  }

  get<T>(key: string): T | null {
    const raw = this.readRaw(this.prefix + '.' + key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    this.writeRaw(this.prefix + '.' + key, JSON.stringify(value));
  }

  remove(key: string): void {
    const full = this.prefix + '.' + key;
    this.memory.delete(full);
    try {
      this.storage?.removeItem(full);
    } catch {
      /* storage unavailable */
    }
  }

  clear(): void {
    for (const key of [...this.memory.keys()]) {
      if (key.startsWith(this.prefix + '.')) this.memory.delete(key);
    }
    if (!this.storage) return;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k && k.startsWith(this.prefix + '.')) doomed.push(k);
      }
      doomed.forEach((k) => this.storage!.removeItem(k));
    } catch {
      /* storage unavailable */
    }
  }

  private readRaw(fullKey: string): string | null {
    if (this.storage) {
      try {
        return this.storage.getItem(fullKey);
      } catch {
        /* fall through to memory */
      }
    }
    return this.memory.get(fullKey) ?? null;
  }

  private writeRaw(fullKey: string, value: string): void {
    if (this.storage) {
      try {
        this.storage.setItem(fullKey, value);
        return;
      } catch {
        /* fall through to memory */
      }
    }
    this.memory.set(fullKey, value);
  }
}

function resolveStorage(kind: StorageKind): Storage | null {
  if (kind === 'memory' || typeof window === 'undefined') return null;
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__toch_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
