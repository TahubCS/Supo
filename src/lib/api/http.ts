import { NextResponse } from "next/server";

// JSON error shape for /api/v1: { error: { code, message } }.
export function apiError(status: number, code: string, message: string, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export const notFound = (what = "Resource") => apiError(404, "not_found", `${what} not found`);
export const badRequest = (message: string) => apiError(400, "invalid_request", message);

export class ApiInputError extends Error {}

const MAX_JSON_BYTES = 256 * 1024;

/** Parses a JSON object body (≤256 KB). Throws ApiInputError on bad input. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_JSON_BYTES) throw new ApiInputError("Request body is too large");
  let value: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_JSON_BYTES) throw new ApiInputError("Request body is too large");
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiInputError) throw error;
    throw new ApiInputError("Body must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiInputError("Body must be a JSON object");
  return value as Record<string, unknown>;
}

export function optionalString(body: Record<string, unknown>, key: string, max = 10_000): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ApiInputError(`${key} must be a string`);
  if (value.length > max) throw new ApiInputError(`${key} is too long (max ${max} characters)`);
  return value;
}

export function parseLimit(value: string | null, fallback = 25, max = 100): number {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

// Keyset pagination cursor: base64url("<ISO timestamp>|<id>").
export function encodeCursor(date: Date, id: string): string {
  return Buffer.from(`${date.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string | null): { date: Date; id: string } | null {
  if (!value) return null;
  try {
    const [iso, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    const date = new Date(iso);
    if (!id || Number.isNaN(date.getTime())) throw new Error("bad cursor");
    return { date, id };
  } catch {
    throw new ApiInputError("Invalid cursor");
  }
}

/** Wraps a handler so ApiInputError becomes a 400 and unexpected errors a 500. */
export function handleApiErrors(error: unknown): NextResponse {
  if (error instanceof ApiInputError) return badRequest(error.message);
  console.error("[api] unexpected error", error);
  return apiError(500, "internal_error", "Something went wrong");
}
