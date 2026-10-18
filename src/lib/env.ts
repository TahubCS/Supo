function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

// Values are read lazily so that importing a module never throws at build time
// (CI, `next build`, unit tests). A missing required variable still fails loudly
// the first time code actually needs it.
export const env = {
  get DATABASE_URL() {
    return requireEnv("DATABASE_URL");
  },
  // Disable TLS for local Postgres (`DATABASE_SSL=disable` or `sslmode=disable` in the URL).
  get DATABASE_SSL() {
    return optionalEnv("DATABASE_SSL");
  },
  get BETTER_AUTH_API_KEY() {
    return requireEnv("BETTER_AUTH_API_KEY");
  },
  get BETTER_AUTH_SECRET() {
    return requireEnv("BETTER_AUTH_SECRET");
  },
  get BETTER_AUTH_URL() {
    return requireEnv("BETTER_AUTH_URL");
  },
  get GOOGLE_CLIENT_ID() {
    return requireEnv("GOOGLE_CLIENT_ID");
  },
  get GOOGLE_CLIENT_SECRET() {
    return requireEnv("GOOGLE_CLIENT_SECRET");
  },
  get GITHUB_CLIENT_ID() {
    return requireEnv("GITHUB_CLIENT_ID");
  },
  get GITHUB_CLIENT_SECRET() {
    return requireEnv("GITHUB_CLIENT_SECRET");
  },
  get RESEND_API_KEY() {
    return requireEnv("RESEND_API_KEY");
  },
  get GOOGLE_GEMINI_API_KEY() {
    return requireEnv("GOOGLE_GEMINI_API_KEY");
  },
  get SUPO_SUPER_ADMIN_EMAILS() {
    return requireEnv("SUPO_SUPER_ADMIN_EMAILS");
  },
  get BETTER_AUTH_ADMIN_USER_IDS() {
    return requireEnv("BETTER_AUTH_ADMIN_USER_IDS");
  },
  get SECURITY_ALERT_FROM_EMAIL() {
    return optionalEnv("SECURITY_ALERT_FROM_EMAIL");
  },
  get ABLY_API_KEY() {
    return optionalEnv("ABLY_API_KEY");
  },
  // Shared secret for internal server-to-server routes and Vercel Cron
  // (Vercel sends `Authorization: Bearer $CRON_SECRET`).
  get CRON_SECRET() {
    return optionalEnv("CRON_SECRET");
  },
  // Email channel: the domain whose inbound mail Resend forwards to Supo
  // (e.g. "inbound.example.com"), and the signing secret of that Resend webhook.
  get INBOUND_EMAIL_DOMAIN() {
    return optionalEnv("INBOUND_EMAIL_DOMAIN")?.toLowerCase();
  },
  get RESEND_WEBHOOK_SECRET() {
    return optionalEnv("RESEND_WEBHOOK_SECRET");
  },
  // GitHub App used to connect repositories to the knowledge base. Separate from
  // the GitHub OAuth app used for sign-in (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).
  get GITHUB_APP_ID() {
    return optionalEnv("GITHUB_APP_ID");
  },
  get GITHUB_APP_SLUG() {
    return optionalEnv("GITHUB_APP_SLUG");
  },
  get GITHUB_APP_CLIENT_ID() {
    return optionalEnv("GITHUB_APP_CLIENT_ID");
  },
  get GITHUB_APP_CLIENT_SECRET() {
    return optionalEnv("GITHUB_APP_CLIENT_SECRET");
  },
  // PEM private key. Escaped "\n" sequences (single-line env values) are accepted.
  get GITHUB_APP_PRIVATE_KEY() {
    return optionalEnv("GITHUB_APP_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  },
  get GITHUB_APP_WEBHOOK_SECRET() {
    return optionalEnv("GITHUB_APP_WEBHOOK_SECRET");
  },
  // Atlassian OAuth 2.0 (3LO) app used to connect Confluence to the knowledge base.
  get ATLASSIAN_CLIENT_ID() {
    return optionalEnv("ATLASSIAN_CLIENT_ID");
  },
  get ATLASSIAN_CLIENT_SECRET() {
    return optionalEnv("ATLASSIAN_CLIENT_SECRET");
  },
  // 32 random bytes, base64. Encrypts third-party OAuth tokens at rest; kept
  // separate from BETTER_AUTH_SECRET so either can rotate on its own.
  get INTEGRATIONS_ENCRYPTION_KEY() {
    return optionalEnv("INTEGRATIONS_ENCRYPTION_KEY");
  },
};
