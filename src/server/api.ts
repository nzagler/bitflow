import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("Validation failed", 400, error.flatten());
  }

  if (error instanceof Error) {
    return fail(error.message, 500);
  }

  return fail("Unknown error", 500);
}
