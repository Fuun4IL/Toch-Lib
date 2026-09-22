/*
 * Public API surface of toch-lib/auth
 */
// Adapter-based auth (template pattern): user as a signal, source swapped by providers
export { AuthService } from './lib/adapter-auth.service';
export { AuthAdapter, AUTH_PROVIDER, MOCK_AUTH_USER } from './lib/auth-adapter';
export { MockAuthAdapter } from './lib/mock-auth.adapter';
export { SsoAuthAdapter } from './lib/sso-auth.adapter';
export { provideMockAuth, provideSsoAuth } from './lib/auth.providers';

// SSO redirect/ping helpers
export { SsoService, SsoCallbackResult } from './lib/sso.service';
