import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, tap, throwError } from 'rxjs';
import { TOCH_LIB_CONFIG } from 'toch-lib/core';
import { SsoService } from './sso.service';

import { AuthAdapter } from './auth-adapter';

/**
 * Production adapter for cookie/ticket SSO environments: at startup it
 * verifies the SSO session (optional `sso.pingUrl`) and loads the user
 * profile from `sso.userInfoUrl` with credentials. After `init()` resolves,
 * `getUser()` is synchronous.
 */
@Injectable()
export class SsoAuthAdapter<TUser = unknown> implements AuthAdapter<TUser> {
  private readonly http = inject(HttpClient);
  private readonly sso = inject(SsoService);
  private readonly config = inject(TOCH_LIB_CONFIG, { optional: true })?.sso ?? {};

  private user: TUser | null = null;

  init(): Observable<TUser> {
    const userInfoUrl = this.config.userInfoUrl;
    if (!userInfoUrl) {
      return throwError(() => new Error('SsoAuthAdapter: sso.userInfoUrl is not configured.'));
    }
    const load$ = this.http.get<TUser>(userInfoUrl, { withCredentials: true });
    const start$ = this.config.pingUrl ? this.sso.ping().pipe(switchMap(() => load$)) : load$;
    return start$.pipe(tap((user) => (this.user = user)));
  }

  getUser(): TUser {
    if (this.user == null) {
      throw new Error(
        'SsoAuthAdapter: user not loaded yet — provideSsoAuth() runs init() at app startup.'
      );
    }
    return this.user;
  }
}
