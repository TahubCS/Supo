"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function VerifyEmailContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  const resend = async () => {
    if (!email || pending) return;
    setPending(true);
    await authClient.sendVerificationEmail({
      email,
      callbackURL: "/dashboard",
    });
    setResent(true);
    setPending(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-[color:var(--card-elevated)]">
        <Mail className="size-5 text-[color:var(--text-secondary)]" />
      </div>

      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
        Check your inbox
      </h1>
      <p className="mb-1 text-sm text-[color:var(--text-secondary)]">
        We sent a verification link to
      </p>
      {email ? (
        <p className="mb-6 text-sm font-medium text-foreground">{email}</p>
      ) : (
        <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
          your email address
        </p>
      )}

      <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
        Click the link in the email to activate your account. The link expires
        in 24 hours.
      </p>

      {resent ? (
        <p className="mb-4 text-sm text-[color:var(--text-secondary)]">
          Verification email resent.
        </p>
      ) : (
        <Button
          variant="outline"
          onClick={resend}
          disabled={!email || pending}
          className="mb-4 w-full rounded-lg border-border bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:bg-transparent hover:text-foreground"
        >
          {pending ? "Sending…" : "Resend verification email"}
        </Button>
      )}

      <p className="text-sm text-[color:var(--text-tertiary)]">
        Already verified?{" "}
        <Link href="/sign-in" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
