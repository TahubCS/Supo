import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";

import { isSuperAdminEmail } from "./admin";

export async function requireSuperAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (
    !session ||
    !isSuperAdminEmail(session.user.email) ||
    !session.user.emailVerified
  ) {
    notFound();
  }

  return session;
}
