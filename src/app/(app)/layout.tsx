import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (!session.user.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`);
  }
  return <>{children}</>;
}
