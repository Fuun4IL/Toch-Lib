import { HttpParams } from '@angular/common/http';
import { filter as filterFactory, ODataFilterNode } from './odata-filter';
import { formatValue, ODataGuid, ODataPrimitive, ODataRaw, ODataVersion } from './odata-types';

type FilterInput = ODataFilterNode | string | ((f: typeof filterFactory) => ODataFilterNode);

/** Nested options for a V4 `$expand` segment, e.g. `$expand=Items($select=Id;$top=5)`. */
export class ODataExpand {
  private selectFields: string[] = [];
  private expands: ODataExpand[] = [];
  private filterNode?: ODataFilterNode;
  private rawFilter?: string;
  private orderings: string[] = [];
  private topValue?: number;
  private skipValue?: number;

  constructor(public readonly path: string) {}

  select(...fields: string[]): this {
    this.selectFields.push(...fields);
    return this;
  }

  expand(path: string, configure?: (e: ODataExpand) => void): this {
    const child = new ODataExpand(path);
    configure?.(child);
    this.expands.push(child);
    return this;
  }

  filter(input: FilterInput): this {
    if (typeof input === 'string') {
      this.rawFilter = input;
    } else if (typeof input === 'function') {
      this.filterNode = input(filterFactory);
    } else {
      this.filterNode = input;
    }
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderings.push(direction === 'asc' ? field : `${field} ${direction}`);
    return this;
  }

  top(n: number): this {
    this.topValue = n;
    return this;
  }

  skip(n: number): this {
    this.skipValue = n;
    return this;
  }

  /** @internal */
  render(version: ODataVersion): string {
    if (version === ODataVersion.V2) {
      // V2 supports only nested paths (Items/Product), no per-expand options.
      const paths = [this.path, ...this.expands.map((e) => `${this.path}/${e.render(version)}`)];
      return this.expands.length > 0 ? paths.slice(1).join(',') : this.path;
    }
    const opts: string[] = [];
    if (this.selectFields.length) opts.push(`$select=${this.selectFields.join(',')}`);
    const f = this.rawFilter ?? this.filterNode?.render(version);
    if (f) opts.push(`$filter=${f}`);
    if (this.orderings.length) opts.push(`$orderby=${this.orderings.join(',')}`);
    if (this.topValue !== undefined) opts.push(`$top=${this.topValue}`);
    if (this.skipValue !== undefined) opts.push(`$skip=${this.skipValue}`);
    if (this.expands.length) opts.push(`$expand=${this.expands.map((e) => e.render(version)).join(',')}`);
    return opts.length ? `${this.path}(${opts.join(';')})` : this.path;
  }
}

/**
 * Fluent, version-aware OData query builder.
 *
 * ```ts
 * const url = new ODataQueryBuilder('Products', ODataVersion.V4)
 *   .select('Id', 'Name', 'Price')
 *   .filter(f => f.and(f.eq('Category', 'Beverages'), f.gt('Price', 10)))
 *   .expand('Supplier', e => e.select('CompanyName'))
 *   .orderBy('Price', 'desc')
 *   .top(20).skip(40)
 *   .count()
 *   .toUrl('/odata/v4/catalog/');
 * ```
 */
export class ODataQueryBuilder<T = unknown> {
  private selectFields: string[] = [];
  private expands: ODataExpand[] = [];
  private filterNode?: ODataFilterNode;
  private rawFilter?: string;
  private orderings: string[] = [];
  private topValue?: number;
  private skipValue?: number;
  private countEnabled = false;
  private searchTerm?: string;
  private formatValue?: string;
  private keyValue?: ODataPrimitive | Record<string, ODataPrimitive>;
  private customParams = new Map<string, string>();

  constructor(
    public readonly entitySet: string,
    public readonly version: ODataVersion = ODataVersion.V4
  ) {}

  /** Address a single entity by key: `Products(42)` or `OrderItems(OrderId=1,ItemId=2)`. */
  byKey(key: ODataPrimitive | Record<string, ODataPrimitive>): this {
    this.keyValue = key;
    return this;
  }

  select(...fields: (keyof T & string | string)[]): this {
    this.selectFields.push(...(fields as string[]));
    return this;
  }

  /**
   * Accepts a filter node, a raw string, or a builder callback:
   * `.filter(f => f.eq('Status', 'A'))`. Multiple calls are AND-combined.
   */
  filter(input: FilterInput): this {
    let node: ODataFilterNode | undefined;
    if (typeof input === 'string') {
      node = filterFactory.raw(input);
    } else if (typeof input === 'function') {
      node = input(filterFactory);
    } else {
      node = input;
    }
    this.filterNode = this.filterNode ? this.filterNode.and(node) : node;
    return this;
  }

  expand(path: string, configure?: (e: ODataExpand) => void): this {
    const child = new ODataExpand(path);
    configure?.(child);
    this.expands.push(child);
    return this;
  }

  orderBy(field: keyof T & string | string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderings.push(direction === 'asc' ? field : `${field} ${direction}`);
    return this;
  }

  top(n: number): this {
    this.topValue = n;
    return this;
  }

  skip(n: number): this {
    this.skipValue = n;
    return this;
  }

  /** Convenience for paging: page is zero-based. */
  page(page: number, pageSize: number): this {
    this.topValue = pageSize;
    this.skipValue = page * pageSize;
    return this;
  }

  /** V4: `$count=true` — V2: `$inlinecount=allpages`. */
  count(enabled = true): this {
    this.countEnabled = enabled;
    return this;
  }

  /** V4 only (`$search`). Ignored for V2. */
  search(term: string): this {
    this.searchTerm = term;
    return this;
  }

  /** e.g. `.format('json')` — mostly useful for V2 services. */
  format(fmt: string): this {
    this.formatValue = fmt;
    return this;
  }

  /** Add a custom query parameter (e.g. `sap-client`, custom annotations). */
  param(name: string, value: string): this {
    this.customParams.set(name, value);
    return this;
  }

  /** The resource path, including the key segment if `byKey` was used. */
  buildPath(): string {
    if (this.keyValue === undefined) {
      return this.entitySet;
    }
    const isCompositeKey =
      typeof this.keyValue === 'object' &&
      this.keyValue !== null &&
      !(this.keyValue instanceof Date) &&
      !(this.keyValue instanceof ODataRaw) &&
      !(this.keyValue instanceof ODataGuid);
    if (isCompositeKey) {
      const parts = Object.entries(this.keyValue as Record<string, ODataPrimitive>)
        .map(([k, v]) => `${k}=${formatValue(v, this.version)}`)
        .join(',');
      return `${this.entitySet}(${parts})`;
    }
    return `${this.entitySet}(${formatValue(this.keyValue as ODataPrimitive, this.version)})`;
  }

  /** Query options as an ordered list of [name, value] pairs (unencoded). */
  buildParams(): [string, string][] {
    const v = this.version;
    const params: [string, string][] = [];
    if (this.selectFields.length) params.push(['$select', this.selectFields.join(',')]);
    const f = this.rawFilter ?? this.filterNode?.render(v);
    if (f) params.push(['$filter', f]);
    if (this.expands.length) params.push(['$expand', this.expands.map((e) => e.render(v)).join(',')]);
    if (this.orderings.length) params.push(['$orderby', this.orderings.join(',')]);
    if (this.topValue !== undefined) params.push(['$top', String(this.topValue)]);
    if (this.skipValue !== undefined) params.push(['$skip', String(this.skipValue)]);
    if (this.countEnabled) {
      params.push(v === ODataVersion.V2 ? ['$inlinecount', 'allpages'] : ['$count', 'true']);
    }
    if (this.searchTerm && v === ODataVersion.V4) params.push(['$search', this.searchTerm]);
    if (this.formatValue) params.push(['$format', this.formatValue]);
    for (const [name, value] of this.customParams) params.push([name, value]);
    return params;
  }

  /** Query string without the leading `?` (unencoded, readable). */
  buildQuery(): string {
    return this.buildParams()
      .map(([k, val]) => `${k}=${val}`)
      .join('&');
  }

  /** `EntitySet?...` — relative URL with percent-encoded parameter values. */
  build(): string {
    const q = this.buildParams()
      .map(([k, val]) => `${k}=${encodeURIComponent(val)}`)
      .join('&');
    return q ? `${this.buildPath()}?${q}` : this.buildPath();
  }

  /** Prepends a service root URL: `toUrl('/sap/opu/odata/sap/MY_SRV/')`. */
  toUrl(serviceRoot: string): string {
    const root = serviceRoot.endsWith('/') ? serviceRoot : `${serviceRoot}/`;
    return `${root}${this.build()}`;
  }

  /** Angular `HttpParams` for use with `http.get(path, { params })`. */
  toHttpParams(): HttpParams {
    let params = new HttpParams();
    for (const [k, val] of this.buildParams()) {
      params = params.set(k, val);
    }
    return params;
  }

  toString(): string {
    return this.build();
  }
}

/** Shorthand factories. */
export function odataV2<T = unknown>(entitySet: string): ODataQueryBuilder<T> {
  return new ODataQueryBuilder<T>(entitySet, ODataVersion.V2);
}

export function odataV4<T = unknown>(entitySet: string): ODataQueryBuilder<T> {
  return new ODataQueryBuilder<T>(entitySet, ODataVersion.V4);
}
