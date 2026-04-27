"use client";

import * as Ably from "ably";

export function createAgentAuthCallback(productId: string): NonNullable<Ably.AuthOptions["authCallback"]> {
  return async (_tokenParams, callback) => {
    try {
      const url = new URL("/api/ably/token", window.location.origin);
      url.searchParams.set("productId", productId);

      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        callback(`Ably token request failed with status ${response.status}`, null);
        return;
      }

      const tokenRequest = (await response.json()) as Ably.TokenRequest;
      callback(null, tokenRequest);
    } catch (error) {
      callback(error instanceof Error ? error.message : "Ably token request failed", null);
    }
  };
}

export function closeAblyClient(client: Ably.Realtime) {
  try {
    void Promise.resolve(client.close()).catch(() => {});
  } catch {
    // Closing during Fast Refresh can race with channel attach; ignore.
  }
}

export function ignoreExpectedAblyTeardown(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("connection closed")) return;
}
