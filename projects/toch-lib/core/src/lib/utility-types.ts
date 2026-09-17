/** Makes the given fields required and non-null on T. */
export type WithRequiredFields<T, Fields extends keyof T> = T & {
  [Field in Fields]-?: Exclude<T[Field], null>;
};

/** Plain header map accepted by HttpClient. */
export type RequestHeaders = Record<string, string | string[]>;

/** Splits a string literal type by a delimiter. */
export type Split<T extends string, K extends string> = string extends T
  ? string[]
  : T extends ''
  ? []
  : T extends `${infer S}${K}${infer U}`
  ? [S, ...Split<U, K>]
  : [T];

/** T, or null/undefined. */
export type Nullish<T = never> = T | null | undefined;
