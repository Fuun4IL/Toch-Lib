import { Nullish } from 'toch-lib/core';

export type SapValueTypes = string | number | Date | boolean;
export type Entity = Record<string, SapValueTypes | unknown>;

export const valueOps = ['eq', 'ne', 'ge', 'gt', 'le', 'lt'] as const;
export const rangeOps = ['bt', 'nb'] as const;
export const substrOps = ['startswith', 'endswith', 'contains'] as const;

/** Group of filters joined with `and`/`or`. */
export type SapFilterArray<T extends Entity = never> = {
  op: 'arr';
  and: boolean;
  filters: SapFilter<T>[];
};

/** Simple comparison: `(Path eq 'value')`. */
export type SapFilterValue<T extends Entity = never> = {
  path: keyof T & string;
  op: (typeof valueOps)[number];
  value: SapValueTypes;
  /** Format Date values as `datetimeoffset'...'` instead of `datetime'...'`. */
  valueIsDatetimeOffset?: boolean;
};

/** Between / not-between: `(Path ge low and Path le high)`. */
export type SapFilterRange<T extends Entity = never> = {
  path: keyof T & string;
  op: (typeof rangeOps)[number];
  low: SapValueTypes;
  high: SapValueTypes;
  valueIsDatetimeOffset?: boolean;
};

/** Substring match: `substringof('v',Path)` / `startswith(Path,'v')` / `endswith(Path,'v')`. */
export type SapFilterSubstring<T extends Entity = never> = {
  path: keyof T & string;
  op: (typeof substrOps)[number];
  value: string;
  not?: boolean;
};

export type SapFilter<T extends Entity = never> =
  | SapFilterArray<T>
  | SapFilterValue<T>
  | SapFilterRange<T>
  | SapFilterSubstring<T>;

export type MessageType = 'success' | 'error' | 'info' | 'warning';

/** Normalized message extracted from SAP responses. */
export type TochMessage = {
  code: string;
  message: string;
  severity: MessageType | string;
};

/** Raw message shape SAP puts in the `sap-message` header / OData error details. */
export type SapMessage = {
  code: string;
  message: string;
  severity: string;
  details?: SapMessage[];
  target?: string;
  transition?: boolean;
};

/** OData V2 single-entity envelope: `{ d: {...} }`. */
export type EntityResult<T> = { d: T };
/** OData V2 entity-set envelope: `{ d: { results: [...], __count? } }`. */
export type EntitySetResult<T> = { d: { results: T[]; __count?: string } };

export type { Nullish };
