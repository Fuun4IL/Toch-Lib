import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { SapMessage, TochMessage } from './sap-types';

/** SAP technical wrapper exception that carries no user-facing information. */
const SAP_TECH_ERROR_CODE = '/IWBEP/CX_MGW_TECH_EXCEPTION';

function toMessage(raw: SapMessage): TochMessage {
  const { code, message, severity } = raw;
  return { code, message, severity };
}

/**
 * Extracts the messages SAP sends on successful responses in the
 * `sap-message` response header (main message + its details).
 *
 * ```ts
 * this.getEntitySetResponse(...).subscribe(res => {
 *   const messages = processSapSuccessMessages(res.headers);
 * });
 * ```
 */
export function processSapSuccessMessages(
  headers: HttpHeaders | { get(name: string): string | null }
): TochMessage[] {
  const raw = headers.get('sap-message');
  if (!raw) return [];
  try {
    const message = JSON.parse(raw) as SapMessage;
    if (message == null) return [];
    return [toMessage(message), ...(message.details?.map(toMessage) ?? [])];
  } catch {
    return [];
  }
}

/**
 * Extracts user-facing messages from an SAP OData error response
 * (`error.error.innererror.errordetails`), skipping the technical
 * `/IWBEP/CX_MGW_TECH_EXCEPTION` wrapper entries.
 */
export function processSapErrorMessages(error: unknown): TochMessage[] {
  const body = error instanceof HttpErrorResponse ? error.error : (error as any)?.error ?? error;
  const details: SapMessage[] | undefined = body?.error?.innererror?.errordetails;
  if (Array.isArray(details)) {
    return details.filter((d) => d.code !== SAP_TECH_ERROR_CODE).map(toMessage);
  }
  // Fall back to the top-level error message when there are no details.
  const top = body?.error;
  if (top?.message) {
    const text = typeof top.message === 'string' ? top.message : top.message.value;
    if (text) {
      return [{ code: top.code ?? '', message: text, severity: 'error' }];
    }
  }
  return [];
}
