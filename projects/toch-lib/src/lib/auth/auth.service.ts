import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { TOCH_LIB_CONFIG } from '../config';
import { KeyValueStore } from '../internal/key-value-store';
import { AuthState, AuthTokens, AuthUser, decodeJwt } from './auth.models';

/**
 * Framework-agnostic auth state holder: stores tokens (memory/session/local),
 * tracks expiry (with JWT support), exposes the authenticated state as an
 * observable and offers role checks.
 *
 * It deliberately does not perform the login HTTP call itself — call your
 * backend/IdP however you need and hand the result to `setTokens`/`setUser`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(TOCH_LIB_CONFIG, { optional: true })?.auth ?? {};
  private readonly store = new KeyValueStore(
    this.config.storage ?? 'session',
    this.config.storageKeyPrefix ?? 'toch.auth'
  );

  private readonly stateSubject = new BehaviorSubject<AuthState>(this.restoreState());

  /** Emits on every login/logout/user change. */
  readonly state$: Observable<AuthState> = this.stateSubject.asObservable();
  readonly isAuthenticated$: Observable<boolean> = this.state$.pipe(map((s) => s.authenticated));
  readonly user$: Observable<AuthUser | null> = this.state$.pipe(map((s) => s.user));

  private get leewayMs(): number {
    return (this.config.expiryLeewaySeconds ?? 30) * 1000;
  }

  /** Store tokens after a successful login. Expiry is read from `expiresAt` or the JWT `exp` claim. */
  setTokens(tokens: AuthTokens): void {
    const normalized: AuthTokens = { ...tokens };
    if (normalized.expiresAt === undefined) {
      const claims = decodeJwt(tokens.accessToken);
      const exp = claims?.['exp'];
      if (typeof exp === 'number') {
        normalized.expiresAt = exp * 1000;
      }
    }
    this.store.set('tokens', normalized);
    this.emit();
  }

  /** Attach user/profile info (kept alongside the tokens). */
  setUser(user: AuthUser | null): void {
    if (user === null) {
      this.store.remove('user');
    } else {
      this.store.set('user', user);
    }
    this.emit();
  }

  /** The stored tokens, or null when logged out. */
  getTokens(): AuthTokens | null {
    return this.store.get<AuthTokens>('tokens');
  }

  /** The access token when present and not expired, otherwise null. */
  getAccessToken(): string | null {
    const tokens = this.getTokens();
    if (!tokens) return null;
    if (this.isExpired(tokens)) return null;
    return tokens.accessToken;
  }

  getRefreshToken(): string | null {
    return this.getTokens()?.refreshToken ?? null;
  }

  getUser(): AuthUser | null {
    const stored = this.store.get<AuthUser>('user');
    if (stored) return stored;
    // Fall back to JWT claims when no explicit user was set.
    const token = this.getTokens()?.accessToken;
    if (!token) return null;
    const claims = decodeJwt(token);
    if (!claims) return null;
    return {
      id: (claims['sub'] as string) ?? undefined,
      username: (claims['preferred_username'] as string) ?? (claims['user_name'] as string) ?? undefined,
      email: (claims['email'] as string) ?? undefined,
      roles: (claims['roles'] as string[]) ?? (claims['scope'] as string)?.split(' ') ?? undefined,
      ...claims,
    };
  }

  isAuthenticated(): boolean {
    return this.getAccessToken() !== null;
  }

  /** True when tokens exist but are past (or within the leeway of) their expiry. */
  isTokenExpired(): boolean {
    const tokens = this.getTokens();
    return tokens !== null && this.isExpired(tokens);
  }

  /** Milliseconds until expiry (negative when already expired), or null when unknown. */
  expiresInMs(): number | null {
    const tokens = this.getTokens();
    if (!tokens?.expiresAt) return null;
    return tokens.expiresAt - Date.now();
  }

  hasRole(role: string): boolean {
    return this.getUser()?.roles?.includes(role) ?? false;
  }

  hasAnyRole(...roles: string[]): boolean {
    return roles.some((r) => this.hasRole(r));
  }

  /** Clear tokens and user. */
  logout(): void {
    this.store.clear();
    this.emit();
  }

  private isExpired(tokens: AuthTokens): boolean {
    if (!tokens.expiresAt) return false;
    return Date.now() >= tokens.expiresAt - this.leewayMs;
  }

  private restoreState(): AuthState {
    return { authenticated: this.getAccessToken() !== null, user: this.getUser() };
  }

  private emit(): void {
    this.stateSubject.next(this.restoreState());
  }
}
