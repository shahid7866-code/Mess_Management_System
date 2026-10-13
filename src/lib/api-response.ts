import "server-only";
import mongoose from "mongoose";

export interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor({ status, code, message }: ApiErrorOptions) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function successResponse<T>(data: T, status = 200): Response {
  return Response.json(
    { ok: true, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function failureResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function handleApiError(
  error: unknown,
  context: string,
  fallbackMessage = "Internal server error",
): Response {
  if (error instanceof ApiError) {
    return failureResponse(error.code, error.message, error.status);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return failureResponse("VALIDATION_ERROR", "Request validation failed", 400);
  }

  if (error instanceof mongoose.Error.CastError) {
    return failureResponse("INVALID_ID", "A supplied identifier is invalid", 400);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  ) {
    return failureResponse(
      "DUPLICATE_RECORD",
      "A record with this unique value already exists",
      409,
    );
  }

  const diagnostic = error instanceof Error ? error.name : "UnknownError";
  console.error(`[${context}] ${diagnostic}`);
  return failureResponse("INTERNAL_ERROR", fallbackMessage, 500);
}