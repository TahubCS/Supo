import { createHmac, createSign, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

// GitHub App client: app JWTs, cached installation tokens, the OAuth step used
// to verify who installed the app, and the REST calls the knowledge base needs.

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type GitHubAccount = { login: string; type: string; avatarUrl: string | null };

export type GitHubInstallationInfo = {
  id: number;
  account: GitHubAccount;
  repositorySelection: string | null;
  suspendedAt: string | null;
};

export type GitHubRepository = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  archived: boolean;
};

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    env.GITHUB_APP_ID &&
      env.GITHUB_APP_SLUG &&
      env.GITHUB_APP_CLIENT_ID &&
      env.GITHUB_APP_CLIENT_SECRET &&
      env.GITHUB_APP_PRIVATE_KEY,
  );
}

function requireConfig() {
  if (!isGitHubAppConfigured()) throw new Error("The GitHub App is not configured on this server");
  return {
    appId: env.GITHUB_APP_ID!,
    slug: env.GITHUB_APP_SLUG!,
    clientId: env.GITHUB_APP_CLIENT_ID!,
    clientSecret: env.GITHUB_APP_CLIENT_SECRET!,
    privateKey: env.GITHUB_APP_PRIVATE_KEY!,
  };
}

export function githubCallbackUrl(): string {
  return new URL("/api/integrations/github/callback", env.BETTER_AUTH_URL).toString();
}

/** Installs the app (or opens its settings when already installed on the account). */
export function githubInstallUrl(state: string): string {
  const { slug } = requireConfig();
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
}

/** Authorizes the user only, to link installations that already exist. */
export function githubAuthorizeUrl(state: string): string {
  const { clientId } = requireConfig();
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: githubCallbackUrl(), state });
  return `https://github.com/login/oauth/authorize?${params}`;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function createAppJwt(appId: string, privateKey: string, nowMs = Date.now()): string {
  // Backdated to absorb clock drift; GitHub caps the lifetime at 10 minutes.
  const iat = Math.floor(nowMs / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat, exp: iat + 9 * 60, iss: appId }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

type RequestOptions = {
  token: string;
  scheme?: "Bearer" | "token";
  method?: "GET" | "POST";
  body?: unknown;
};

async function githubRequest<T>(pathOrUrl: string, { token, scheme = "Bearer", method = "GET", body }: RequestOptions) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GITHUB_API}${pathOrUrl}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `${scheme} ${token}`,
      "User-Agent": "Supo",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = ((await response.json()) as { message?: string }).message ?? "";
    } catch {
      // non-JSON error body
    }
    throw new GitHubApiError(`GitHub API ${response.status}${detail ? `: ${detail}` : ""}`, response.status);
  }
  return { data: (await response.json()) as T, link: response.headers.get("link") };
}

function nextPageUrl(link: string | null): string | null {
  if (!link) return null;
  const match = link.split(",").find((part) => /rel="next"/.test(part))?.match(/<([^>]+)>/);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Installation tokens (valid for 1 hour; cached per server instance)
// ---------------------------------------------------------------------------

const tokenCache = new Map<number, { token: string; expiresAt: number }>();

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached.token;

  const { appId, privateKey } = requireConfig();
  const { data } = await githubRequest<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    { token: createAppJwt(appId, privateKey), method: "POST" },
  );
  tokenCache.set(installationId, { token: data.token, expiresAt: Date.parse(data.expires_at) });
  return data.token;
}

/** GET with an installation token. */
export async function installationRequest<T>(installationId: number, pathOrUrl: string) {
  const token = await getInstallationToken(installationId);
  return githubRequest<T>(pathOrUrl, { token });
}

// ---------------------------------------------------------------------------
// Installation verification (OAuth user-to-server token)
// ---------------------------------------------------------------------------

export async function exchangeOAuthCode(code: string): Promise<string> {
  const { clientId, clientSecret } = requireConfig();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Supo" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: githubCallbackUrl(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "GitHub authorization failed");
  }
  return data.access_token;
}

type RawInstallation = {
  id: number;
  account: { login: string; type: string; avatar_url?: string } | null;
  repository_selection?: string;
  suspended_at?: string | null;
};

function toInstallation(raw: RawInstallation): GitHubInstallationInfo {
  return {
    id: raw.id,
    account: {
      login: raw.account?.login ?? "unknown",
      type: raw.account?.type ?? "User",
      avatarUrl: raw.account?.avatar_url ?? null,
    },
    repositorySelection: raw.repository_selection ?? null,
    suspendedAt: raw.suspended_at ?? null,
  };
}

/** Installations of this app the signed-in GitHub user can access. */
export async function listUserInstallations(userToken: string): Promise<GitHubInstallationInfo[]> {
  const installations: GitHubInstallationInfo[] = [];
  let url: string | null = "/user/installations?per_page=100";
  for (let page = 0; url && page < 5; page++) {
    const result: { data: { installations: RawInstallation[] }; link: string | null } = await githubRequest(url, {
      token: userToken,
    });
    installations.push(...result.data.installations.map(toInstallation));
    url = nextPageUrl(result.link);
  }
  return installations;
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

type RawRepository = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  html_url: string;
  archived?: boolean;
};

function toRepository(raw: RawRepository): GitHubRepository {
  return {
    id: raw.id,
    fullName: raw.full_name,
    private: raw.private,
    defaultBranch: raw.default_branch,
    description: raw.description,
    htmlUrl: raw.html_url,
    archived: Boolean(raw.archived),
  };
}

export const MAX_LISTED_REPOSITORIES = 1000;

export async function listInstallationRepositories(installationId: number): Promise<GitHubRepository[]> {
  const repos: GitHubRepository[] = [];
  let url: string | null = "/installation/repositories?per_page=100";
  while (url && repos.length < MAX_LISTED_REPOSITORIES) {
    const result: { data: { repositories: RawRepository[] }; link: string | null } = await installationRequest(
      installationId,
      url,
    );
    repos.push(...result.data.repositories.map(toRepository));
    url = nextPageUrl(result.link);
  }
  return repos;
}

/** Fails with a 404 when the installation cannot access the repository. */
export async function getRepository(installationId: number, repoId: number): Promise<GitHubRepository> {
  const { data } = await installationRequest<RawRepository>(installationId, `/repositories/${repoId}`);
  return toRepository(data);
}

// ---------------------------------------------------------------------------
// Webhook signatures
// ---------------------------------------------------------------------------

export function verifyWebhookSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`);
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
