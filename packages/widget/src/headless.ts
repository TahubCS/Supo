import type {
  SupoAgentAvailability,
  SupoCustomer,
  SupoEscalationStatus,
  SupoEventHandler,
  SupoEventName,
  SupoInitOptions,
  SupoMessage,
  SupoSendResult,
  SupoSource,
} from "./types";
import { joinUrl, resolveApiBaseUrl } from "./runtime/config";
import { createEmitter } from "./runtime/events";
import { createStorage } from "./runtime/storage";
import { normalizeCustomer } from "./runtime/validation";
import { buildRealtimeTokenUrl, createRealtimeClient, type SupoRealtime, type SupoRealtimeTokenResponse } from "./realtime/ably";
import { buildPollUrl, type SupoPollResponse } from "./realtime/polling";

type HeadlessClientOptions = Pick<SupoInitOptions, "productId" | "apiBaseUrl" | "customer" | "realtime" | "hooks">;

type MessageRole = SupoMessage["role"];

const ROLES: readonly MessageRole[] = ["customer", "ai", "agent", "system"];

function toRole(senderType: unknown): MessageRole | null {
  return ROLES.includes(senderType as MessageRole) ? (senderType as MessageRole) : null;
}

function parseSources(header: string | null): SupoSource[] {
  if (!header) return [];
  try {
    const binary = atob(header);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return sanitizeSources(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}

function sanitizeSources(value: unknown): SupoSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { title: unknown; url: unknown } => typeof item === "object" && item !== null)
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "Source",
      url: typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? item.url : null,
    }))
    .slice(0, 5);
}

export function createSupoClient(
  options: HeadlessClientOptions,
  // `embedded` is set by the DOM widget, which owns hooks and window events.
  internal: { embedded?: boolean } = {},
) {
  if (!options.productId) throw new Error("Supo productId is required.");

  const apiBaseUrl = resolveApiBaseUrl(options);
  const storage = createStorage(options.productId);
  const emitter = createEmitter(internal.embedded ? undefined : options.hooks, {
    windowEvents: !internal.embedded,
  });
  let customer = resolveCustomer(options.customer) ?? storage.getCustomer();
  if (customer) storage.setCustomer(customer);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastSeq = 0;
  let ablyClient: SupoRealtime | null = null;
  let ablyConversationId: string | null = null;
  let ablyConnected = false;
  let escalationStatus: SupoEscalationStatus = null;
  let availability: SupoAgentAvailability | null = null;
  let needsEmail = false;

  function conversation() {
    return storage.getConversation(customer);
  }

  function emitError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    emitter.emit("error", { message });
  }

  function setEscalationStatus(status: SupoEscalationStatus) {
    if (status !== "pending" && needsEmail) setHandoff({ needsEmail: false });
    if (escalationStatus === status) return;
    escalationStatus = status;
    emitter.emit("escalation-change", { status });
  }

  function setHandoff(next: { availability?: SupoAgentAvailability | null; needsEmail?: boolean }) {
    const nextAvailability = next.availability === undefined ? availability : next.availability;
    const nextNeedsEmail = next.needsEmail === undefined ? needsEmail : next.needsEmail;
    if (nextAvailability === availability && nextNeedsEmail === needsEmail) return;
    availability = nextAvailability;
    needsEmail = nextNeedsEmail;
    emitter.emit("handoff", { availability, needsEmail });
  }

  function emitServerMessage(data: {
    id?: string;
    seq?: number;
    body: string;
    senderType: unknown;
    senderName?: string;
    sources?: unknown;
    createdAt?: string;
  }) {
    const role = toRole(data.senderType);
    if (!role) return;
    if (typeof data.seq === "number" && data.seq > lastSeq) lastSeq = data.seq;
    if (role === "agent") setEscalationStatus("active");
    emitter.emit("message", {
      id: data.id,
      role,
      body: data.body,
      createdAt: data.createdAt,
      sources: sanitizeSources(data.sources),
      senderName: role === "agent" ? data.senderName || "Support" : undefined,
    });
  }

  function forgetConversation() {
    storage.clearConversation(customer);
    stopPolling();
    ablyClient?.close();
    ablyClient = null;
    ablyConversationId = null;
    ablyConnected = false;
    lastSeq = 0;
    setEscalationStatus(null);
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
        after: lastSeq,
      }),
    );
    if (response.status === 404) {
      // Stored conversation no longer exists (or belongs to someone else).
      forgetConversation();
      return null;
    }
    if (!response.ok) throw new Error(`Supo polling failed: ${response.status}`);
    const data = (await response.json()) as SupoPollResponse;
    setEscalationStatus(data.escalationStatus);
    setHandoff({ needsEmail: Boolean(data.needsEmail) });
    for (const message of data.messages) emitServerMessage(message);
    if (typeof data.cursor === "number" && data.cursor > lastSeq) lastSeq = data.cursor;
    return data;
  }

  function startPolling() {
    if (pollTimer || ablyConnected) return;
    pollTimer = setInterval(() => {
      pollOnce().catch(() => {});
    }, 4000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function subscribeToConversation(conversationId: string, conversationToken: string) {
    if (options.realtime === "polling") {
      startPolling();
      return;
    }
    if (ablyConversationId === conversationId) return;

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
      ablyConversationId = conversationId;
      ablyClient.connection.on("connected", () => {
        ablyConnected = true;
        stopPolling();
        // Catch up on anything sent while we were disconnected.
        void pollOnce().catch(() => {});
      });
      for (const state of ["disconnected", "suspended", "failed", "closed"] as const) {
        ablyClient.connection.on(state, () => {
          ablyConnected = false;
          if (state !== "closed") startPolling();
        });
      }

      const channel = ablyClient.channels.get(tokenData.channelName);
      await channel.subscribe("message", (msg) => {
        emitServerMessage(msg.data as Parameters<typeof emitServerMessage>[0]);
      });
      await channel.subscribe("escalation_update", (msg) => {
        const data = msg.data as { status?: SupoEscalationStatus; availability?: SupoAgentAvailability; needsEmail?: boolean };
        setEscalationStatus(data.status === "pending" || data.status === "active" ? data.status : null);
        setHandoff({ availability: data.availability ?? availability, needsEmail: Boolean(data.needsEmail) });
      });
      await channel.subscribe("typing", (msg) => {
        const data = msg.data as { agentName?: string };
        emitter.emit("typing", { agentName: data.agentName ?? null });
      });
    } catch (error) {
      emitError(error);
      startPolling();
    }
  }

  /** Loads history and starts live updates for the stored conversation (e.g. after a page reload). */
  async function resume() {
    const ref = conversation();
    if (!customer || !ref.id || !ref.token) return;
    await pollOnce().catch(() => {});
    const current = conversation();
    if (current.id && current.token) {
      void subscribeToConversation(current.id, current.token);
      if (options.realtime === "polling") startPolling();
    }
  }

  async function sendMessage(body: string): Promise<string> {
    return (await sendMessageWithSources(body)).text;
  }

  async function sendMessageWithSources(body: string, retried = false): Promise<SupoSendResult> {
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
    if (response.status === 404 && ref.id && !retried) {
      // The stored conversation is gone; start a new one.
      forgetConversation();
      return sendMessageWithSources(body, true);
    }
    if (!response.ok) throw new Error(`Supo message failed: ${response.status}`);
    const nextConversationId = response.headers.get("x-conversation-id");
    const nextConversationToken = response.headers.get("x-conversation-token");
    if (nextConversationId && nextConversationToken) {
      storage.setConversation(customer, nextConversationId, nextConversationToken);
      void subscribeToConversation(nextConversationId, nextConversationToken);
    }

    const customerMessageId = response.headers.get("x-message-id");
    const aiMessageId = response.headers.get("x-ai-message-id");
    const sources = parseSources(response.headers.get("x-sources"));
    const headerStatus = response.headers.get("x-escalation-status");
    const headerAvailability = response.headers.get("x-handoff-availability") as SupoAgentAvailability | null;
    if (headerStatus === "pending" || headerStatus === "active") setEscalationStatus(headerStatus);
    if (headerAvailability || response.headers.get("x-needs-email")) {
      setHandoff({ availability: headerAvailability, needsEmail: response.headers.get("x-needs-email") === "1" });
    }

    if (response.headers.get("x-reply-mode") === "none") {
      const text = await response.text();
      if (!ablyConnected) void pollOnce().catch(() => {});
      return { text, sources: [], customerMessageId, aiMessageId: null, replyMode: "none" };
    }

    const reader = response.body?.getReader();
    let text = "";
    if (!reader) {
      text = await response.text();
    } else {
      const decoder = new TextDecoder();
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        text += decoder.decode(result.value, { stream: true });
      }
    }
    if (!ablyConnected) void pollOnce().catch(() => {});
    return { text, sources, customerMessageId, aiMessageId, replyMode: "ai" };
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
    const data = (await response.json()) as {
      escalationStatus?: SupoEscalationStatus;
      availability?: SupoAgentAvailability;
      needsEmail?: boolean;
    };
    setEscalationStatus(data.escalationStatus === "pending" || data.escalationStatus === "active" ? data.escalationStatus : null);
    setHandoff({ availability: data.availability ?? null, needsEmail: Boolean(data.needsEmail) });
    if (!ablyConnected) {
      void pollOnce().catch(() => {});
      startPolling();
    }
    return data;
  }

  /** Leaves an email for follow-up when no agent is available. */
  async function submitFollowUpEmail(email: string) {
    const ref = conversation();
    if (!ref.id || !ref.token) throw new Error("A conversation is required.");
    const response = await fetch(joinUrl(apiBaseUrl, "/api/widget/contact"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: options.productId,
        conversationId: ref.id,
        conversationToken: ref.token,
        email,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Supo contact failed: ${response.status}`);
    }
    setHandoff({ needsEmail: false });
    if (!ablyConnected) void pollOnce().catch(() => {});
  }

  function identify(nextCustomer: SupoCustomer): boolean {
    const normalized = normalizeCustomer(nextCustomer);
    if (!normalized) return false;
    const previousRef = conversation();
    customer = normalized;
    storage.setCustomer(normalized);
    const nextRef = conversation();
    if (previousRef.id !== nextRef.id) {
      ablyClient?.close();
      ablyClient = null;
      ablyConversationId = null;
      ablyConnected = false;
      lastSeq = 0;
    }
    void resume();
    return true;
  }

  function reset() {
    stopPolling();
    ablyClient?.close();
    ablyClient = null;
    ablyConversationId = null;
    ablyConnected = false;
    lastSeq = 0;
    escalationStatus = null;
    availability = null;
    needsEmail = false;
    customer = null;
    storage.clear();
  }

  return {
    sendMessage,
    sendMessageWithSources,
    escalate,
    submitFollowUpEmail,
    identify,
    resume,
    reset,
    pollOnce,
    startPolling,
    stopPolling,
    getCustomer: () => customer,
    getConversation: conversation,
    getEscalationStatus: () => escalationStatus,
    getHandoff: () => ({ availability, needsEmail }),
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
  SupoAgentAvailability,
  SupoAppearance,
  SupoCustomer,
  SupoEscalationStatus,
  SupoEventHandler,
  SupoEventName,
  SupoInitOptions,
  SupoMessage,
  SupoSendResult,
  SupoSource,
  SupoRuntime,
  SupoState,
} from "./types";
