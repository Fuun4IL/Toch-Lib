import { Nullish } from 'toch-lib/core';

/**
 * SAP OData V2 date/time helpers — replaces the copy-pasted `@toch/sap-utils`
 * parsers with the same call signatures.
 */

/** Formats a date as the V2 JSON body literal `/Date(1700000000000)/`. */
export function parseDateForSAP(timestamp: Date | number): string;
export function parseDateForSAP(timestamp: Nullish): null;
export function parseDateForSAP(timestamp: Nullish<Date | number>): string | null;
export function parseDateForSAP(timestamp: Nullish<Date | number>): string | null {
  if (timestamp == null) return null;
  return `/Date(${timestamp instanceof Date ? timestamp.getTime() : timestamp})/`;
}

/** Formats a date as the V2 URL key/filter literal `datetime'2024-01-15T08:30:00'`. */
export function parseDateForSAPKey(timestamp: Date | number): string;
export function parseDateForSAPKey(timestamp: Nullish): null;
export function parseDateForSAPKey(timestamp: Nullish<Date | number>): string | null;
export function parseDateForSAPKey(timestamp: Nullish<Date | number>): string | null {
  if (timestamp == null) return null;
  const dateObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return `datetime'${dateObj.toISOString().split('.')[0]}'`;
}

/** Formats a date as `datetimeoffset'2024-01-15T08:30:00+02:00'` (local offset). */
export function parseDateOffsetForSAPKey(timestamp: Date | number): string;
export function parseDateOffsetForSAPKey(timestamp: Nullish): null;
export function parseDateOffsetForSAPKey(timestamp: Nullish<Date | number>): string | null;
export function parseDateOffsetForSAPKey(timestamp: Nullish<Date | number>): string | null {
  if (timestamp == null) return null;
  const dateObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const offsetMinutes = -dateObj.getTimezoneOffset();
  if (offsetMinutes === 0) {
    return parseDateForSAPKey(dateObj);
  }
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `datetimeoffset'${dateObj.toISOString().split('.')[0]}${sign}${hh}:${mm}'`;
}

/**
 * Formats a time as the Edm.Time literal `PT08H30M00S`.
 * Accepts a Date or a string like `08:30`, `08:30:15`, `2024-01-15T08:30:15.000Z`.
 */
export function parseTimeForSAP(time: Date | string): string;
export function parseTimeForSAP(time: Nullish): null;
export function parseTimeForSAP(time: Nullish<Date | string>): string | null;
export function parseTimeForSAP(time: Nullish<Date | string>): string | null {
  if (time == null) return null;
  let parts: string[];
  if (typeof time === 'string') {
    let value = time;
    if (value.includes('T')) value = value.split('T')[1];
    if (value.includes('.')) value = value.split('.')[0];
    value = value.replace(/Z$/i, '');
    parts = value.split(':');
    if (parts.length === 2) parts = [...parts, '00'];
    if (parts.length !== 3 || parts.some((p) => p === '' || isNaN(Number(p)))) {
      return null;
    }
  } else {
    parts = [
      String(time.getHours()),
      String(time.getMinutes()),
      String(time.getSeconds()),
    ];
  }
  const [h, m, s] = parts.map((p) => p.padStart(2, '0'));
  return `PT${h}H${m}M${s}S`;
}

/** Extracts the epoch-ms timestamp from a `/Date(1700000000000)/` string (0 when absent). */
export function parseSAPTimestamp(date: Nullish<string>): number {
  const match = date?.match(/\/Date\((-?\d+)\)\//);
  return match && match[1] ? parseInt(match[1], 10) : 0;
}

/** Parses a `/Date(1700000000000)/` string into a Date. */
export function parseSAPDate(date: string): Date;
export function parseSAPDate(date: Nullish): null;
export function parseSAPDate(date: Nullish<string>): Date | null;
export function parseSAPDate(date: Nullish<string>): Date | null {
  return date == null ? null : new Date(parseSAPTimestamp(date));
}

/** Parses an Edm.Time literal `PT08H30M15S` into `08:30:15` (null when invalid). */
export function parseSAPTime(time: Nullish<string>): string | null {
  if (time == null) return null;
  const match = time.match(/^PT(\d{1,2})H(\d{1,2})M(\d{1,2})S$/i);
  if (!match) return null;
  return match
    .slice(1)
    .map((p) => p.padStart(2, '0'))
    .join(':');
}
