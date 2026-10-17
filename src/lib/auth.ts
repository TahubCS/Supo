import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { admin, organization } from "better-auth/plugins";
import { Redis } from "@upstash/redis";
import { after } from "next/server";
import { Resend } from "resend";

import { db } from "@/db";
import { env } from "@/lib/env";
import { escapeHtml } from "@/lib/html";
import { PRODUCTION_ORIGIN, authTrustedOrigins, normalizeOrigin } from "@/lib/trusted-origins";

const isProduction = process.env.NODE_ENV === "production";
const resend = new Resend(env.RESEND_API_KEY);
const defaultSenderEmail =
  env.SECURITY_ALERT_FROM_EMAIL ??
  (isProduction
    ? "Supo <no-reply@muhammadtahubkhatri.dev>"
    : "Supo <onboarding@resend.dev>");

// Shared rate-limit counters. Serverless instances do not share memory, so
// Better Auth's default in-memory limiter would count per instance.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const configuredOrigin = normalizeOrigin(env.BETTER_AUTH_URL);

function resolveBaseURL(): string {
  if (isProduction) {
    if (!configuredOrigin || configuredOrigin.includes("localhost")) {
      return PRODUCTION_ORIGIN;
    }
    return configuredOrigin;
  }
  return configuredOrigin ?? "http://localhost:3000";
}

const baseURL = resolveBaseURL();
const trustedOrigins = Array.from(new Set([baseURL, ...authTrustedOrigins()]));

function shouldSuppressInfraOAuthStateLog(level: string, message: string, args: unknown[]) {
  if (level !== "error" || message !== "Failed to parse state") return false;

  const error = args[0];
  if (!(error instanceof Error)) return false;

  const code = "code" in error ? error.code : undefined;
  const isConsumedStateError =
    code === "state_mismatch" && error.message === "State mismatch: verification not found";
  if (!isConsumedStateError) return false;

  const loggerStack = new Error().stack ?? "";
  return loggerStack.includes("@better-auth/infra");
}

function logBetterAuth(level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) {
  if (shouldSuppressInfraOAuthStateLog(level, message, args)) return;

  const formatted = `${new Date().toISOString()} ${level.toUpperCase()} [Better Auth]: ${message}`;
  if (level === "error") {
    console.error(formatted, ...args);
    return;
  }
  if (level === "warn") {
    console.warn(formatted, ...args);
    return;
  }
  console.log(formatted, ...args);
}

const adminAc = createAccessControl(defaultStatements);
const supoAdminRole = adminAc.newRole({
  user: ["create", "list", "set-role", "ban", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});
const supoUserRole = adminAc.newRole({
  user: [],
  session: [],
});

export const auth = betterAuth({
  appName: "Supo",
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins,
  logger: {
    level: "warn",
    log: logBetterAuth,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  advanced: {
    useSecureCookies: isProduction,
    ipAddress: {
      ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
    },
    database: {
      joins: true,
    },
    // Emails are sent after the response so its timing does not reveal
    // whether an account exists; `after` keeps the function alive until done.
    backgroundTasks: {
      handler: (task) => {
        const guarded = task.catch((error: unknown) =>
          logBetterAuth("error", "Background task failed", error),
        );
        try {
          after(() => guarded);
        } catch {
          // Outside a request scope (scripts, tests) the task simply runs.
        }
      },
    },
  },
  onAPIError: {
    errorURL: `${baseURL}/sign-in`,
  },
  rateLimit: {
    customStorage: redis
      ? {
          async consume(key, { window, max }) {
            const redisKey = `rl:better-auth:${key}`;
            try {
              const [, count, ttl] = await redis
                .multi()
                .set(redisKey, 0, { nx: true, ex: window })
                .incr(redisKey)
                .ttl(redisKey)
                .exec<[unknown, number, number]>();
              if (count <= max) return { allowed: true, retryAfter: null };
              return { allowed: false, retryAfter: Math.max(1, ttl) };
            } catch (error) {
              // Same policy as src/proxy.ts: an unreachable limiter must not block sign-in.
              logBetterAuth("error", "Rate limit storage unavailable, failing open", error);
              return { allowed: true, retryAfter: null };
            }
          },
        }
      : undefined,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: defaultSenderEmail,
        to: user.email,
        subject: "Reset your Supo password",
        html: `
          <p>Hi ${escapeHtml(user.name ?? "there")},</p>
          <p>Click the link below to reset your password:</p>
          <p><a href="${escapeHtml(url)}" style="color:#000;font-weight:600">Reset password</a></p>
          <p style="color:#737373;font-size:13px">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
        `,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    // Matches the "expires in 24 hours" promise in the email below.
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: defaultSenderEmail,
        to: user.email,
        subject: "Verify your Supo account",
        html: `
          <p>Hi ${escapeHtml(user.name ?? "there")},</p>
          <p>Click the link below to verify your email address:</p>
          <p><a href="${escapeHtml(url)}" style="color:#000;font-weight:600">Verify email</a></p>
          <p style="color:#737373;font-size:13px">This link expires in 24 hours. If you didn't create a Supo account, you can ignore this email.</p>
        `,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  plugins: [
    admin({
      ac: adminAc,
      roles: {
        admin: supoAdminRole,
        user: supoUserRole,
      },
    }),
    organization(),
    dash({
      apiKey: env.BETTER_AUTH_API_KEY,
    }),
  ],
});
