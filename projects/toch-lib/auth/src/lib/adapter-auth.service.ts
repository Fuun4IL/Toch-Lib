import { inject, Injectable, Signal, signal } from '@angular/core';
import { AuthAdapter, AUTH_PROVIDER } from './auth-adapter';

/**
 * Adapter-based auth state: exposes the current user as a readonly signal.
 * Which adapter backs it (mock vs SSO) is decided purely by providers —
 * use `provideMockAuth(user)` or `provideSsoAuth()`.
 */
@Injectable()
export class AuthService<TUser = unknown> {
  private readonly activeAdapter = inject(AUTH_PROVIDER) as AuthAdapter<TUser>;
  private readonly user = signal<TUser>(this.activeAdapter.getUser());

  getCurrentUser(): Signal<TUser> {
    return this.user.asReadonly();
  }

  /** Re-reads the user from the adapter (e.g. after a profile update). */
  refreshUser(): void {
    this.user.set(this.activeAdapter.getUser());
  }
}
