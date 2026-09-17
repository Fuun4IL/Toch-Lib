import { Nullish } from 'toch-lib/core';
import { parseDateForSAPKey, parseDateOffsetForSAPKey } from './sap-dates';
import {
  Entity,
  SapFilter,
  SapFilterArray,
  SapFilterRange,
  SapFilterSubstring,
  SapFilterValue,
  SapValueTypes,
} from './sap-types';

export function isArrayFilter<T extends Entity = never>(val: SapFilter<T>): val is SapFilterArray<T> {
  return val.op === 'arr';
}

export function isValueFilter<T extends Entity = never>(val: SapFilter<T>): val is SapFilterValue<T> {
  return ['eq', 'ne', 'ge', 'gt', 'le', 'lt'].includes(val.op);
}

export function isRangeFilter<T extends Entity = never>(val: SapFilter<T>): val is SapFilterRange<T> {
  return val.op === 'bt' || val.op === 'nb';
}

export function isSubstringFilter<T extends Entity = never>(val: SapFilter<T>): val is SapFilterSubstring<T> {
  return ['startswith', 'endswith', 'contains'].includes(val.op);
}

function formatFilterValue(value: SapValueTypes, datetimeoffset = false): string {
  if (value instanceof Date) {
    return (datetimeoffset ? parseDateOffsetForSAPKey(value) : parseDateForSAPKey(value)) ?? '';
  }
  // SAP Gateway accepts quoted literals for numbers and booleans too; quoting
  // everything matches how ABAP-side conversions expect V2 filter values.
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Renders one SapFilter (possibly nested) into a V2 `$filter` expression. */
export function formatSapFilter<T extends Entity = never>(filter: Nullish<SapFilter<T>>): string {
  if (filter == null) return '';

  if (isArrayFilter(filter)) {
    if (filter.filters.length === 0) return '';
    const joiner = ` ${filter.and ? 'and' : 'or'} `;
    const parts = filter.filters.map((f) => formatSapFilter(f)).filter((f) => f !== '');
    return parts.length > 0 ? `(${parts.join(joiner)})` : '';
  }
  if (isRangeFilter(filter)) {
    const low = formatFilterValue(filter.low, filter.valueIsDatetimeOffset);
    const high = formatFilterValue(filter.high, filter.valueIsDatetimeOffset);
    const range = `(${filter.path} ge ${low} and ${filter.path} le ${high})`;
    return filter.op === 'nb' ? `not ${range}` : range;
  }
  if (isValueFilter(filter)) {
    return `(${filter.path} ${filter.op} ${formatFilterValue(filter.value, filter.valueIsDatetimeOffset)})`;
  }
  if (isSubstringFilter(filter)) {
    const value = filter.value.replace(/'/g, "''");
    const call =
      filter.op === 'contains'
        ? `substringof('${value}',${filter.path})`
        : `${filter.op}(${filter.path},'${value}')`;
    return `(${filter.not ? 'not ' : ''}${call})`;
  }
  return '';
}

/** Renders a filter or list of filters (AND-joined) into a `$filter` string. */
export function parseSapFilterString<T extends Entity = never>(
  filters: Nullish<SapFilter<T> | SapFilter<T>[]>
): string {
  if (Array.isArray(filters)) {
    if (filters.length === 0) return '';
    return formatSapFilter<T>({ op: 'arr', and: true, filters });
  }
  return formatSapFilter(filters);
}

/** Builds an or/and group comparing one path against each of the given values. */
export function parseArrayToFilter<T extends Entity = never>(
  values: SapValueTypes[],
  path: keyof T & string,
  op: SapFilterValue<T>['op'] = 'eq',
  and = false
): SapFilterArray<T> | null {
  return values.length > 0
    ? {
        op: 'arr',
        and,
        filters: values.map((value) => ({ op, path, value })),
      }
    : null;
}
