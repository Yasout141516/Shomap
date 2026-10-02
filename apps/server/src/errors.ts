import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { apiError, type ErrorCode } from "@shomap/shared";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const badRequest = (details?: Record<string, unknown>) => new HttpError(400, "bad_request", details);
export const notFound = () => new HttpError(404, "not_found");
export const forbidden = () => new HttpError(403, "forbidden");

/** Every error leaves the API as `{ code, messageKey, details? }` (spec §6). */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send(apiError(err.code, err.details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(
        apiError("bad_request", { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }),
      );
    }
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") return reply.status(413).send(apiError("file_too_large"));
    if (code === "FST_FILES_LIMIT") return reply.status(413).send(apiError("too_many_files"));
    if (err.validation) return reply.status(400).send(apiError("bad_request"));
    if (typeof err.statusCode === "number" && err.statusCode < 500) {
      return reply.status(err.statusCode).send(apiError("bad_request"));
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send(apiError("internal"));
  });
}
