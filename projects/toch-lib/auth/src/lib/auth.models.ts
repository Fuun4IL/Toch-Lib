export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry as epoch ms. Derived from the JWT `exp` claim when omitted. */
  expiresAt?: number;
  tokenType?: string;
}

export interface AuthUser {
  id?: string;
  username?: string;
  displayName?: string;
  email?: string;
  roles?: string[];
  /** Anything else your backend returns about the user. */
  [claim: string]: unknown;
}

export interface AuthState {
  authenticated: boolean;
  user: AuthUser | null;
}

/** Decodes a JWT payload without verifying the signature. Returns null for non-JWT tokens. */
export function decodeJwt(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
