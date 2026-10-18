import { type NextRequest, NextResponse } from "next/server";

import { saveAtlassianConnection } from "@/lib/atlassian/connection";
import { exchangeAtlassianCode, isAtlassianConfigured, listAccessibleSites } from "@/lib/atlassian/oauth";
import { recordProductAudit } from "@/lib/audit";
import { verifyConnectState } from "@/lib/connect-state";
import { getProductAccess, canAccessProductCapability } from "@/lib/product-access";

export const dynamic = "force-dynamic";

// Atlassian redirects here after the user grants (or declines) read access to
// Confluence. The grant is stored for the workspace of the product that
// started the round trip, and only if it can read pages on at least one site.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const redirect = (path: string) => NextResponse.redirect(new URL(path, req.url));

  const state = params.get("state");
  if (!state) return redirect("/dashboard");

  const parsed = verifyConnectState("atlassian", state);
  if (!parsed) return redirect("/dashboard?atlassian=expired");

  const knowledgePath = `/products/${encodeURIComponent(parsed.productId)}/knowledge`;
  const fail = (reason: string) => redirect(`${knowledgePath}?atlassian=${reason}`);

  if (!isAtlassianConfigured()) return fail("not-configured");

  const access = await getProductAccess(parsed.productId);
  if (!access || access.session.user.id !== parsed.userId || !canAccessProductCapability(access.role, "knowledge")) {
    return redirect("/dashboard?atlassian=forbidden");
  }

  if (params.get("error") === "access_denied") return fail("cancelled");
  const code = params.get("code");
  if (!code) return fail("error");

  try {
    const tokens = await exchangeAtlassianCode(code);
    const sites = await listAccessibleSites(tokens.accessToken);
    if (sites.length === 0) return fail("no-sites");

    const connection = await saveAtlassianConnection(access.product.organizationId, access.session.user.id, tokens);
    await recordProductAudit({
      productId: parsed.productId,
      actor: { id: access.session.user.id, name: access.session.user.name },
      action: "knowledge.atlassian_connected",
      targetType: "atlassian_connection",
      targetId: connection.id,
      metadata: { sites: sites.map((site) => site.url) },
    });
  } catch (error) {
    console.error("[atlassian] connect callback failed", error);
    return fail("error");
  }

  return redirect(`${knowledgePath}?atlassian=connected`);
}
