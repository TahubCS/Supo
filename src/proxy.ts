import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { type NextRequest, NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";

// Upstash Redis is required in production for public auth/chat rate limits.
// Local development fails open so developers are not blocked by infrastructure.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Must stay in sync with the CORS constant in src/app/api/chat/route.ts.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const limiters = redis
  ? {
      chatPost: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "60 s"),
        prefix: "rl:chat:post",
      }),
      chatGet: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, "60 s"),
        prefix: "rl:chat:get",
      }),
      signIn: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(10, "15 m"),
        prefix: "rl:auth:sign-in",
      }),
      signUp: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(5, "60 m"),
        prefix: "rl:auth:sign-up",
      }),
      forgotPw: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(3, "60 m"),
        prefix: "rl:auth:forgot-pw",
      }),
      verifyEmail: new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(5, "60 m"),
        prefix: "rl:auth:verify-email",
      }),
    }
  : null;

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function retryAfter(resetMs: number): string {
  return String(Math.max(1, Math.ceil((resetMs - Date.now()) / 1000)));
}

function rateLimitUnavailable(path: string): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: "Rate limiting is not configured. Set Upstash Redis env vars." }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        ...(path === "/api/chat" ? CORS_HEADERS : {}),
      },
    },
  );
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { method, nextUrl } = req;
  const path = nextUrl.pathname;

  // OPTIONS preflight must never be blocked; the route handler owns the 204.
  if (method === "OPTIONS") return NextResponse.next();

  if (!limiters) {
    return isProduction ? rateLimitUnavailable(path) : NextResponse.next();
  }

  const ip = getIp(req);

  try {
    if (path === "/api/chat") {
      const limiter = method === "POST" ? limiters.chatPost : limiters.chatGet;
      const result = await limiter.limit(ip);
      if (!result.success) {
        return new NextResponse(
          JSON.stringify({ error: "Too many requests. Please slow down." }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": retryAfter(result.reset),
              ...CORS_HEADERS,
            },
          },
        );
      }
      return NextResponse.next();
    }

    // Auth endpoints: only POST requests carry credentials worth rate limiting.
    if (method !== "POST") return NextResponse.next();

    const limiterMap: Record<string, Ratelimit> = {
      "/api/auth/sign-in/email": limiters.signIn,
      "/api/auth/sign-up/email": limiters.signUp,
      "/api/auth/request-password-reset": limiters.forgotPw,
      "/api/auth/send-verification-email": limiters.verifyEmail,
    };

    const limiter = limiterMap[path];
    if (limiter) {
      const result = await limiter.limit(ip);
      if (!result.success) {
        return new NextResponse(
          JSON.stringify({ error: "Too many requests. Please try again later." }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": retryAfter(result.reset),
            },
          },
        );
      }
    }
  } catch {
    if (isProduction) {
      return rateLimitUnavailable(path);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/chat",
    "/api/auth/sign-in/email",
    "/api/auth/sign-up/email",
    "/api/auth/request-password-reset",
    "/api/auth/send-verification-email",
  ],
};
