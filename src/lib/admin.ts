export const SUPER_ADMIN_EMAILS = ["khatrim23@students.ecu.edu"];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return SUPER_ADMIN_EMAILS.includes((email ?? "").toLowerCase());
}
