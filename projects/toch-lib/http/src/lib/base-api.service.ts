import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { TOCH_LIB_CONFIG, WithRequiredFields } from 'toch-lib/core';

export type RequestOptions = {
  headers?: HttpHeaders | Record<string, string | string[]>;
  params?: HttpParams | Record<string, string | number | boolean>;
};

/**
 * Base class for API services: explicit verb methods (`get`, `post`, `put`,
 * `patch`, `delete`) over HttpClient, with URL resolution against the
 * configured base URL — so features never touch HttpClient directly and the
 * call site always shows which kind of request it makes.
 *
 * The base URL comes from `TOCH_LIB_CONFIG.api.baseUrl`; override `apiBaseUrl`
 * in a subclass to point a specific service elsewhere.
 */
@Injectable()
export abstract class BaseApiService {
  protected readonly _http = inject(HttpClient);
  private readonly libConfig = inject(TOCH_LIB_CONFIG, { optional: true }) ?? {};

  protected get apiBaseUrl(): string {
    return this.libConfig.api?.baseUrl ?? '';
  }

  /** Narrows an `observe: 'response'` result to one with a non-null body. */
  assertResponseHasBody<T extends HttpResponse<unknown>>(
    response: T
  ): asserts response is WithRequiredFields<T, 'body'> {
    if (response.body == null) {
      throw new Error('Response body is empty');
    }
  }

  protected get<TResponse>(path: string, options?: RequestOptions): Observable<TResponse> {
    return this._http.get<TResponse>(this.resolveUrl(path), options);
  }

  protected post<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Observable<TResponse> {
    return this._http.post<TResponse>(this.resolveUrl(path), body, options);
  }

  protected put<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Observable<TResponse> {
    return this._http.put<TResponse>(this.resolveUrl(path), body, options);
  }

  protected patch<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Observable<TResponse> {
    return this._http.patch<TResponse>(this.resolveUrl(path), body, options);
  }

  protected delete<TResponse>(path: string, options?: RequestOptions): Observable<TResponse> {
    return this._http.delete<TResponse>(this.resolveUrl(path), options);
  }

  /** Promise variants for async/await call sites. */
  protected getAsync<TResponse>(path: string, options?: RequestOptions): Promise<TResponse> {
    return firstValueFrom(this.get<TResponse>(path, options));
  }

  protected postAsync<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Promise<TResponse> {
    return firstValueFrom(this.post<TResponse, TPayload>(path, body, options));
  }

  protected resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const base = this.apiBaseUrl.endsWith('/') ? this.apiBaseUrl.slice(0, -1) : this.apiBaseUrl;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }
}
