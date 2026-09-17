import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { first, map, Observable } from 'rxjs';
import { TOCH_LIB_CONFIG, RequestHeaders } from 'toch-lib/core';
import { BaseApiService } from 'toch-lib/http';
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
 * Base class for SAP Gateway (OData V2) API services.
 *
 * On top of BaseApiService it understands the V2 envelopes (`{d: ...}` /
 * `{d: {results}}`), renders typed `SapFilter`s, and adds `sap-language`
 * plus any configured default params (like `sap-client`) to every request.
 *
 * ```ts
 * @Injectable()
 * export class OrdersApiService extends BaseSapApiService {
 *   protected readonly service = 'ZORDERS_SRV';
 *
 *   getOrders() {
 *     return this.getEntitySet<Order>(this.entityUrl('OrderSet'), {
 *       filters: [{ path: 'Status', op: 'eq', value: 'A' }],
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class BaseSapApiService extends BaseApiService {
  /** SAP OData service name, e.g. `ZORDERS_SRV`. Used by `entityUrl()`. */
  protected abstract readonly service: string;

  private readonly sapConfig = inject(TOCH_LIB_CONFIG, { optional: true })?.sap ?? {};

  /** Prefixes an entity-set path with the service name: `ZORDERS_SRV/OrderSet`. */
  protected entityUrl(path: string): string {
    return `${this.service}/${path.startsWith('/') ? path.slice(1) : path}`;
  }

  /** Fetches a single entity; unwraps the `{d: ...}` envelope. */
  protected getEntity<T extends Entity = never>(
    url: string,
    options?: SapRequestOptions<T>
  ): Observable<T> {
    return this.getSapResponse<EntityResult<T>, T>(url, options).pipe(map((res) => res.body.d));
  }

  /** Fetches an entity set; unwraps to `{ results, count }`. */
  protected getEntitySet<T extends Entity = never>(
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
  protected getEntitySetResponse<T extends Entity = never>(
    url: string,
    options?: SapRequestOptions<T>
  ): Observable<HttpResponse<EntitySetResult<T>> & { body: EntitySetResult<T> }> {
    return this.getSapResponse<EntitySetResult<T>, T>(url, options);
  }

  /** Creates an entity via POST; the CSRF interceptor supplies the token. */
  protected createEntity<T extends Entity = never>(
    url: string,
    data: Partial<T>,
    headers: HttpHeaders | RequestHeaders = {}
  ): Observable<T> {
    return this.post<EntityResult<T>, Partial<T>>(url, data, {
      params: this.sapParams(),
      headers,
    }).pipe(map((res) => res.d));
  }

  /** Updates an entity via PUT (SAP Gateway also accepts MERGE/PATCH). */
  protected updateEntity<T extends Entity = never>(
    url: string,
    data: Partial<T>,
    headers: HttpHeaders | RequestHeaders = {}
  ): Observable<void> {
    return this.put<void, Partial<T>>(url, data, { params: this.sapParams(), headers });
  }

  /** Deletes an entity. */
  protected deleteEntity(url: string, headers: HttpHeaders | RequestHeaders = {}): Observable<void> {
    return this.delete<void>(url, { params: this.sapParams(), headers });
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

    return this._http
      .get<TBody>(this.resolveUrl(url), {
        observe: 'response',
        params,
        headers: options?.headers,
      })
      .pipe(
        first(),
        map((response) => {
          this.assertResponseHasBody(response);
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
