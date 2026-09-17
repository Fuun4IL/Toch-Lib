import { APP_INITIALIZER, Provider } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './adapter-auth.service';
import { AUTH_PROVIDER, MOCK_AUTH_USER } from './auth-adapter';
import { MockAuthAdapter } from './mock-auth.adapter';
import { SsoAuthAdapter } from './sso-auth.adapter';

/**
 * Development providers: AuthService backed by a mock user.
 *
 * ```ts
 * // app.config.ts
 * providers: [...provideMockAuth(MOCK_USER)]
 * ```
 */
export function provideMockAuth<TUser>(user: TUser): Provider[] {
  return [
    AuthService,
    { provide: MOCK_AUTH_USER, useValue: user },
    { provide: AUTH_PROVIDER, useClass: MockAuthAdapter },
  ];
}

/**
 * Production providers: AuthService backed by SSO. Loads the user during app
 * initialization from `sso.userInfoUrl` (after an optional `sso.pingUrl`
 * round-trip that establishes the session cookie).
 *
 * ```ts
 * // app.config.ts
 * providers: [
 *   provideTochLib({ sso: { pingUrl: '/sap/...', userInfoUrl: '/sap/.../UserInfo' } }),
 *   ...provideSsoAuth(),
 * ]
 * ```
 */
export function provideSsoAuth(): Provider[] {
  return [
    AuthService,
    SsoAuthAdapter,
    { provide: AUTH_PROVIDER, useExisting: SsoAuthAdapter },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (adapter: SsoAuthAdapter) => () => firstValueFrom(adapter.init()),
      deps: [SsoAuthAdapter],
    },
  ];
}
