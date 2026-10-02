import type { ApiError, ErrorCode } from "@shomap/shared";

/** A failed API call. `messageKey` is always translatable (spec §6). */
export class ApiFail extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | "network",
    public readonly messageKey: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

interface Opts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
}

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiFail(0, "network", "errors.network");
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const e = (json ?? {}) as Partial<ApiError>;
    throw new ApiFail(res.status, e.code ?? "internal", e.messageKey ?? "errors.internal", e.details);
  }
  return json as T;
}

/** Turns any thrown value into a translated message. */
export function errorText(err: unknown, t: (k: string, p?: Record<string, unknown>) => string): string {
  if (err instanceof ApiFail) {
    const min = err.details?.retryAfterMin;
    return t(err.messageKey, typeof min === "number" ? { min } : undefined);
  }
  return t("errors.internal");
}
