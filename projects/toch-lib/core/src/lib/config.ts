import { InjectionToken } from '@angular/core';

/** Where auth/session values are persisted. */
export type StorageKind = 'memory' | 'session' | 'local';

export interface TochCsrfConfig {
  /**
   * URL used to fetch a CSRF token with the SAP `X-CSRF-Token: Fetch` pattern.
   * Usually the OData service root, e.g. `/sap/opu/odata/sap/MY_SRV/`.
   */
  fetchUrl?: string;
  /** Header name, default `X-CSRF-Token`. */
  headerName?: string;
  /** HTTP method used for the token fetch, default `HEAD`. */
  fetchMethod?: 'HEAD' | 'GET';
  /** Retry the request once with a fresh token when the backend answers 403 (token expired). Default true. */
  retryOnForbidden?: boolean;
  /** Only attach the token to requests whose URL matches one of these prefixes. Empty = all requests. */
  urlPrefixes?: string[];
  /** Which methods get the token. Default: POST, PUT, PATCH, DELETE, MERGE. */
  methods?: string[];
  /** Send credentials (cookies) with the token fetch. Default true (needed for SAP session cookies). */
  withCredentials?: boolean;
}

export interface TochAuthConfig {
  /** Where tokens are persisted. Default `session`. */
  storage?: StorageKind;
  /** Storage key prefix. Default `toch.auth`. */
  storageKeyPrefix?: string;
  /** Seconds before actual expiry at which the token is considered expired. Default 30. */
  expiryLeewaySeconds?: number;
}

export interface TochSsoConfig {
  /**
   * Endpoint pinged (with credentials) to establish/verify an SSO session,
   * e.g. an SAP endpoint behind SPNEGO/SAML that sets the session cookie.
   */
  pingUrl?: string;
  /** OAuth2 / OIDC authorize endpoint for redirect-based SSO. */
  authorizeUrl?: string;
  /** OAuth2 client id. */
  clientId?: string;
  /** Redirect URI registered for this app. Defaults to the current origin + path. */
  redirectUri?: string;
  /** OAuth2 scopes. */
  scopes?: string[];
  /** Extra query params appended to the authorize URL. */
  extraAuthorizeParams?: Record<string, string>;
}

export interface TochCacheConfig {
  /** Default time-to-live for cache entries in ms. Default 5 minutes. */
  defaultTtlMs?: number;
  /** Max number of entries kept; oldest entries are evicted first. Default 200. */
  maxEntries?: number;
}

export interface TochSessionConfig {
  /** Where session values are persisted. Default `session`. */
  storage?: StorageKind;
  /** Storage key prefix. Default `toch.session`. */
  storageKeyPrefix?: string;
  /** Idle time in ms after which the session is considered expired. Default 30 minutes. 0 disables. */
  idleTimeoutMs?: number;
  /** URL called periodically to keep the backend session alive. */
  keepAliveUrl?: string;
  /** Keep-alive interval in ms. Default 5 minutes. */
  keepAliveIntervalMs?: number;
}

export interface TochLibConfig {
  csrf?: TochCsrfConfig;
  auth?: TochAuthConfig;
  sso?: TochSsoConfig;
  cache?: TochCacheConfig;
  session?: TochSessionConfig;
}

export const TOCH_LIB_CONFIG = new InjectionToken<TochLibConfig>('TOCH_LIB_CONFIG', {
  providedIn: 'root',
  factory: () => ({}),
});
