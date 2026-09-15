import { inject, Injectable, Injector } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpHandlerFn,
  HttpInterceptor,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError, Observable, switchMap, throwError } from 'rxjs';
import { TochCsrfConfig, TOCH_LIB_CONFIG } from '../config';
import { CsrfTokenService } from './csrf-token.service';

const DEFAULT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'MERGE'];

function needsToken(req: HttpRequest<unknown>, config: TochCsrfConfig): boolean {
  const methods = (config.methods ?? DEFAULT_METHODS).map((m) => m.toUpperCase());
  if (!methods.includes(req.method.toUpperCase())) {
    return false;
  }
  const prefixes = config.urlPrefixes ?? [];
  return prefixes.length === 0 || prefixes.some((p) => req.url.startsWith(p));
}

function handleWithToken(
  req: HttpRequest<unknown>,
  next: (req: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>,
  tokens: CsrfTokenService,
  config: TochCsrfConfig
): Observable<HttpEvent<unknown>> {
  if (!needsToken(req, config)) {
    return next(req);
  }
  const send = (forceRefresh: boolean) =>
    tokens.getToken(forceRefresh).pipe(
      switchMap((token) => {
        const authedReq = token
          ? req.clone({ setHeaders: { [tokens.headerName]: token } })
          : req;
        return next(authedReq);
      })
    );

  return send(false).pipe(
    catchError((err: unknown) => {
      const retry = config.retryOnForbidden ?? true;
      if (retry && err instanceof HttpErrorResponse && err.status === 403) {
        // SAP answers 403 with `x-csrf-token: Required` when the token expired.
        tokens.invalidate();
        return send(true);
      }
      return throwError(() => err);
    })
  );
}

/**
 * Functional interceptor for `provideHttpClient(withInterceptors([tochCsrfInterceptor]))`.
 * Attaches the CSRF token to mutating requests and retries once on 403.
 */
export const tochCsrfInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const tokens = inject(CsrfTokenService);
  const config = inject(TOCH_LIB_CONFIG, { optional: true })?.csrf ?? {};
  return handleWithToken(req, next, tokens, config);
};

/**
 * Class-based interceptor for DI registration
 * (`provideTochLib(...)` registers it, or add it to `HTTP_INTERCEPTORS` yourself).
 */
@Injectable()
export class CsrfInterceptor implements HttpInterceptor {
  private readonly injector = inject(Injector);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const tokens = this.injector.get(CsrfTokenService);
    const config = this.injector.get(TOCH_LIB_CONFIG, {})?.csrf ?? {};
    return handleWithToken(req, (r) => next.handle(r), tokens, config);
  }
}
