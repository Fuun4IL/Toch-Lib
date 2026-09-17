import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';
import { TOCH_LIB_CONFIG } from 'toch-lib/core';

export interface SsoCallbackResult {
  /** OAuth2 authorization code, when present in the callback URL. */
  code?: string;
  /** `state` returned by the IdP — compare against the one you sent. */
  state?: string;
  /** Error code returned by the IdP (e.g. `access_denied`). */
  error?: string;
  errorDescription?: string;
}

/**
 * SSO helpers for the two patterns common with SAP backends:
 *
 * 1. **Cookie/ticket SSO** (SPNEGO/Kerberos, SAML, SAP logon tickets):
 *    the browser gets the session transparently — `ping()` fires a
 *    credentialed request against a protected endpoint to establish/verify it.
 *
 * 2. **OAuth2/OIDC redirect SSO**: `buildAuthorizeUrl()` + `login()` send the
 *    user to the IdP; `parseCallback()` reads code/state/error from the
 *    redirect URL. Exchange the code for tokens on your backend, then store
 *    them via `AuthService.setTokens`.
 */
@Injectable({ providedIn: 'root' })
export class SsoService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(TOCH_LIB_CONFIG, { optional: true })?.sso ?? {};

  /**
   * Fires a credentialed GET against the configured `pingUrl`.
   * Emits true when the backend answered successfully (session established),
   * false otherwise. Safe to call at app start.
   */
  ping(url?: string): Observable<boolean> {
    const target = url ?? this.config.pingUrl;
    if (!target) {
      return of(false);
    }
    return this.http
      .get(target, { withCredentials: true, observe: 'response', responseType: 'text' })
      .pipe(
        map((res) => res.status >= 200 && res.status < 300),
        catchError(() => of(false))
      );
  }

  /** Builds the OAuth2/OIDC authorize URL (response_type=code). */
  buildAuthorizeUrl(options: { state?: string; codeChallenge?: string; loginHint?: string } = {}): string {
    const { authorizeUrl, clientId } = this.config;
    if (!authorizeUrl || !clientId) {
      throw new Error('SsoService: sso.authorizeUrl and sso.clientId must be configured.');
    }
    const redirectUri = this.config.redirectUri ?? defaultRedirectUri();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (this.config.scopes?.length) params.set('scope', this.config.scopes.join(' '));
    if (options.state) params.set('state', options.state);
    if (options.codeChallenge) {
      params.set('code_challenge', options.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    if (options.loginHint) params.set('login_hint', options.loginHint);
    for (const [k, v] of Object.entries(this.config.extraAuthorizeParams ?? {})) {
      params.set(k, v);
    }
    return `${authorizeUrl}${authorizeUrl.includes('?') ? '&' : '?'}${params.toString()}`;
  }

  /** Redirects the browser to the IdP login page. */
  login(options: { state?: string; codeChallenge?: string; loginHint?: string } = {}): void {
    if (typeof window !== 'undefined') {
      window.location.assign(this.buildAuthorizeUrl(options));
    }
  }

  /**
   * Reads code/state/error from a redirect callback URL
   * (defaults to the current browser URL).
   */
  parseCallback(url?: string): SsoCallbackResult {
    const href = url ?? (typeof window !== 'undefined' ? window.location.href : '');
    if (!href) return {};
    let search = '';
    try {
      const u = new URL(href);
      // Some IdPs return params in the fragment.
      search = u.search || (u.hash.includes('=') ? u.hash.replace(/^#\/?/, '') : '');
    } catch {
      return {};
    }
    const params = new URLSearchParams(search.replace(/^\?/, ''));
    const result: SsoCallbackResult = {};
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (code) result.code = code;
    if (state) result.state = state;
    if (error) result.error = error;
    if (errorDescription) result.errorDescription = errorDescription;
    return result;
  }

  /** Generates a PKCE code verifier (store it, send its challenge via `codeChallenge`). */
  generateCodeVerifier(length = 64): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const random = new Uint8Array(length);
    crypto.getRandomValues(random);
    return Array.from(random, (b) => charset[b % charset.length]).join('');
  }

  /** SHA-256 + base64url — the `code_challenge` for a PKCE verifier. */
  async computeCodeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const bytes = String.fromCharCode(...new Uint8Array(digest));
    return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

function defaultRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin + window.location.pathname;
}
