"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SocialButtons } from "@/components/auth/SocialButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { generateOrgSlug } from "@/lib/slug";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message ?? "Sign up failed");
      setPending(false);
      return;
    }

    const workspaceName = `${name.split(" ")[0] || "My"}'s workspace`;
    const { error: orgError } = await authClient.organization.create({
      name: workspaceName,
      slug: generateOrgSlug(workspaceName),
    });

    if (orgError) {
      setError(orgError.message ?? "Workspace creation failed");
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
        Start free trial
      </h1>
      <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
        Create your personal workspace. No credit card required.
      </p>

      <SocialButtons />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-[color:var(--text-tertiary)]">
          or sign up with email
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-[color:var(--text-secondary)]">
            Full name
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
          />
        </div>

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

        <div className="space-y-2">
          <Label
            htmlFor="password"
            className="text-[color:var(--text-secondary)]"
          >
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-[color:var(--text-tertiary)]">
            At least 8 characters.
          </p>
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
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[color:var(--text-secondary)]">
        Need to onboard a team?{" "}
        <Link href="/sign-up/team" className="text-foreground hover:underline">
          Start a team account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-[color:var(--text-secondary)]">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
