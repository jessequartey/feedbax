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
export function apiError(error: unknown): ApiError {
  if (error instanceof DomainError)
    return {
      code: error.code,
      message: error.message,
      ...(error.field ? { field: error.field } : {}),
    };
  return { code: "unavailable", message: "Please try again shortly." };
}
export async function result<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: apiError(error) };
  }
}
export function invalid(field?: string): never {
  throw new DomainError("invalid_input", "Check the supplied input.", field);
}
