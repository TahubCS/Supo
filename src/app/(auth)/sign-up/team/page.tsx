"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SocialButtons } from "@/components/auth/SocialButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function TeamSignUpPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const callbackURL = `/dashboard?teamName=${encodeURIComponent(teamName)}`;
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL,
    });

    if (signUpError) {
      setError(signUpError.message ?? "Sign up failed");
      setPending(false);
      return;
    }

    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
        Start for your team
      </h1>
      <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
        Create a shared workspace. Invite teammates after setup.
      </p>

      <SocialButtons callbackURL="/dashboard?onboarding=team" />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-[color:var(--text-tertiary)]">
          or sign up with email
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label
            htmlFor="teamName"
            className="text-[color:var(--text-secondary)]"
          >
            Team name
          </Label>
          <Input
            id="teamName"
            type="text"
            required
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="Acme Support"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-[color:var(--text-secondary)]">
            Your name
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
            Work email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@acme.com"
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
          {pending ? "Creating workspace…" : "Create workspace"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[color:var(--text-secondary)]">
        Signing up as an individual?{" "}
        <Link href="/sign-up" className="text-foreground hover:underline">
          Use a personal account
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
