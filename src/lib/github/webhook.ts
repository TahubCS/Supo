import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { githubInstallation, knowledgeSource } from "@/db/schema";
import { queueSourceIndexing, queueSourceSync } from "@/lib/jobs";

// Applies GitHub App webhook events to connected knowledge sources: content
// changes queue a sync (only changed files are re-embedded), and lost access
// takes the source out of retrieval until access is restored.

type Repo = { id: number; full_name: string; private: boolean; default_branch?: string };

export type GitHubWebhookPayload = {
  action?: string;
  installation?: { id: number; suspended_at?: string | null };
  repository?: Repo;
  repositories_added?: { id: number }[];
  repositories_removed?: { id: number }[];
  ref?: string;
};

type AppSource = typeof knowledgeSource.$inferSelect;

const RELEASE_ACTIONS = new Set(["published", "edited", "deleted", "unpublished", "released"]);
const ISSUE_ACTIONS = new Set(["opened", "edited", "closed", "reopened", "deleted", "labeled", "unlabeled", "transferred"]);

async function sourcesFor(installationId: number, repoIds?: number[]): Promise<AppSource[]> {
  if (repoIds && repoIds.length === 0) return [];
  return db.query.knowledgeSource.findMany({
    where: and(
      eq(knowledgeSource.githubInstallationId, installationId),
      repoIds ? inArray(knowledgeSource.githubRepoId, repoIds) : undefined,
    ),
  });
}

/** Takes sources out of retrieval; the bumped revision stops in-flight indexing from undoing it. */
async function markUnavailable(sources: AppSource[], message: string) {
  if (sources.length === 0) return;
  await db
    .update(knowledgeSource)
    .set({
      status: "error",
      errorMessage: message,
      indexingStartedAt: null,
      revision: sql`${knowledgeSource.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(inArray(knowledgeSource.id, sources.map((s) => s.id)));
}

async function reindex(sources: AppSource[]) {
  for (const source of sources) {
    await db
      .update(knowledgeSource)
      .set({
        status: "indexing",
        indexingStartedAt: new Date(),
        errorMessage: null,
        revision: sql`${knowledgeSource.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSource.id, source.id));
    await queueSourceIndexing(source.id);
  }
}

async function sync(sources: AppSource[]) {
  for (const source of sources) {
    if (source.status === "error" && !source.chunkCount) {
      await reindex([source]);
    } else {
      await queueSourceSync(source.id);
    }
  }
}

export async function handleGitHubWebhook(event: string, payload: GitHubWebhookPayload): Promise<string> {
  const installationId = payload.installation?.id;
  if (!installationId) return "ignored";
  const repo = payload.repository;

  switch (event) {
    case "installation": {
      if (payload.action === "deleted") {
        await markUnavailable(
          await sourcesFor(installationId),
          "GitHub access was removed (the GitHub App was uninstalled). Connect GitHub again and re-add this repository.",
        );
        await db.delete(githubInstallation).where(eq(githubInstallation.installationId, installationId));
        return "uninstalled";
      }
      if (payload.action === "suspend") {
        await db
          .update(githubInstallation)
          .set({ suspendedAt: new Date(), updatedAt: new Date() })
          .where(eq(githubInstallation.installationId, installationId));
        await markUnavailable(
          await sourcesFor(installationId),
          "The GitHub App installation is suspended. Unsuspend it on GitHub to restore this source.",
        );
        return "suspended";
      }
      if (payload.action === "unsuspend") {
        await db
          .update(githubInstallation)
          .set({ suspendedAt: null, updatedAt: new Date() })
          .where(eq(githubInstallation.installationId, installationId));
        await reindex(await sourcesFor(installationId));
        return "unsuspended";
      }
      return "ignored";
    }

    case "installation_repositories": {
      const removed = (payload.repositories_removed ?? []).map((r) => r.id);
      const added = (payload.repositories_added ?? []).map((r) => r.id);
      await markUnavailable(
        await sourcesFor(installationId, removed),
        "Supo no longer has access to this repository. Grant access again in the GitHub App settings.",
      );
      await reindex((await sourcesFor(installationId, added)).filter((s) => s.status === "error"));
      return "repositories";
    }

    case "push": {
      if (!repo || !payload.ref?.startsWith("refs/heads/")) return "ignored";
      const pushed = payload.ref.slice("refs/heads/".length);
      const sources = (await sourcesFor(installationId, [repo.id])).filter(
        (s) => (s.settings?.github?.branch || repo.default_branch) === pushed,
      );
      await sync(sources);
      return sources.length > 0 ? "queued" : "ignored";
    }

    case "release": {
      if (!repo || !RELEASE_ACTIONS.has(payload.action ?? "")) return "ignored";
      const sources = (await sourcesFor(installationId, [repo.id])).filter((s) => s.settings?.github?.includeReleases);
      await sync(sources);
      return sources.length > 0 ? "queued" : "ignored";
    }

    case "issues": {
      if (!repo || !ISSUE_ACTIONS.has(payload.action ?? "")) return "ignored";
      const sources = (await sourcesFor(installationId, [repo.id])).filter((s) => s.settings?.github?.includeIssues);
      await sync(sources);
      return sources.length > 0 ? "queued" : "ignored";
    }

    case "repository": {
      if (!repo) return "ignored";
      const sources = await sourcesFor(installationId, [repo.id]);
      if (sources.length === 0) return "ignored";
      if (payload.action === "deleted") {
        await markUnavailable(sources, "The GitHub repository was deleted.");
        return "deleted";
      }
      if (["renamed", "transferred", "privatized", "publicized"].includes(payload.action ?? "")) {
        const url = `https://github.com/${repo.full_name}`;
        for (const source of sources) {
          const github = source.settings?.github;
          if (!github) continue;
          await db
            .update(knowledgeSource)
            .set({
              url,
              settings: { ...source.settings, github: { ...github, fullName: repo.full_name, private: repo.private } },
              updatedAt: new Date(),
            })
            .where(eq(knowledgeSource.id, source.id));
        }
        // Visibility decides whether customers see links to the files.
        if (payload.action === "privatized" || payload.action === "publicized") await sync(sources);
        return "updated";
      }
      return "ignored";
    }

    default:
      return "ignored";
  }
}
