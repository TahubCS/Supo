import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { recordSessionFingerprint } from "@/lib/security";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const session = await auth.api.getSession({ headers: headerList });
  if (!session) redirect("/sign-in");
  if (!session.user.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`);
  }
  await recordSessionFingerprint({
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    headerList,
    path: "/app",
    method: "GET",
  });
  return <>{children}</>;
}
