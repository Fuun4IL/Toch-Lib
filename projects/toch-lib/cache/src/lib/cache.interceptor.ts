import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { CACHE_BYPASS, CACHE_OPTIONS } from './cache-context';
import { CacheKeyGenerator } from './cache-key-generator';
import { CacheManager } from './cache.manager';

/**
 * Caches successful GET responses. Deliberately thin: it only decides
 * whether a request participates in caching, reads per-request options from
 * `HttpContext`, asks `CacheKeyGenerator` for a key, and checks/stores
 * through `CacheManager` — all the actual caching logic (expiration,
 * storage, request de-duplication) lives there, not here.
 *
 * V1 supports exactly two policies (see the README's "Cache policy"
 * section for why more aren't added yet): normal caching (read on a hit,
 * request + store on a miss) and `noCache()` (skip caching entirely, for
 * this request only).
 */
@Injectable()
export class CacheInterceptor implements HttpInterceptor {
  constructor(
    private readonly manager: CacheManager,
    private readonly keyGenerator: CacheKeyGenerator
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.method !== 'GET' || req.context.get(CACHE_BYPASS)) {
      return next.handle(req);
    }

    const key = this.keyGenerator.generate(req);

    const cached = this.manager.get<HttpResponse<unknown>>(key);
    if (cached) {
      // Never hand out the stored response instance itself — a consumer
      // mutating it (e.g. via `HttpResponse.clone()`-based patterns
      // upstream) must not corrupt what's cached.
      return of(cached.clone());
    }

    const options = req.context.get(CACHE_OPTIONS);
    const ttl = options?.ttl ?? this.manager.defaultTtl;

    return this.manager.dedupe(key, () =>
      next.handle(req).pipe(
        tap((event) => {
          // Only a completed HttpResponse is cached. HttpErrorResponses
          // never reach here (they flow through the Observable's error
          // channel, not `next`), and intermediate events (Sent, upload/
          // download progress) simply aren't HttpResponse instances — both
          // pass through to the caller untouched, uncached.
          if (event instanceof HttpResponse) {
            this.manager.set(key, event.clone(), ttl);
          }
        })
      )
    );
  }
}
