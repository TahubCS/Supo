import { type NextRequest, NextResponse } from "next/server";

import { recordProductAudit } from "@/lib/audit";
import { exchangeOAuthCode, isGitHubAppConfigured, listUserInstallations } from "@/lib/github/app";
import { linkInstallations } from "@/lib/github/installations";
import { verifyConnectState } from "@/lib/github/state";
import { getProductAccess, canAccessProductCapability } from "@/lib/product-access";

export const dynamic = "force-dynamic";

// GitHub redirects here after the app is installed (with "Request user
// authorization during installation" enabled) or after an authorize-only
// round trip. The installation is linked only if the signed-in GitHub user
// can access it, so an installation ID in the URL can't be forged.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const redirect = (path: string) => NextResponse.redirect(new URL(path, req.url));

  const state = params.get("state");
  // Changes made from GitHub's settings page come back without our state.
  if (!state) return redirect("/dashboard");

  const parsed = verifyConnectState(state);
  if (!parsed) return redirect("/dashboard?github=expired");

  const knowledgePath = `/products/${encodeURIComponent(parsed.productId)}/knowledge`;
  const fail = (reason: string) => redirect(`${knowledgePath}?github=${reason}`);

  if (!isGitHubAppConfigured()) return fail("not-configured");

  const access = await getProductAccess(parsed.productId);
  if (!access || access.session.user.id !== parsed.userId || !canAccessProductCapability(access.role, "knowledge")) {
    return redirect("/dashboard?github=forbidden");
  }

  if (params.get("error") === "access_denied") return fail("cancelled");
  const code = params.get("code");
  if (!code) return fail("unauthorized");

  try {
    const userToken = await exchangeOAuthCode(code);
    const accessible = await listUserInstallations(userToken);
    const requested = Number(params.get("installation_id"));
    const toLink = requested ? accessible.filter((installation) => installation.id === requested) : accessible;
    if (toLink.length === 0) return fail(requested ? "unauthorized" : "no-installations");

    await linkInstallations(access.product.organizationId, access.session.user.id, toLink);
    await recordProductAudit({
      productId: parsed.productId,
      actor: { id: access.session.user.id, name: access.session.user.name },
      action: "knowledge.github_connected",
      targetType: "github_installation",
      targetId: toLink.map((installation) => installation.id).join(","),
      metadata: { accounts: toLink.map((installation) => installation.account.login) },
    });
  } catch (error) {
    console.error("[github] connect callback failed", error);
    return fail("error");
  }

  return redirect(`${knowledgePath}?github=connected`);
}
