/*
 * Public API surface of toch-lib/auth
 */
// Adapter-based auth (template pattern): user as a signal, source swapped by providers
export { AuthService } from './lib/adapter-auth.service';
export { AuthAdapter, AUTH_PROVIDER, MOCK_AUTH_USER } from './lib/auth-adapter';
export { MockAuthAdapter } from './lib/mock-auth.adapter';
export { SsoAuthAdapter } from './lib/sso-auth.adapter';
export { provideMockAuth, provideSsoAuth } from './lib/auth.providers';

// Token/JWT-based auth state (for OAuth2 token flows)
export { TokenAuthService } from './lib/token-auth.service';
export { AuthTokens, AuthUser, AuthState, decodeJwt } from './lib/auth.models';

// SSO redirect/ping helpers
export { SsoService, SsoCallbackResult } from './lib/sso.service';
