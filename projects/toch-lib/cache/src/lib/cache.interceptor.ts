import { inject, Injectable, Injector, Provider } from '@angular/core';
import {
  HTTP_INTERCEPTORS,
  HttpEvent,
  HttpHandler,
  HttpHandlerFn,
  HttpInterceptor,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { TochCacheConfig, TOCH_LIB_CONFIG } from 'toch-lib/core';
import { CacheService } from './cache.service';

/** Tag put on every interceptor-cached response: `cache.invalidateTag(HTTP_CACHE_TAG)` clears them all. */
export const HTTP_CACHE_TAG = 'toch:http';

/** Cache key used for a request — `invalidate(httpCacheKey(url))` after a mutation. */
export function httpCacheKey(urlWithParams: string): string {
  return `${HTTP_CACHE_TAG}:${urlWithParams}`;
}

function handle(
  req: HttpRequest<unknown>,
  next: (req: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>,
  cache: CacheService,
  config: TochCacheConfig
): Observable<HttpEvent<unknown>> {
  const interceptorConfig = config.interceptor;
  if (!interceptorConfig || req.method !== 'GET') {
    return next(req);
  }
  const prefixes = interceptorConfig.urlPrefixes ?? [];
  if (prefixes.length > 0 && !prefixes.some((p) => req.url.startsWith(p))) {
    return next(req);
  }

  const key = httpCacheKey(req.urlWithParams);
  const cached = cache.get<HttpResponse<unknown>>(key);
  if (cached) {
    return of(cached.clone());
  }

  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        cache.set(key, event.clone(), {
          ttlMs: interceptorConfig.ttlMs,
          tags: [HTTP_CACHE_TAG],
        });
      }
    })
  );
}

/**
 * Caches GET responses through CacheService, so TTL, tags and
 * invalidate/validate all apply to HTTP data. Enabled only when
 * `TOCH_LIB_CONFIG.cache.interceptor` is configured; passes everything
 * through untouched otherwise.
 *
 * After a mutation, clear what it affected:
 * ```ts
 * cache.invalidate(httpCacheKey(url));          // one URL
 * cache.invalidateWhere(/OrderSet/);            // by pattern
 * cache.invalidateTag(HTTP_CACHE_TAG);          // every cached response
 * ```
 */
export const tochCacheInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const cache = inject(CacheService);
  const config = inject(TOCH_LIB_CONFIG, { optional: true })?.cache ?? {};
  return handle(req, next, cache, config);
};

/** Class-based variant for DI registration (`provideTochLib` registers it). */
@Injectable()
export class CacheInterceptor implements HttpInterceptor {
  private readonly injector = inject(Injector);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const cache = this.injector.get(CacheService);
    const config = this.injector.get(TOCH_LIB_CONFIG, {})?.cache ?? {};
    return handle(req, (r) => next.handle(r), cache, config);
  }
}

/** Registers the DI-based cache interceptor on its own. */
export function provideTochCacheInterceptor(): Provider[] {
  return [{ provide: HTTP_INTERCEPTORS, useClass: CacheInterceptor, multi: true }];
}
