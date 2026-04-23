"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="rounded-lg border-border bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:bg-transparent hover:text-foreground"
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
