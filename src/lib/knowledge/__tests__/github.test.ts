import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanMarkdown, selectDocFiles, type TreeEntry } from "@/lib/knowledge/github";

const blob = (path: string, size = 100): TreeEntry => ({ path, type: "blob", sha: `sha-${path}`, size });

describe("selectDocFiles", () => {
  const tree: TreeEntry[] = [
    { path: "docs", type: "tree", sha: "t1" },
    blob("src/index.ts"),
    blob("src/components/README.md"),
    blob("docs/billing/refunds.md"),
    blob("docs/getting-started.mdx"),
    blob("docs/notes.txt"),
    blob("requirements.txt"),
    blob("README.md"),
    blob("CHANGELOG"),
    blob("LICENSE.md"),
    blob("CONTRIBUTING.md"),
    blob("node_modules/pkg/README.md"),
    blob("packages/api/tests/fixtures.md"),
    blob(".github/ISSUE_TEMPLATE/bug.md"),
    blob("docs/huge.md", 10 * 1024 * 1024),
    blob("docs/internal/runbook.md"),
  ];

  it("keeps documentation, skips code, dependencies, tests and repo plumbing, and ranks README first", () => {
    const { files } = selectDocFiles(tree);
    expect(files.map((f) => f.path)).toEqual([
      "README.md",
      "CHANGELOG",
      "docs/getting-started.mdx",
      "docs/notes.txt",
      "docs/billing/refunds.md",
      "docs/internal/runbook.md",
      "src/components/README.md",
    ]);
  });

  it("applies include and exclude path prefixes", () => {
    const { files } = selectDocFiles(tree, { includePaths: ["/docs/"], excludePaths: ["docs/internal"] });
    expect(files.map((f) => f.path)).toEqual(["docs/getting-started.mdx", "docs/notes.txt", "docs/billing/refunds.md"]);
  });

  it("does not treat a prefix as matching a sibling with the same start", () => {
    const { files } = selectDocFiles([blob("docs/a.md"), blob("docs-old/b.md")], { includePaths: ["docs"] });
    expect(files.map((f) => f.path)).toEqual(["docs/a.md"]);
  });

  it("caps the number of files and reports how many were skipped", () => {
    const many = Array.from({ length: 10 }, (_, i) => blob(`docs/page-${i}.md`));
    const { files, skipped } = selectDocFiles(many, { maxFiles: 4 });
    expect(files).toHaveLength(4);
    expect(skipped).toBe(6);
  });
});

describe("cleanMarkdown", () => {
  it("strips front matter and uses its title", () => {
    const result = cleanMarkdown('---\ntitle: "Refund policy"\nslug: refunds\n---\n\nRefunds take 5 days.', "docs/refunds.md");
    expect(result).toEqual({ title: "Refund policy", text: "Refunds take 5 days." });
  });

  it("falls back to the first heading and drops MDX imports", () => {
    const result = cleanMarkdown('import Tabs from "@theme/Tabs";\n\n# Install\n\nRun the installer.', "docs/install.mdx");
    expect(result.title).toBe("Install");
    expect(result.text).toBe("# Install\n\nRun the installer.");
  });
});

describe("loadGitHubAppDocuments", () => {
  async function load(repoPrivate: boolean) {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("GITHUB_APP_ID", "1");
    vi.stubEnv("GITHUB_APP_SLUG", "supo-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());

    const b64 = (text: string) => Buffer.from(text).toString("base64");
    const routes: Record<string, unknown> = {
      [`/app/installations/${repoPrivate ? 7 : 8}/access_tokens`]: { token: "inst-token", expires_at: new Date(Date.now() + 3600_000).toISOString() },
      "/repositories/42": {
        id: 42,
        full_name: "acme/docs",
        private: repoPrivate,
        default_branch: "main",
        description: null,
        html_url: "https://github.com/acme/docs",
      },
      "/repos/acme/docs/branches/main": { commit: { sha: "c0ffee" } },
      "/repos/acme/docs/git/trees/c0ffee?recursive=1": {
        truncated: false,
        tree: [
          { path: "README.md", type: "blob", sha: "s1", size: 20 },
          { path: "src/app.ts", type: "blob", sha: "s2", size: 20 },
          { path: "docs/refunds.md", type: "blob", sha: "s3", size: 20 },
        ],
      },
      "/repos/acme/docs/git/blobs/s1": { encoding: "base64", content: b64("# Acme\n\nAcme syncs files.") },
      "/repos/acme/docs/git/blobs/s3": { encoding: "base64", content: b64("---\ntitle: Refunds\n---\nRefunds take 5 days.") },
      "/repos/acme/docs/releases?per_page=30": [
        { name: "v2.0", tag_name: "v2.0", body: "Adds SSO.", html_url: "https://github.com/acme/docs/releases/v2.0", draft: false, prerelease: false, published_at: "2026-09-01T00:00:00Z" },
        { name: "v2.1", tag_name: "v2.1", body: "Draft", html_url: "x", draft: true, prerelease: false, published_at: null },
      ],
    };
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const path = input.replace("https://api.github.com", "");
      requested.push(path);
      if (!(path in routes)) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      if (!path.includes("access_tokens")) expect(new Headers(init?.headers).get("authorization")).toBe("Bearer inst-token");
      return new Response(JSON.stringify(routes[path]), { status: 200 });
    });

    const { loadGitHubAppDocuments } = await import("@/lib/knowledge/github");
    const result = await loadGitHubAppDocuments(repoPrivate ? 7 : 8, 42, {
      fullName: "acme/docs",
      private: repoPrivate,
      branch: null,
      includePaths: [],
      excludePaths: [],
      includeReleases: true,
      includeIssues: false,
    });
    return { result, requested };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("indexes docs and releases at the branch head, never source code", async () => {
    const { result, requested } = await load(false);
    expect(result.commitSha).toBe("c0ffee");
    expect(result.docs.map((d) => d.title)).toEqual(["Acme", "Refunds", "Release v2.0"]);
    expect(result.docs[1]).toMatchObject({
      url: "https://github.com/acme/docs/blob/main/docs/refunds.md",
      text: "Refunds take 5 days.",
      version: "blob:s3:docs/refunds.md",
    });
    expect(result.docs[2].text).toContain("Adds SSO.");
    expect(requested.some((path) => path.includes("blobs/s2"))).toBe(false);
  });

  it("never links customers to files in a private repository", async () => {
    const { result } = await load(true);
    expect(result.docs.length).toBe(3);
    expect(result.docs.every((d) => d.url === null)).toBe(true);
  });
});
