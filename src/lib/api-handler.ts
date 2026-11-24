// One place for the boring-but-critical parts of every API route:
//   - safe JSON body parsing (a malformed body must be a 400, not a 500)
//   - a single catch that keeps the `{ message }` contract
//   - server-side logging with a correlation id
//
// Route handlers stay plain functions; this is a wrapper, not a framework.
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";

/** Thrown by route logic when the caller should see a specific message/status. */
export class ApiError extends Error {
  status: number;
  /** Extra JSON fields merged into the response body. */
  extra?: Record<string, unknown>;

  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.extra = extra;
  }
}

export type RouteContext<P = unknown> = {
  request: Request;
  params: P;
  /** Correlated log line for unexpected failures. */
  log: (message: string, error?: unknown) => void;
};

function newCorrelationId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Wrap a route handler.
 *
 *   export const GET = withApi(async ({ request, params }) => { ... });
 *
 * The handler may throw `ApiError` for expected failures; anything else is
 * logged and returned as an opaque 500.
 */
export function withApi<P = unknown>(
  handler: (ctx: RouteContext<P>) => Promise<NextResponse> | NextResponse
) {
  return async (request: Request, context?: { params?: Promise<P> }): Promise<NextResponse> => {
    const correlationId = newCorrelationId();
    const url = new URL(request.url);
    const log = (message: string, error?: unknown) => {
      const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : error;
      console.error(`[${correlationId}] ${request.method} ${url.pathname} - ${message}`, detail ?? "");
    };

    try {
      const params = (await context?.params) as P;
      return await handler({ request, params, log });
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { message: error.message, ...(error.extra ?? {}) },
          { status: error.status }
        );
      }
      log("unhandled error", error);
      const response = errorResponse("Something went wrong. Please try again.", 500);
      response.headers.set("x-correlation-id", correlationId);
      return response;
    }
  };
}

/** Parse a JSON body, or throw a 400 the caller can act on. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("Invalid request body. Please check the form and try again.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("Invalid request body. Please check the form and try again.");
  }
  return body as T;
}
