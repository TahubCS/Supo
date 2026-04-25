function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  BETTER_AUTH_API_KEY: requireEnv("BETTER_AUTH_API_KEY"),
  BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
  GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
  GITHUB_CLIENT_ID: requireEnv("GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: requireEnv("GITHUB_CLIENT_SECRET"),
  RESEND_API_KEY: requireEnv("RESEND_API_KEY"),
  GOOGLE_GEMINI_API_KEY: requireEnv("GOOGLE_GEMINI_API_KEY"),
  SUPO_SUPER_ADMIN_EMAILS: requireEnv("SUPO_SUPER_ADMIN_EMAILS"),
  BETTER_AUTH_ADMIN_USER_IDS: requireEnv("BETTER_AUTH_ADMIN_USER_IDS"),
};
