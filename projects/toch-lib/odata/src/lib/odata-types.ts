/** OData protocol version the query string is generated for. */
export enum ODataVersion {
  V2 = 'V2',
  V4 = 'V4',
}

/** Raw literal that is emitted into the query string as-is (no quoting/escaping). */
export class ODataRaw {
  constructor(public readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Marks a string as an OData GUID so it is formatted correctly per version. */
export class ODataGuid {
  constructor(public readonly value: string) {}
}

export type ODataPrimitive = string | number | boolean | Date | null | ODataRaw | ODataGuid;

/** Wrap a value so it is emitted into the query untouched, e.g. a field reference on the right side of a comparison. */
export function raw(value: string): ODataRaw {
  return new ODataRaw(value);
}

/** Wrap a string as a GUID literal (`guid'...'` in V2, bare literal in V4). */
export function guid(value: string): ODataGuid {
  return new ODataGuid(value);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Formats a JS value as an OData literal for the given protocol version. */
export function formatValue(value: ODataPrimitive, version: ODataVersion): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (value instanceof ODataRaw) {
    return value.value;
  }
  if (value instanceof ODataGuid) {
    return version === ODataVersion.V2 ? `guid'${value.value}'` : value.value;
  }
  if (value instanceof Date) {
    if (version === ODataVersion.V2) {
      // V2 Edm.DateTime literal (no timezone designator)
      const d = value;
      return `datetime'${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
        d.getUTCHours()
      )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}'`;
    }
    // V4 Edm.DateTimeOffset literal: plain ISO 8601
    return value.toISOString();
  }
  switch (typeof value) {
    case 'string':
      return `'${value.replace(/'/g, "''")}'`;
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return String(value);
    default:
      return `'${String(value)}'`;
  }
}
