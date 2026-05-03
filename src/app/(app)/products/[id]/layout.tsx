import { notFound } from "next/navigation";

import { ProductSidebar } from "@/components/ProductSidebar";
import { getProductAccess } from "@/lib/product-access";

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access) notFound();

  return (
    <div className="flex min-h-screen bg-background">
      <ProductSidebar
        userName={access.session.user.name}
        userEmail={access.session.user.email}
        productId={id}
        productName={access.product.name}
        role={access.role}
        isWorkspaceOwner={access.isWorkspaceOwner}
      />
      <main className="flex-1 overflow-auto scroll-smooth">{children}</main>
    </div>
  );
}
