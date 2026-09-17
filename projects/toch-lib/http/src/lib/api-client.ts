import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { TOCH_LIB_CONFIG, WithRequiredFields } from 'toch-lib/core';

export type RequestOptions = {
  headers?: HttpHeaders | Record<string, string | string[]>;
  params?: HttpParams | Record<string, string | number | boolean>;
};

/** Narrows an `observe: 'response'` result to one with a non-null body. */
export function assertResponseHasBody<T extends HttpResponse<unknown>>(
  response: T
): asserts response is WithRequiredFields<T, 'body'> {
  if (response.body == null) {
    throw new Error('Response body is empty');
  }
}

/**
 * HTTP client bound to a base URL — explicit verb methods so every call site
 * shows which kind of request it makes. Compose it, don't extend it:
 *
 * ```ts
 * @Injectable()
 * export class ProductsService {
 *   private readonly api = inject(ApiClient);
 *   getProducts() { return this.api.get<Product[]>('products'); }
 * }
 * ```
 */
export class BoundApiClient {
  constructor(protected readonly http: HttpClient, readonly baseUrl: string) {}

  get<TResponse>(path: string, options?: RequestOptions): Observable<TResponse> {
    return this.http.get<TResponse>(this.resolveUrl(path), options);
  }

  post<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Observable<TResponse> {
    return this.http.post<TResponse>(this.resolveUrl(path), body, options);
  }

  put<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Observable<TResponse> {
    return this.http.put<TResponse>(this.resolveUrl(path), body, options);
  }

  patch<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Observable<TResponse> {
    return this.http.patch<TResponse>(this.resolveUrl(path), body, options);
  }

  delete<TResponse>(path: string, options?: RequestOptions): Observable<TResponse> {
    return this.http.delete<TResponse>(this.resolveUrl(path), options);
  }

  /** Full-response GET, for when headers or status are needed. */
  getResponse<TResponse>(
    path: string,
    options?: RequestOptions
  ): Observable<HttpResponse<TResponse>> {
    return this.http.get<TResponse>(this.resolveUrl(path), { ...options, observe: 'response' });
  }

  /** Promise variants for async/await call sites. */
  getAsync<TResponse>(path: string, options?: RequestOptions): Promise<TResponse> {
    return firstValueFrom(this.get<TResponse>(path, options));
  }

  postAsync<TResponse, TPayload = unknown>(
    path: string,
    body: TPayload,
    options?: RequestOptions
  ): Promise<TResponse> {
    return firstValueFrom(this.post<TResponse, TPayload>(path, body, options));
  }

  /** Resolves a relative path against the client's base URL (absolute URLs pass through). */
  resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }
}

/**
 * The app-wide client, bound to `TOCH_LIB_CONFIG.api.baseUrl`.
 * Use `withBaseUrl()` for a service that talks to a different backend.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient extends BoundApiClient {
  constructor() {
    super(inject(HttpClient), inject(TOCH_LIB_CONFIG, { optional: true })?.api?.baseUrl ?? '');
  }

  /** A client identical to this one but resolving against another base URL. */
  withBaseUrl(baseUrl: string): BoundApiClient {
    return new BoundApiClient(this.http, baseUrl);
  }
}
