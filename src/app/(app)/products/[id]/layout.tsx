import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ProductSidebar } from "@/components/ProductSidebar";
import { db } from "@/db";
import { member, product } from "@/db/schema";
import { auth } from "@/lib/auth";

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) notFound();

  const foundProduct = await db.query.product.findFirst({
    where: and(
      eq(product.id, id),
      eq(product.organizationId, membership.organizationId),
    ),
  });
  if (!foundProduct) notFound();

  return (
    <div className="flex min-h-screen bg-background">
      <ProductSidebar
        userName={session.user.name}
        userEmail={session.user.email}
        productId={id}
        productName={foundProduct.name}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
