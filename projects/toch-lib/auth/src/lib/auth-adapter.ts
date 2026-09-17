import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Adapter contract for the auth source. Components and services never talk to
 * an adapter class directly — they inject AuthService, which reads from the
 * adapter bound to AUTH_PROVIDER (mock in development, SSO in production).
 */
export interface AuthAdapter<TUser = unknown> {
  /** Returns the current user synchronously (loaded during `init`, when present). */
  getUser(): TUser;
  /** Optional async warm-up, run at app startup by `provideSsoAuth`/custom initializers. */
  init?(): Observable<TUser> | Promise<TUser>;
}

export const AUTH_PROVIDER = new InjectionToken<AuthAdapter>('AUTH_PROVIDER');

/** The user object returned by MockAuthAdapter. */
export const MOCK_AUTH_USER = new InjectionToken<unknown>('MOCK_AUTH_USER');
