import { Provider } from '@angular/core';
import { TochLibConfig, TOCH_LIB_CONFIG } from 'toch-lib/core';
import { provideTochCsrfInterceptor } from 'toch-lib/csrf';

/**
 * Registers the library configuration and the CSRF interceptor.
 *
 * `toch-lib/cache` and `toch-lib/logger` are opted into separately —
 * `provideTochLib` only bundles the pieces that are config-gated through
 * `TOCH_LIB_CONFIG` (currently just CSRF):
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideHttpClient(withInterceptorsFromDi()),
 *     provideTochLib({ csrf: { fetchUrl: '/sap/opu/odata/sap/MY_SRV/' } }),
 *     provideCache(),                   // toch-lib/cache — caches GETs, see its README section
 *     ...provideTochLogger('matomo'),   // toch-lib/logger
 *   ],
 * });
 * ```
 *
 * NgModule apps: add `provideTochLib(...)` to the root module's `providers`
 * (HttpClientModule picks up the DI-based interceptor automatically).
 *
 * Using only parts of the library? Import from the sub-entry points
 * (`toch-lib/odata`, `toch-lib/auth`, `toch-lib/cache`, `toch-lib/csrf`,
 * `toch-lib/core`) and provide `TOCH_LIB_CONFIG` yourself.
 */
export function provideTochLib(config: TochLibConfig = {}): Provider[] {
  return [
    { provide: TOCH_LIB_CONFIG, useValue: config },
    // Config-gated: without a `csrf` section it passes every request
    // through untouched.
    ...provideTochCsrfInterceptor(),
  ];
}
