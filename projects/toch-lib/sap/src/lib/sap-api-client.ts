import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { first, map, Observable } from 'rxjs';
import { TOCH_LIB_CONFIG, RequestHeaders, TochSapConfig } from 'toch-lib/core';
import { ApiClient, assertResponseHasBody } from 'toch-lib/http';
import { parseSapFilterString } from './sap-filter';
import { Entity, EntityResult, EntitySetResult, SapFilter } from './sap-types';

export type SapRequestOptions<T extends Entity> = {
  /** `$expand` navigation paths, joined with commas. */
  expand?: string[];
  /** Typed filters rendered into `$filter` (or pass a prebuilt string). */
  filters?: SapFilter<T>[] | string;
  /** `$select` fields, joined with commas. */
  select?: string[];
  /** Extra query parameters (e.g. `$top`, `$skip`, custom sap-* params). */
  params?: Record<string, string>;
  headers?: HttpHeaders | RequestHeaders;
};

/**
 * SAP Gateway (OData V2) client — compose it instead of extending a base class.
 *
 * It understands the V2 envelopes (`{d: ...}` / `{d: {results}}`), renders
 * typed `SapFilter`s, and adds `sap-language` plus any configured default
 * params (like `sap-client`) to every request.
 *
 * ```ts
 * @Injectable()
 * export class OrdersService {
 *   private readonly api = inject(SapApiClient).forService('ZORDERS_SRV');
 *
 *   getOrders() {
 *     return this.api.getEntitySet<Order>('OrderSet', {
 *       filters: [{ path: 'Status', op: 'eq', value: 'A' }],
 *     });
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class SapApiClient {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiClient);
  private readonly sapConfig: TochSapConfig = inject(TOCH_LIB_CONFIG, { optional: true })?.sap ?? {};

  /** A client whose paths are relative to one OData service: `ZORDERS_SRV/...`. */
  forService(service: string): SapServiceClient {
    return new SapServiceClient(this, service);
  }

  /** Fetches a single entity; unwraps the `{d: ...}` envelope. */
  getEntity<T extends Entity = never>(
    url: string,
    options?: SapRequestOptions<T>
  ): Observable<T> {
    return this.getSapResponse<EntityResult<T>, T>(url, options).pipe(map((res) => res.body.d));
  }

  /** Fetches an entity set; unwraps to `{ results, count }`. */
  getEntitySet<T extends Entity = never>(
    url: string,
    options?: SapRequestOptions<T>
  ): Observable<{ results: T[]; count?: number }> {
    return this.getSapResponse<EntitySetResult<T>, T>(url, options).pipe(
      map((res) => ({
        results: res.body.d.results,
        count: res.body.d.__count !== undefined ? Number(res.body.d.__count) : undefined,
      }))
    );
  }

  /**
   * Full-response variant — use when you need headers, e.g. to read
   * `sap-message` via `processSapSuccessMessages(res.headers)`.
   */
  getEntitySetResponse<T extends Entity = never>(
    url: string,
    options?: SapRequestOptions<T>
  ): Observable<HttpResponse<EntitySetResult<T>> & { body: EntitySetResult<T> }> {
    return this.getSapResponse<EntitySetResult<T>, T>(url, options);
  }

  /** Creates an entity via POST; the CSRF interceptor supplies the token. */
  createEntity<T extends Entity = never>(
    url: string,
    data: Partial<T>,
    headers: HttpHeaders | RequestHeaders = {}
  ): Observable<T> {
    return this.api
      .post<EntityResult<T>, Partial<T>>(url, data, { params: this.sapParams(), headers })
      .pipe(map((res) => res.d));
  }

  /** Updates an entity via PUT (SAP Gateway also accepts MERGE/PATCH). */
  updateEntity<T extends Entity = never>(
    url: string,
    data: Partial<T>,
    headers: HttpHeaders | RequestHeaders = {}
  ): Observable<void> {
    return this.api.put<void, Partial<T>>(url, data, { params: this.sapParams(), headers });
  }

  /** Deletes an entity. */
  deleteEntity(url: string, headers: HttpHeaders | RequestHeaders = {}): Observable<void> {
    return this.api.delete<void>(url, { params: this.sapParams(), headers });
  }

  private getSapResponse<TBody, T extends Entity>(
    url: string,
    options?: SapRequestOptions<T>
  ): Observable<HttpResponse<TBody> & { body: TBody }> {
    const params = this.sapParams(options?.params);
    const filterString =
      typeof options?.filters === 'string' ? options.filters : parseSapFilterString(options?.filters);
    if (filterString.length > 0) {
      params['$filter'] = filterString;
    }
    if (options?.expand !== undefined && options.expand.length > 0) {
      params['$expand'] = options.expand.join(',');
    }
    if (options?.select !== undefined && options.select.length > 0) {
      params['$select'] = options.select.join(',');
    }

    return this.http
      .get<TBody>(this.api.resolveUrl(url), {
        observe: 'response',
        params,
        headers: options?.headers,
      })
      .pipe(
        first(),
        map((response) => {
          assertResponseHasBody(response);
          return response;
        })
      );
  }

  /** `sap-language` + configured default params, merged under the given extras. */
  private sapParams(extra?: Record<string, string>): Record<string, string> {
    return {
      'sap-language': this.sapConfig.language ?? 'he',
      ...(this.sapConfig.defaultParams ?? {}),
      ...(extra ?? {}),
    };
  }
}

/**
 * A SapApiClient view scoped to one OData service — every path is prefixed
 * with the service name, so feature services read naturally:
 * `api.getEntitySet('OrderSet')` → `ZORDERS_SRV/OrderSet`.
 */
export class SapServiceClient {
  constructor(private readonly sap: SapApiClient, readonly service: string) {}

  getEntity<T extends Entity = never>(path: string, options?: SapRequestOptions<T>): Observable<T> {
    return this.sap.getEntity<T>(this.url(path), options);
  }

  getEntitySet<T extends Entity = never>(
    path: string,
    options?: SapRequestOptions<T>
  ): Observable<{ results: T[]; count?: number }> {
    return this.sap.getEntitySet<T>(this.url(path), options);
  }

  getEntitySetResponse<T extends Entity = never>(
    path: string,
    options?: SapRequestOptions<T>
  ): Observable<HttpResponse<EntitySetResult<T>> & { body: EntitySetResult<T> }> {
    return this.sap.getEntitySetResponse<T>(this.url(path), options);
  }

  createEntity<T extends Entity = never>(
    path: string,
    data: Partial<T>,
    headers: HttpHeaders | RequestHeaders = {}
  ): Observable<T> {
    return this.sap.createEntity<T>(this.url(path), data, headers);
  }

  updateEntity<T extends Entity = never>(
    path: string,
    data: Partial<T>,
    headers: HttpHeaders | RequestHeaders = {}
  ): Observable<void> {
    return this.sap.updateEntity<T>(this.url(path), data, headers);
  }

  deleteEntity(path: string, headers: HttpHeaders | RequestHeaders = {}): Observable<void> {
    return this.sap.deleteEntity(this.url(path), headers);
  }

  /** The service-prefixed path, e.g. `ZORDERS_SRV/OrderSet('42')`. */
  url(path: string): string {
    return `${this.service}/${path.startsWith('/') ? path.slice(1) : path}`;
  }
}
