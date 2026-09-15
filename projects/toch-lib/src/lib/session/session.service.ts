import { inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, Observable, of, Subject } from 'rxjs';
import { TOCH_LIB_CONFIG } from '../config';
import { KeyValueStore } from '../internal/key-value-store';

/**
 * Session state + persistence:
 * - typed key/value session data (sessionStorage by default)
 * - idle timeout with an `expired$` signal you can react to (logout, dialog, …)
 * - optional backend keep-alive pings so the SAP session cookie stays alive
 *
 * Call `start()` once (e.g. in `APP_INITIALIZER` or your root component) to
 * enable idle tracking / keep-alive; pure key-value usage needs no start.
 */
@Injectable({ providedIn: 'root' })
export class SessionService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly config = inject(TOCH_LIB_CONFIG, { optional: true })?.session ?? {};
  private readonly store = new KeyValueStore(
    this.config.storage ?? 'session',
    this.config.storageKeyPrefix ?? 'toch.session'
  );

  private readonly expiredSubject = new Subject<void>();
  private readonly activeSubject = new BehaviorSubject<boolean>(true);

  /** Fires once when the idle timeout elapses without user activity. */
  readonly expired$: Observable<void> = this.expiredSubject.asObservable();
  /** false after expiry, true while the session is alive (or after `touch()`/`start()`). */
  readonly active$: Observable<boolean> = this.activeSubject.asObservable();

  private lastActivity = Date.now();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private removeListeners: (() => void) | null = null;

  // --- session data -------------------------------------------------------

  get<T>(key: string): T | null {
    return this.store.get<T>(key);
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  remove(key: string): void {
    this.store.remove(key);
  }

  /** Clears all stored session values (does not stop timers). */
  clearData(): void {
    this.store.clear();
  }

  // --- lifecycle ----------------------------------------------------------

  /** Enables idle tracking and (when configured) keep-alive pings. Idempotent. */
  start(): void {
    this.stopTimers();
    this.lastActivity = Date.now();
    this.activeSubject.next(true);

    const idleTimeout = this.config.idleTimeoutMs ?? 30 * 60_000;
    // Run timers and DOM listeners outside Angular so they don't hold up change detection.
    this.zone.runOutsideAngular(() => {
      if (idleTimeout > 0 && typeof window !== 'undefined') {
        const bump = () => (this.lastActivity = Date.now());
        const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
        events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
        this.removeListeners = () => events.forEach((e) => window.removeEventListener(e, bump));

        this.idleTimer = setInterval(() => {
          if (Date.now() - this.lastActivity >= idleTimeout && this.activeSubject.value) {
            this.zone.run(() => {
              this.activeSubject.next(false);
              this.expiredSubject.next();
            });
          }
        }, 5_000);
      }

      const keepAliveUrl = this.config.keepAliveUrl;
      if (keepAliveUrl) {
        const interval = this.config.keepAliveIntervalMs ?? 5 * 60_000;
        this.keepAliveTimer = setInterval(() => {
          if (!this.activeSubject.value) return; // don't keep a dead session alive
          this.http
            .get(keepAliveUrl, { withCredentials: true, responseType: 'text' })
            .pipe(catchError(() => of(null)))
            .subscribe();
        }, interval);
      }
    });
  }

  /** Marks activity manually (e.g. after a successful backend call). */
  touch(): void {
    this.lastActivity = Date.now();
    if (!this.activeSubject.value) {
      this.activeSubject.next(true);
    }
  }

  /** Stops timers and clears session data — call on logout. */
  end(): void {
    this.stopTimers();
    this.clearData();
    if (this.activeSubject.value) {
      this.activeSubject.next(false);
    }
  }

  /** Milliseconds of idle time so far. */
  idleForMs(): number {
    return Date.now() - this.lastActivity;
  }

  ngOnDestroy(): void {
    this.stopTimers();
  }

  private stopTimers(): void {
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.idleTimer = null;
    this.keepAliveTimer = null;
    this.removeListeners?.();
    this.removeListeners = null;
  }
}
