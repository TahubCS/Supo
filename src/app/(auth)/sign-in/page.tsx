"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { SocialButtons } from "@/components/auth/SocialButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function SignInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const justReset = params.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setUnverified(false);
    setResendSent(false);
    setPending(true);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    if (signInError) {
      if (signInError.message === "Email not verified") {
        setUnverified(true);
      } else {
        setError(signInError.message ?? "Sign in failed");
      }
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const resendVerification = async () => {
    setResendPending(true);
    await authClient.sendVerificationEmail({
      email,
      callbackURL: "/dashboard",
    });
    setResendSent(true);
    setResendPending(false);
    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      {justReset ? (
        <p className="mb-4 rounded-lg border border-border bg-[color:var(--card-elevated)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
          Password reset. Sign in with your new password.
        </p>
      ) : null}
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
        Welcome back
      </h1>
      <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
        Sign in to continue to your workspace.
      </p>

      <SocialButtons />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-[color:var(--text-tertiary)]">
          or continue with email
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

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
            onChange={(event) => {
              setEmail(event.target.value);
              setUnverified(false);
              setError(null);
            }}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="password"
              className="text-[color:var(--text-secondary)]"
            >
              Password
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs text-[color:var(--text-tertiary)] hover:text-foreground"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {unverified ? (
          <div className="rounded-lg border border-border bg-[color:var(--card-elevated)] px-4 py-3 text-sm">
            <p className="mb-2 text-[color:var(--text-secondary)]">
              This email hasn&apos;t been verified yet.
            </p>
            {resendSent ? (
              <p className="text-[color:var(--text-secondary)]">
                Verification email sent — check your inbox.
              </p>
            ) : (
              <button
                type="button"
                onClick={resendVerification}
                disabled={resendPending}
                className="font-medium text-foreground hover:underline disabled:opacity-50"
              >
                {resendPending ? "Sending…" : "Resend verification email →"}
              </button>
            )}
          </div>
        ) : null}

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
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[color:var(--text-secondary)]">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
