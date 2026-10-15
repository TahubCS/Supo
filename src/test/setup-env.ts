// Placeholder configuration for tests. Several modules read env vars at import
// time; tests stub every external service, so these values are never used to
// contact anything.
const defaults: Record<string, string> = {
  BETTER_AUTH_SECRET: "test-secret-value-000000000000000000000",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_API_KEY: "test",
  GOOGLE_CLIENT_ID: "test",
  GOOGLE_CLIENT_SECRET: "test",
  GITHUB_CLIENT_ID: "test",
  GITHUB_CLIENT_SECRET: "test",
  RESEND_API_KEY: "re_test",
  GOOGLE_GEMINI_API_KEY: "test",
  SUPO_SUPER_ADMIN_EMAILS: "admin@example.com",
  BETTER_AUTH_ADMIN_USER_IDS: "admin",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
