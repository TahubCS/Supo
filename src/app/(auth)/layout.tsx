import { MessageCircle } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-foreground">
          <MessageCircle className="size-4 text-background" />
        </div>
        <span className="text-base font-semibold text-foreground">Supo</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
