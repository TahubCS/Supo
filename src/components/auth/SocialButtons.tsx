"use client";

import { Github } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

type Provider = "google" | "github";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

export function SocialButtons({ callbackURL = "/dashboard" }: { callbackURL?: string }) {
  const [loading, setLoading] = useState<Provider | null>(null);

  const handleSocial = async (provider: Provider) => {
    setLoading(provider);
    await authClient.signIn.social({ provider, callbackURL });
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => handleSocial("google")}
        disabled={loading !== null}
        className="rounded-lg border-border bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:bg-transparent hover:text-foreground"
      >
        <GoogleIcon className="size-4" />
        Google
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => handleSocial("github")}
        disabled={loading !== null}
        className="rounded-lg border-border bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:bg-transparent hover:text-foreground"
      >
        <Github className="size-4" />
        GitHub
      </Button>
    </div>
  );
}
