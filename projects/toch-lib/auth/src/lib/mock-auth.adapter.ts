import { inject, Injectable } from '@angular/core';
import { AuthAdapter, MOCK_AUTH_USER } from './auth-adapter';

/**
 * Development adapter: returns the user object bound to MOCK_AUTH_USER.
 * Keep the mock user data itself in the app (a `*-mock.data.ts` file) and
 * hand it to `provideMockAuth(mockUser)`.
 */
@Injectable()
export class MockAuthAdapter<TUser = unknown> implements AuthAdapter<TUser> {
  private readonly mockUser = inject(MOCK_AUTH_USER, { optional: true }) as TUser | null;

  getUser(): TUser {
    if (this.mockUser == null) {
      throw new Error('MockAuthAdapter: no mock user configured — use provideMockAuth(user).');
    }
    return this.mockUser;
  }
}
