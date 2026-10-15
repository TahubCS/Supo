"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, Github, Lock, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  addGitHubSource,
  addSource,
  getGitHubConnection,
  listGitHubRepositories,
  type GitHubConnection,
  type GitHubRepoOption,
} from "./actions";

const labelClass = "text-xs text-[color:var(--text-secondary)]";
const hintClass = "text-xs text-[color:var(--text-tertiary)]";
const primaryButton = "w-full rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90";

function splitPaths(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Public repository by URL; used when the GitHub App isn't configured or connected. */
function PublicRepoForm({ productId, onAdded }: { productId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await addSource(productId, { type: "github", name: name.trim(), url: url.trim() });
        toast.success("Source added — indexing has started");
        onAdded();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add source");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gh-public-name" className={labelClass}>Name</Label>
        <Input id="gh-public-name" placeholder="e.g. Product docs" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gh-public-url" className={labelClass}>Repository URL</Label>
        <Input id="gh-public-url" type="url" placeholder="https://github.com/owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} />
        <p className={hintClass}>Public repositories only: the README and markdown files in docs/, doc/ or guides/.</p>
      </div>
      <Button onClick={submit} disabled={isPending || !name.trim() || !url.trim()} className={primaryButton}>
        {isPending ? "Adding…" : "Add & index"}
      </Button>
    </div>
  );
}

export function GitHubSourceForm({ productId, onAdded }: { productId: string; onAdded: () => void }) {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [repos, setRepos] = useState<GitHubRepoOption[] | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [showPublic, setShowPublic] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GitHubRepoOption | null>(null);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [includePaths, setIncludePaths] = useState("");
  const [excludePaths, setExcludePaths] = useState("");
  const [includeReleases, setIncludeReleases] = useState(true);
  const [includeIssues, setIncludeIssues] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getGitHubConnection(productId);
        if (cancelled) return;
        setConnection(next);
        if (next.installations.length > 0) {
          const result = await listGitHubRepositories(productId);
          if (cancelled) return;
          setRepos(result.repos);
          setLoadErrors(result.errors);
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load GitHub");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (repos ?? []).filter((repo) => !q || repo.fullName.toLowerCase().includes(q)).slice(0, 100);
  }, [repos, query]);

  function choose(repo: GitHubRepoOption) {
    setSelected(repo);
    setName(repo.fullName);
    setBranch("");
  }

  function submit() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await addGitHubSource(productId, {
          installationId: selected.installationId,
          repoId: selected.id,
          name: name.trim(),
          branch: branch.trim() || undefined,
          includePaths: splitPaths(includePaths),
          excludePaths: splitPaths(excludePaths),
          includeReleases,
          includeIssues,
        });
        toast.success(`${selected.fullName} added — indexing has started`);
        onAdded();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add repository");
      }
    });
  }

  if (!connection) return <p className={hintClass}>Loading GitHub…</p>;

  if (!connection.configured || showPublic) {
    return (
      <div className="space-y-3">
        <PublicRepoForm productId={productId} onAdded={onAdded} />
        {connection.configured && (
          <button type="button" className={`${hintClass} underline`} onClick={() => setShowPublic(false)}>
            Back to connected repositories
          </button>
        )}
      </div>
    );
  }

  if (connection.installations.length === 0) {
    return (
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-border bg-[color:var(--card-elevated)] p-4">
          <p className="text-sm font-medium text-foreground">Connect GitHub</p>
          <p className={hintClass}>
            Install the Supo GitHub App on your account or organization and choose which repositories it can read
            (read-only). Private repositories work, and changes are re-indexed when you push.
          </p>
        </div>
        <Button asChild className={primaryButton}>
          <a href={connection.installUrl ?? "#"}>
            <Github className="size-3.5" />
            Connect GitHub
          </a>
        </Button>
        <div className="flex flex-col gap-1">
          <a href={connection.authorizeUrl ?? "#"} className={`${hintClass} underline`}>
            Already installed the app? Link the existing installation
          </a>
          <button type="button" className={`${hintClass} text-left underline`} onClick={() => setShowPublic(true)}>
            Add a public repository by URL instead
          </button>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
          <Input placeholder="Search repositories" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {repos === null && <p className={`${hintClass} p-3`}>Loading repositories…</p>}
          {repos !== null && filtered.length === 0 && (
            <p className={`${hintClass} p-3`}>
              No repositories found. Grant the app access to more repositories on GitHub.
            </p>
          )}
          {filtered.map((repo) => (
            <button
              key={`${repo.installationId}:${repo.id}`}
              type="button"
              disabled={repo.alreadyAdded}
              onClick={() => choose(repo)}
              className="flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-[color:var(--card-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm text-foreground">
                  {repo.fullName}
                  {repo.private && <Lock className="size-3 shrink-0 text-[color:var(--text-tertiary)]" />}
                </p>
                {repo.description && <p className={`${hintClass} truncate`}>{repo.description}</p>}
              </div>
              {repo.alreadyAdded && <span className={hintClass}>Added</span>}
            </button>
          ))}
        </div>
        {loadErrors.map((error) => (
          <p key={error} className="text-xs text-[color:var(--status-error)]">{error}</p>
        ))}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <a href={connection.installUrl ?? "#"} className={`${hintClass} inline-flex items-center gap-1 underline`}>
            Add an account or change repository access <ExternalLink className="size-3" />
          </a>
          <button type="button" className={`${hintClass} underline`} onClick={() => setShowPublic(true)}>
            Public repository by URL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-[color:var(--card-elevated)] px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-foreground">
          <Github className="size-3.5 shrink-0" />
          {selected.fullName}
          {selected.private && <Lock className="size-3 shrink-0 text-[color:var(--text-tertiary)]" />}
        </span>
        <button type="button" className={`${hintClass} underline`} onClick={() => setSelected(null)}>
          Change
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gh-name" className={labelClass}>Name</Label>
        <Input id="gh-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gh-branch" className={labelClass}>Branch</Label>
        <Input id="gh-branch" placeholder={`${selected.defaultBranch} (default)`} value={branch} onChange={(e) => setBranch(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gh-include" className={labelClass}>Only these folders</Label>
          <Input id="gh-include" placeholder="docs, guides" value={includePaths} onChange={(e) => setIncludePaths(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gh-exclude" className={labelClass}>Skip folders</Label>
          <Input id="gh-exclude" placeholder="docs/internal" value={excludePaths} onChange={(e) => setExcludePaths(e.target.value)} />
        </div>
      </div>
      <p className={hintClass}>
        Indexes README, changelog and documentation files (Markdown, MDX, reStructuredText, AsciiDoc) anywhere in the
        repository. Source code, tests and dependencies are skipped.
      </p>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={includeReleases} onCheckedChange={(v) => setIncludeReleases(v === true)} />
          Release notes
        </label>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <Checkbox className="mt-0.5" checked={includeIssues} onCheckedChange={(v) => setIncludeIssues(v === true)} />
          <span>
            Issues
            <span className={`${hintClass} block`}>
              The 200 most recently updated issues, so the assistant knows about known bugs. Only enable this if issue
              content is fine to share with customers.
            </span>
          </span>
        </label>
      </div>

      {selected.private && (
        <p className={hintClass}>
          Private repository: answers can use its content, but customers won&apos;t see links to its files.
        </p>
      )}

      <Button onClick={submit} disabled={isPending || !name.trim()} className={primaryButton}>
        {isPending ? "Adding…" : "Add & index"}
      </Button>
    </div>
  );
}
