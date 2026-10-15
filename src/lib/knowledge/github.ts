import type { GitHubSourceSettings } from "@/db/schema";
import { getRepository, installationRequest } from "@/lib/github/app";

// Loads a repository connected through the GitHub App: documentation files from
// the git tree (any depth, private repositories included), release notes and,
// optionally, issues.

export type GitHubDocument = { title: string | null; url: string | null; text: string; version?: string };

export type GitHubLoadResult = {
  docs: GitHubDocument[];
  failedPages: number;
  totalPages: number;
  commitSha: string;
  warnings: string[];
};

export type TreeEntry = { path: string; type: string; sha: string; size?: number };

export const GITHUB_APP_MAX_FILES = 400;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_RELEASES = 30;
const MAX_ISSUES = 200;
const MAX_ISSUE_CHARS = 20_000;
const FETCH_CONCURRENCY = 6;

const DOC_EXTENSIONS = /\.(md|mdx|markdown|rst|adoc)$/i;
// Root files worth indexing even without a doc extension (README, CHANGELOG …).
const ROOT_DOC_NAMES = /^(readme|changelog|changes|history|faq|support|security|upgrading|migration)(\.[a-z]+)?$/i;
const DOC_DIRS = new Set(["docs", "doc", "documentation", "guides", "guide", "help", "manual", "wiki", "handbook"]);
// Build output, dependencies, tests and repository plumbing rarely help customers.
const SKIPPED_DIRS = new Set([
  "node_modules",
  "vendor",
  "third_party",
  "third-party",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  ".next",
  ".git",
  ".github",
  ".changeset",
  "__tests__",
  "__snapshots__",
  "__fixtures__",
  "fixtures",
  "test",
  "tests",
]);
const SKIPPED_FILES =
  /^(license|licence|copying|notice|code_of_conduct|contributing|codeowners|pull_request_template|issue_template)(\.[a-z]+)?$/i;

export function normalizePathPrefixes(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim().replace(/^\.?\/+/, "").replace(/\/+$/, "")).filter(Boolean);
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function priority(path: string): number {
  const segments = path.split("/");
  const name = segments[segments.length - 1];
  if (segments.length === 1 && /^readme/i.test(name)) return 0;
  if (segments.length === 1 && ROOT_DOC_NAMES.test(name)) return 1;
  if (segments.slice(0, -1).some((s) => DOC_DIRS.has(s.toLowerCase()))) return 2;
  return 3;
}

/** Picks the documentation files to index from a recursive git tree, most useful first. */
export function selectDocFiles(
  tree: TreeEntry[],
  options: { includePaths?: string[]; excludePaths?: string[]; maxFiles?: number } = {},
): { files: TreeEntry[]; skipped: number } {
  const include = normalizePathPrefixes(options.includePaths);
  const exclude = normalizePathPrefixes(options.excludePaths);
  const maxFiles = options.maxFiles ?? GITHUB_APP_MAX_FILES;

  const candidates = tree.filter((entry) => {
    if (entry.type !== "blob") return false;
    if (entry.size !== undefined && entry.size > MAX_FILE_BYTES) return false;
    const segments = entry.path.split("/");
    const name = segments[segments.length - 1];
    const dirs = segments.slice(0, -1).map((s) => s.toLowerCase());
    if (dirs.some((dir) => SKIPPED_DIRS.has(dir))) return false;
    if (SKIPPED_FILES.test(name)) return false;
    const isDoc =
      DOC_EXTENSIONS.test(name) ||
      (segments.length === 1 && ROOT_DOC_NAMES.test(name)) ||
      (/\.txt$/i.test(name) && dirs.some((dir) => DOC_DIRS.has(dir)));
    if (!isDoc) return false;
    if (include.length > 0 && !include.some((prefix) => matchesPrefix(entry.path, prefix))) return false;
    if (exclude.some((prefix) => matchesPrefix(entry.path, prefix))) return false;
    return true;
  });

  candidates.sort(
    (a, b) =>
      priority(a.path) - priority(b.path) ||
      a.path.split("/").length - b.path.split("/").length ||
      a.path.localeCompare(b.path),
  );
  return { files: candidates.slice(0, maxFiles), skipped: Math.max(0, candidates.length - maxFiles) };
}

/** Strips front matter (keeping its title) and MDX import/export lines. */
export function cleanMarkdown(source: string, path: string): { title: string | null; text: string } {
  let text = source.replace(/^﻿/, "").replace(/\u0000/g, "");
  let title: string | null = null;

  const frontMatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontMatter) {
    title = frontMatter[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() || null;
    text = text.slice(frontMatter[0].length);
  }
  if (/\.mdx$/i.test(path)) {
    text = text.replace(/^(import|export)\s.*$/gm, "");
  }
  title ??= text.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() || null;
  return { title, text: text.trim() };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

type RawRelease = {
  name: string | null;
  tag_name: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};

type RawIssue = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  state_reason?: string | null;
  html_url: string;
  labels: (string | { name?: string })[];
  pull_request?: unknown;
};

export async function loadGitHubAppDocuments(
  installationId: number,
  repoId: number,
  settings: GitHubSourceSettings,
): Promise<GitHubLoadResult> {
  const repo = await getRepository(installationId, repoId);
  const base = `/repos/${repo.fullName}`;
  const branch = settings.branch || repo.defaultBranch;
  // Citations are shown to customers; links into a private repository would 404 for them.
  const link = (url: string) => (repo.private ? null : url);
  const warnings: string[] = [];

  const { data: branchInfo } = await installationRequest<{ commit: { sha: string } }>(
    installationId,
    `${base}/branches/${encodeURIComponent(branch)}`,
  );
  const commitSha = branchInfo.commit.sha;

  const { data: tree } = await installationRequest<{ tree: TreeEntry[]; truncated: boolean }>(
    installationId,
    `${base}/git/trees/${commitSha}?recursive=1`,
  );
  if (tree.truncated) warnings.push("the repository is very large, so only part of its file list was read");

  const { files, skipped } = selectDocFiles(tree.tree, settings);
  if (skipped > 0) warnings.push(`${skipped} more documentation files were skipped (limit ${GITHUB_APP_MAX_FILES})`);

  let failed = 0;
  const fileDocs = await mapLimit(files, FETCH_CONCURRENCY, async (file): Promise<GitHubDocument | null> => {
    try {
      const { data } = await installationRequest<{ content: string; encoding: string }>(
        installationId,
        `${base}/git/blobs/${file.sha}`,
      );
      const raw = data.encoding === "base64" ? Buffer.from(data.content, "base64").toString("utf8") : data.content;
      const { title, text } = cleanMarkdown(raw, file.path);
      if (!text) return null;
      return {
        title: title ?? file.path,
        url: link(`${repo.htmlUrl}/blob/${encodePath(branch)}/${encodePath(file.path)}`),
        text,
        version: `blob:${file.sha}:${file.path}`,
      };
    } catch {
      failed++;
      return null;
    }
  });
  const docs = fileDocs.filter((doc): doc is GitHubDocument => doc !== null);

  if (settings.includeReleases) {
    try {
      const { data: releases } = await installationRequest<RawRelease[]>(
        installationId,
        `${base}/releases?per_page=${MAX_RELEASES}`,
      );
      for (const release of releases) {
        if (release.draft || !release.body?.trim()) continue;
        const name = release.name?.trim() || release.tag_name;
        const date = release.published_at ? release.published_at.slice(0, 10) : null;
        docs.push({
          title: `Release ${name}`,
          url: link(release.html_url),
          text: [
            `# Release ${name}`,
            [`Version ${release.tag_name}`, date && `released ${date}`, release.prerelease && "pre-release"]
              .filter(Boolean)
              .join(" · "),
            release.body.trim(),
          ].join("\n\n"),
        });
      }
    } catch (error) {
      warnings.push(`release notes could not be read (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (settings.includeIssues) {
    try {
      let count = 0;
      for (let page = 1; page <= 2 && count < MAX_ISSUES; page++) {
        const { data: issues } = await installationRequest<RawIssue[]>(
          installationId,
          `${base}/issues?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
        );
        for (const issue of issues) {
          if (issue.pull_request || count >= MAX_ISSUES) continue;
          count++;
          const labels = issue.labels
            .map((label) => (typeof label === "string" ? label : label.name))
            .filter(Boolean)
            .join(", ");
          const state = issue.state_reason ? `${issue.state} (${issue.state_reason.replace(/_/g, " ")})` : issue.state;
          docs.push({
            title: `Issue #${issue.number}: ${issue.title}`,
            url: link(issue.html_url),
            text: [
              `# ${issue.title}`,
              [`Issue #${issue.number}`, `status: ${state}`, labels && `labels: ${labels}`].filter(Boolean).join(" · "),
              (issue.body ?? "").trim().slice(0, MAX_ISSUE_CHARS),
            ]
              .filter(Boolean)
              .join("\n\n"),
          });
        }
        if (issues.length < 100) break;
      }
    } catch (error) {
      warnings.push(`issues could not be read (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return { docs, failedPages: failed, totalPages: files.length, commitSha, warnings };
}
