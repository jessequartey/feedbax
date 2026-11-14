import type { ApiError, ApiResult, ErrorCode } from "../contracts/domain.ts";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly retryAfter?: number;
  constructor(code: ErrorCode, message: string, field?: string, retryAfter?: number) {
    super(message);
    this.code = code;
    this.field = field;
    this.retryAfter = retryAfter;
  }
}
export type Operation =
  | "request"
  | "posts.create"
  | "comments.create"
  | "votes.set"
  | "admin.action"
  | "auth.request"
  | "health.read"
  | "anonymous-transfer";
export function reportUnexpected(
  error: unknown,
  operation: Operation,
  correlationId = crypto.randomUUID(),
): void {
  // Never serialize the exception, its message/cause, request URL or supplied data.
  console.error({
    type: "request.failure",
    operation,
    classification: error instanceof TypeError ? "type" : "unexpected",
    correlationId,
  });
}
export function apiError(
  error: unknown,
  operation: Operation = "request",
  correlationId = crypto.randomUUID(),
): ApiError {
  if (error instanceof DomainError)
    return {
      code: error.code,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
    };
  reportUnexpected(error, operation, correlationId);
  return { code: "unavailable", message: "Please try again shortly." };
}
export async function result<T>(
  fn: () => Promise<T>,
  operation: Operation = "request",
): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: apiError(error, operation) };
  }
}
export function invalid(field?: string): never {
  throw new DomainError("invalid_input", "Check the supplied input.", field);
}

export function reportHostConfiguration(): void {
  console.error({
    type: "request.failure",
    operation: "host-token.verify",
    classification: "configuration",
    field: "FEEDBAX_HOST_SECRET",
    correlationId: crypto.randomUUID(),
  });
}
