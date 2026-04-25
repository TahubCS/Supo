"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: resetError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    if (resetError) {
      setError(resetError.message ?? "Something went wrong");
      setPending(false);
      return;
    }

    setSent(true);
    setPending(false);
  };

  if (sent) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
          Check your inbox
        </h1>
        <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
          If an account exists for{" "}
          <span className="text-foreground">{email}</span>, we sent a password
          reset link.
        </p>
        <Link
          href="/sign-in"
          className="text-sm text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
        Reset password
      </h1>
      <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[color:var(--text-secondary)]">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {error ? (
          <p className="text-sm text-[color:var(--status-error,#ef4444)]">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-foreground text-background hover:bg-foreground/90"
        >
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[color:var(--text-secondary)]">
        Remembered it?{" "}
        <Link href="/sign-in" className="text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
