import type {
  SupoCustomer,
  SupoEscalationStatus,
  SupoEventHandler,
  SupoEventName,
  SupoInitOptions,
} from "./types";
import { joinUrl, resolveApiBaseUrl } from "./runtime/config";
import { createEmitter } from "./runtime/events";
import { createStorage } from "./runtime/storage";
import { normalizeCustomer } from "./runtime/validation";
import { buildRealtimeTokenUrl, createRealtimeClient, type SupoRealtime, type SupoRealtimeTokenResponse } from "./realtime/ably";
import { buildPollUrl, type SupoPollResponse } from "./realtime/polling";

type HeadlessClientOptions = Pick<SupoInitOptions, "productId" | "apiBaseUrl" | "customer" | "realtime" | "hooks">;

export function createSupoClient(options: HeadlessClientOptions) {
  if (!options.productId) throw new Error("Supo productId is required.");

  const apiBaseUrl = resolveApiBaseUrl(options);
  const storage = createStorage(options.productId);
  const emitter = createEmitter(options.hooks);
  let customer = resolveCustomer(options.customer) ?? storage.getCustomer();
  if (customer) storage.setCustomer(customer);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastSeenAt: string | null = null;
  let ablyClient: SupoRealtime | null = null;
  let ablyConversationId: string | null = null;
  let escalationStatus: SupoEscalationStatus = null;

  function conversation() {
    return storage.getConversation(customer);
  }

  function emitError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    emitter.emit("error", { message });
  }

  function setEscalationStatus(status: SupoEscalationStatus) {
    if (escalationStatus === status) return;
    escalationStatus = status;
    emitter.emit("escalation-change", { status });
  }

  async function pollOnce() {
    const ref = conversation();
    if (!ref.id || !ref.token) return null;
    const response = await fetch(
      buildPollUrl({
        apiBaseUrl,
        productId: options.productId,
        conversationId: ref.id,
        conversationToken: ref.token,
        since: lastSeenAt || new Date(0).toISOString(),
      }),
    );
    if (!response.ok) throw new Error(`Supo polling failed: ${response.status}`);
    const data = (await response.json()) as SupoPollResponse;
    setEscalationStatus(data.escalationStatus);
    for (const message of data.messages) {
      lastSeenAt = message.createdAt;
      emitter.emit("message", {
        id: message.id,
        role: message.senderType === "customer" ? "customer" : message.senderType,
        body: message.body,
        createdAt: message.createdAt,
      });
    }
    return data;
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      pollOnce().catch(() => {});
    }, 4000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function subscribeToConversation(conversationId: string, conversationToken: string) {
    if (options.realtime === "polling" || ablyConversationId === conversationId) {
      startPolling();
      return;
    }

    try {
      const tokenUrl = buildRealtimeTokenUrl({
        apiBaseUrl,
        productId: options.productId,
        conversationId,
        conversationToken,
      });
      const tokenResponse = await fetch(tokenUrl);
      if (!tokenResponse.ok) {
        startPolling();
        return;
      }
      const tokenData = (await tokenResponse.json()) as SupoRealtimeTokenResponse;
      if (!tokenData.channelName) {
        startPolling();
        return;
      }

      ablyClient?.close();
      ablyClient = createRealtimeClient(tokenUrl);
      ablyClient.connection.on("connected", stopPolling);
      ablyClient.connection.on("failed", startPolling);
      ablyClient.connection.on("suspended", startPolling);

      const channel = ablyClient.channels.get(tokenData.channelName);
      await channel.subscribe("message", (msg) => {
        const data = msg.data as { id?: string; body: string; senderType: "agent" | "ai" | "customer"; createdAt?: string };
        if (data.senderType === "agent") {
          setEscalationStatus("active");
          emitter.emit("message", {
            id: data.id,
            role: "agent",
            body: data.body,
            createdAt: data.createdAt,
          });
        }
      });
      await channel.subscribe("escalation_update", (msg) => {
        const data = msg.data as { status?: SupoEscalationStatus };
        setEscalationStatus(data.status === "pending" || data.status === "active" ? data.status : null);
      });
      ablyConversationId = conversationId;
    } catch (error) {
      emitError(error);
      startPolling();
    }
  }

  async function sendMessage(body: string): Promise<string> {
    if (!customer) throw new Error("Supo customer is required before sending messages.");
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Message cannot be empty.");
    const ref = conversation();
    const response = await fetch(joinUrl(apiBaseUrl, "/api/widget/messages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: options.productId,
        message: trimmed,
        conversationId: ref.id || undefined,
        conversationToken: ref.token || undefined,
        customer,
      }),
    });
    if (!response.ok) throw new Error(`Supo message failed: ${response.status}`);
    const nextConversationId = response.headers.get("x-conversation-id");
    const nextConversationToken = response.headers.get("x-conversation-token");
    if (nextConversationId && nextConversationToken) {
      storage.setConversation(customer, nextConversationId, nextConversationToken);
      void subscribeToConversation(nextConversationId, nextConversationToken);
    }
    const headerStatus = response.headers.get("x-escalation-status");
    if (headerStatus === "pending" || headerStatus === "active") {
      setEscalationStatus(headerStatus);
      return response.text();
    }

    const reader = response.body?.getReader();
    if (!reader) return response.text();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      text += decoder.decode(result.value, { stream: true });
    }
    void pollOnce().catch(() => {});
    return text;
  }

  async function escalate() {
    if (!customer) throw new Error("Supo customer is required before escalating.");
    const ref = conversation();
    if (!ref.id || !ref.token) throw new Error("A conversation is required before escalating.");
    const response = await fetch(joinUrl(apiBaseUrl, "/api/widget/escalations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: options.productId,
        conversationId: ref.id,
        conversationToken: ref.token,
        customer,
      }),
    });
    if (!response.ok) throw new Error(`Supo escalation failed: ${response.status}`);
    const data = (await response.json()) as { escalationStatus?: SupoEscalationStatus };
    setEscalationStatus(data.escalationStatus === "pending" || data.escalationStatus === "active" ? data.escalationStatus : null);
    startPolling();
    return data;
  }

  function identify(nextCustomer: SupoCustomer): boolean {
    const normalized = normalizeCustomer(nextCustomer);
    if (!normalized) return false;
    customer = normalized;
    storage.setCustomer(normalized);
    void pollOnce().catch(() => {});
    return true;
  }

  function reset() {
    stopPolling();
    ablyClient?.close();
    ablyClient = null;
    ablyConversationId = null;
    lastSeenAt = null;
    escalationStatus = null;
    customer = null;
    storage.clear();
  }

  return {
    sendMessage,
    escalate,
    identify,
    reset,
    pollOnce,
    startPolling,
    stopPolling,
    getCustomer: () => customer,
    getConversation: conversation,
    getEscalationStatus: () => escalationStatus,
    on: <EventName extends SupoEventName>(event: EventName, handler: SupoEventHandler<EventName>) =>
      emitter.on(event, handler),
    destroy() {
      reset();
      emitter.clear();
    },
  };
}

function resolveCustomer(customer: HeadlessClientOptions["customer"]): SupoCustomer | null {
  if (typeof customer === "function") {
    try {
      return normalizeCustomer(customer());
    } catch {
      return null;
    }
  }
  return normalizeCustomer(customer);
}

export type SupoHeadlessClient = ReturnType<typeof createSupoClient>;
export type {
  SupoAppearance,
  SupoCustomer,
  SupoEscalationStatus,
  SupoEventHandler,
  SupoEventName,
  SupoInitOptions,
  SupoMessage,
  SupoRuntime,
  SupoState,
} from "./types";
