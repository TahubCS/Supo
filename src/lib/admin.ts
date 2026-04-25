import { env } from "@/lib/env";

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const SUPER_ADMIN_EMAILS = parseCsv(env.SUPO_SUPER_ADMIN_EMAILS);
export const BETTER_AUTH_ADMIN_USER_IDS = env.BETTER_AUTH_ADMIN_USER_IDS
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return SUPER_ADMIN_EMAILS.includes((email ?? "").toLowerCase());
}

export function isSuperAdminUserId(userId: string | null | undefined): boolean {
  return BETTER_AUTH_ADMIN_USER_IDS.includes(userId ?? "");
}
