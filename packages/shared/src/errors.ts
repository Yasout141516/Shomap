export const ERROR_CODES = [
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "blocked_category",
  "out_of_area",
  "rate_limited",
  "self_vote",
  "duplicate_vote",
  "invalid_transition",
  "file_too_large",
  "file_type",
  "too_many_files",
  "invalid_otp",
  "sos_not_anonymous",
  "zone_limit",
  "demo_only",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  /** i18n key, always `errors.<code>`; present in both en.json and bn.json. */
  messageKey: string;
  details?: Record<string, unknown>;
}

export function apiError(code: ErrorCode, details?: Record<string, unknown>): ApiError {
  return { code, messageKey: `errors.${code}`, ...(details ? { details } : {}) };
}
