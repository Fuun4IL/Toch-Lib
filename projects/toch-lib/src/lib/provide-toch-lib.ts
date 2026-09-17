import { Provider } from '@angular/core';
import { TochLibConfig, TOCH_LIB_CONFIG } from 'toch-lib/core';
import { provideTochCsrfInterceptor } from 'toch-lib/csrf';
import { provideTochCacheInterceptor } from 'toch-lib/cache';

/**
 * Registers the library configuration and the CSRF interceptor.
 *
 * Standalone apps (Angular 16–20):
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideHttpClient(withInterceptorsFromDi()),
 *     provideTochLib({ csrf: { fetchUrl: '/sap/opu/odata/sap/MY_SRV/' } }),
 *   ],
 * });
 * ```
 *
 * NgModule apps: add `provideTochLib(...)` to the root module's `providers`
 * (HttpClientModule picks up the DI-based interceptor automatically).
 *
 * Using only parts of the library? Import from the sub-entry points
 * (`toch-lib/odata`, `toch-lib/auth`, `toch-lib/cache`, `toch-lib/session`,
 * `toch-lib/csrf`, `toch-lib/core`) and provide `TOCH_LIB_CONFIG` yourself.
 */
export function provideTochLib(config: TochLibConfig = {}): Provider[] {
  return [
    { provide: TOCH_LIB_CONFIG, useValue: config },
    // Both interceptors are config-gated: without a matching config section
    // they pass every request through untouched.
    ...provideTochCsrfInterceptor(),
    ...provideTochCacheInterceptor(),
  ];
}
