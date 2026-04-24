"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { generateOrgSlug } from "@/lib/slug";

export function CreateWorkspaceForm({
  defaultName,
  isTeam = false,
}: {
  defaultName: string;
  isTeam?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: orgError } = await authClient.organization.create({
      name,
      slug: generateOrgSlug(name),
    });

    if (orgError) {
      setError(orgError.message ?? "Workspace creation failed");
      setPending(false);
      return;
    }

    router.refresh();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
        {isTeam ? "Name your team workspace" : "Name your workspace"}
      </h1>
      <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
        {isTeam
          ? "This is shared with anyone you invite."
          : "You can rename it anytime from settings."}
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label
            htmlFor="workspace"
            className="text-[color:var(--text-secondary)]"
          >
            Workspace name
          </Label>
          <Input
            id="workspace"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Support"
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
          {pending ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </div>
  );
}
