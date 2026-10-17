export const PRODUCTION_ORIGIN = "https://supo.muhammadtahubkhatri.dev";

type OriginEnv = Partial<
  Record<
    | "NODE_ENV"
    | "BETTER_AUTH_URL"
    | "BETTER_AUTH_TRUSTED_ORIGINS"
    | "VERCEL_PROJECT_PRODUCTION_URL"
    | "VERCEL_BRANCH_URL"
    | "VERCEL_URL",
    string | undefined
  >
>;

export function normalizeOrigin(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

function vercelOrigin(host: string | undefined): string | null {
  return host ? normalizeOrigin(`https://${host}`) : null;
}

function isLoopback(origin: string): boolean {
  const { hostname } = new URL(origin);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Origins allowed to send credentialed auth requests and to be used as auth
 * redirect targets (callbackURL, redirectTo, ...).
 *
 * Only exact origins are listed. Never add a wildcard on a shared hosting
 * domain such as `*.vercel.app`: anyone can deploy there, and a trusted
 * attacker origin can receive password-reset tokens through `redirectTo`.
 * This deployment's own Vercel URLs come from Vercel's system env vars; any
 * other origin must be listed in BETTER_AUTH_TRUSTED_ORIGINS.
 */
export function authTrustedOrigins(source: OriginEnv = process.env): string[] {
  const isProduction = source.NODE_ENV === "production";
  const extra = (source.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(/[\s,]+/).map(normalizeOrigin);

  const origins = [
    normalizeOrigin(source.BETTER_AUTH_URL),
    PRODUCTION_ORIGIN,
    vercelOrigin(source.VERCEL_PROJECT_PRODUCTION_URL),
    vercelOrigin(source.VERCEL_BRANCH_URL),
    vercelOrigin(source.VERCEL_URL),
    ...extra,
    isProduction ? null : "http://localhost:3000",
  ].filter((origin): origin is string => Boolean(origin));

  return Array.from(new Set(origins)).filter((origin) => !isProduction || !isLoopback(origin));
}
