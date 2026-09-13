/**
 * Shared error-message extraction (Phase A fix for "[object Object]" renders).
 *
 * Root cause: Supabase's PostgrestError is a PLAIN OBJECT ({ code, details,
 * hint, message }) — not an Error instance. Any catch site that stringifies a
 * thrown one (`String(err)`) renders "[object Object]". Every human-facing
 * error path must go through `toErrorMessage` instead.
 */

interface MessageCarrier {
  message?: unknown;
  error?: unknown;
  msg?: unknown;
  detail?: unknown;
}

const firstString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
};

/** Human-readable message for ANY thrown value. Never returns "[object Object]". */
export const toErrorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (err == null) return fallback;

  // Real Error (or Error subclass): prefer its message.
  const direct = firstString((err as MessageCarrier)?.message);
  if (direct) return direct;

  // Plain-object carriers (PostgrestError, fetch wrappers, { error } shapes).
  if (typeof err === 'object') {
    const carrier = err as MessageCarrier;
    for (const key of ['message', 'error', 'msg', 'detail'] as const) {
      const found = firstString(carrier[key]);
      if (found) return found;
    }
  }

  // String throws are already fine.
  const asString = firstString(err);
  if (asString) return asString;

  return fallback;
};

/** True when the error is PostgREST's "function not found" (PGRST202) — the
 *  signature for "this RPC was never deployed to the server" (or its argument
 *  shape doesn't match). Callers use this to add actionable copy. */
export const isMissingRpcError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  const message = toErrorMessage(err, '');
  return code === 'PGRST202' || /could not find the function|schema cache/i.test(message);
};
