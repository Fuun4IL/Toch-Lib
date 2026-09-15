import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, of, shareReplay, map, tap } from 'rxjs';
import { TOCH_LIB_CONFIG } from '../config';

/**
 * Fetches and caches the CSRF token using the SAP pattern:
 * a HEAD/GET request with header `X-CSRF-Token: Fetch` against the service root,
 * the token comes back in the same response header.
 */
@Injectable({ providedIn: 'root' })
export class CsrfTokenService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(TOCH_LIB_CONFIG, { optional: true })?.csrf ?? {};

  private token: string | null = null;
  private pending$: Observable<string | null> | null = null;

  get headerName(): string {
    return this.config.headerName ?? 'X-CSRF-Token';
  }

  /** The currently cached token, or null when none has been fetched yet. */
  get currentToken(): string | null {
    return this.token;
  }

  /** Returns the cached token, fetching it first when none is cached. */
  getToken(forceRefresh = false): Observable<string | null> {
    if (!forceRefresh && this.token) {
      return of(this.token);
    }
    if (!forceRefresh && this.pending$) {
      return this.pending$;
    }
    const url = this.config.fetchUrl;
    if (!url) {
      return of(null);
    }
    const method = this.config.fetchMethod ?? 'HEAD';
    this.pending$ = this.http
      .request(method, url, {
        headers: { [this.headerName]: 'Fetch' },
        observe: 'response',
        responseType: 'text',
        withCredentials: this.config.withCredentials ?? true,
      })
      .pipe(
        map((res: HttpResponse<string>) => res.headers.get(this.headerName)),
        tap((token) => {
          this.token = token;
          this.pending$ = null;
        }),
        shareReplay(1)
      );
    return this.pending$;
  }

  /** Manually set a token (e.g. when your login response already carried one). */
  setToken(token: string | null): void {
    this.token = token;
  }

  /** Drop the cached token so the next request fetches a fresh one. */
  invalidate(): void {
    this.token = null;
    this.pending$ = null;
  }
}
