import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { Resend } from "resend";

import { db } from "@/db";
import { env } from "@/lib/env";

const resend = new Resend(env.RESEND_API_KEY);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL, "http://localhost:3000"],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
      await resend.emails.send({
        from: "Supo <onboarding@resend.dev>",
        to: user.email,
        subject: "Verify your Supo account",
        html: `
          <p>Hi ${user.name ?? "there"},</p>
          <p>Click the link below to verify your email address:</p>
          <p><a href="${url}" style="color:#000;font-weight:600">Verify email</a></p>
          <p style="color:#737373;font-size:13px">This link expires in 24 hours. If you didn't create a Supo account, you can ignore this email.</p>
        `,
      });
    },
    sendResetPasswordEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
      await resend.emails.send({
        from: "Supo <onboarding@resend.dev>",
        to: user.email,
        subject: "Reset your Supo password",
        html: `
          <p>Hi ${user.name ?? "there"},</p>
          <p>Click the link below to reset your password:</p>
          <p><a href="${url}" style="color:#000;font-weight:600">Reset password</a></p>
          <p style="color:#737373;font-size:13px">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
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
    organization(),
    dash({
      apiKey: env.BETTER_AUTH_API_KEY,
    }),
  ],
});
