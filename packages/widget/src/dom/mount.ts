import { createSupoClient } from "../headless";
import type {
  SupoCustomer,
  SupoEscalationStatus,
  SupoInitOptions,
  SupoMessage,
  SupoRuntime,
  SupoState,
} from "../types";
import { loadWidgetConfig, mergeAppearance, resolveApiBaseUrl } from "../runtime/config";
import { createEmitter } from "../runtime/events";
import { createStorage } from "../runtime/storage";
import { normalizeCustomer } from "../runtime/validation";
import { buildStyles } from "./styles";
import { renderBubble, renderPanel } from "./render";

type ConnectionState = "idle" | "streaming" | "waiting_agent" | "agent_active";

export function initSupo(options: SupoInitOptions): SupoRuntime {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return createServerRuntime(options.productId);
  }
  if (!options.productId) throw new Error("Supo productId is required.");

  const apiBaseUrl = resolveApiBaseUrl(options);
  const storage = createStorage(options.productId);
  const emitter = createEmitter(options.hooks);
  const headless = createSupoClient(options, { embedded: true });
  const host = document.createElement("div");
  host.id = "supo-widget-host";
  const shadow = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  let appearance = mergeAppearance(undefined, options.appearance);
  let customer = resolveCustomer(options.customer) ?? storage.getCustomer();
  let isOpen = options.behavior?.startOpen === true;
  let connection: ConnectionState = "idle";
  let messages: SupoMessage[] = [];
  let escalationStatus: SupoEscalationStatus = null;
  let needsEmail = false;
  let agentTyping: string | null = null;
  let rating = { requested: false, selected: null as number | null, comment: "", submitting: false };
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  const emittedMessageIds = new Set<string>();

  const unsubscribers = [
    headless.on("message", (message) => {
      // Public `runtime.on("message")`: each server message exactly once.
      if (!message.id || !emittedMessageIds.has(message.id)) {
        if (message.id) emittedMessageIds.add(message.id);
        emitter.emit("message", message);
      }
      messages = reconcileMessage(messages, message);
      if (message.role === "agent") {
        clearAgentTyping();
        setEscalationStatus("active");
      }
      render();
    }),
    headless.on("escalation-change", ({ status }) => {
      setEscalationStatus(status);
      render();
    }),
    headless.on("handoff", (handoff) => {
      needsEmail = handoff.needsEmail;
      render();
    }),
    headless.on("rating", (next) => {
      emitter.emit("rating", next);
      rating = next.requested
        ? { ...rating, requested: true }
        : { requested: false, selected: null, comment: "", submitting: false };
      render();
    }),
    headless.on("typing", ({ agentName }) => {
      agentTyping = agentName || "Support";
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        agentTyping = null;
        render();
      }, 5000);
      render();
    }),
    headless.on("error", (payload) => emitter.emit("error", payload)),
  ];

  function clearAgentTyping() {
    agentTyping = null;
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = null;
  }

  if (customer) {
    storage.setCustomer(customer);
    // identify() restores history and live updates for a stored conversation.
    headless.identify(customer);
  }

  void loadWidgetConfig({ apiBaseUrl, productId: options.productId })
    .then((config) => {
      appearance = mergeAppearance(config.appearance, options.appearance);
      render();
      emitter.emit("ready", { productId: options.productId });
    })
    .catch((error) => {
      emitError(error);
      render();
      emitter.emit("ready", { productId: options.productId });
    });

  render();

  function state(): SupoState {
    const ref = storage.getConversation(customer);
    return {
      productId: options.productId,
      isOpen,
      connection,
      customer,
      conversationId: ref.id,
      escalationStatus,
    };
  }

  function emitState() {
    emitter.emit("state-change", state());
  }

  function emitError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    emitter.emit("error", { message });
  }

  function connectionFor(status: SupoEscalationStatus): ConnectionState {
    if (status === "pending") return "waiting_agent";
    if (status === "active") return "agent_active";
    return "idle";
  }

  function setEscalationStatus(status: SupoEscalationStatus) {
    if (escalationStatus === status) return;
    escalationStatus = status;
    if (connection !== "streaming") connection = connectionFor(status);
    if (status !== "pending") needsEmail = false;
    emitter.emit("escalation-change", { status });
    emitState();
  }

  function render() {
    shadow.innerHTML = `<style>${buildStyles(appearance)}</style>${renderPanel({
      appearance,
      poweredByUrl: apiBaseUrl,
      customer,
      isOpen,
      messages,
      view: {
        connection,
        canEscalate: messages.some((m) => m.role === "ai" || m.role === "customer"),
        needsEmail,
        agentTyping: connection === "agent_active" ? agentTyping : null,
        rating,
      },
    })}${renderBubble({
      isOpen,
      hideLauncher: options.behavior?.hideLauncher === true,
      appearance,
    })}`;
    bindEvents();
    scrollBottom();
  }

  function bindEvents() {
    shadow.querySelector("#supo-bubble")?.addEventListener("click", () => runtime.toggle());
    shadow.querySelector("#supo-close")?.addEventListener("click", () => runtime.close());
    shadow.querySelector("#supo-id-btn")?.addEventListener("click", submitIdentity);
    shadow.querySelector("#supo-email")?.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") submitIdentity();
    });
    shadow.querySelector("#supo-escalate-btn")?.addEventListener("click", () => {
      void requestEscalation();
    });
    shadow.querySelector("#supo-followup-btn")?.addEventListener("click", () => {
      void submitFollowUp();
    });
    shadow.querySelector("#supo-followup-email")?.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") void submitFollowUp();
    });

    shadow.querySelectorAll<HTMLButtonElement>(".supo-star").forEach((star) => {
      star.addEventListener("click", () => {
        rating = { ...rating, selected: Number(star.dataset.score) };
        render();
        shadow.querySelector<HTMLTextAreaElement>("#supo-rating-comment")?.focus();
      });
    });
    shadow.querySelector<HTMLTextAreaElement>("#supo-rating-comment")?.addEventListener("input", (event) => {
      // Keep the draft across re-renders.
      rating.comment = (event.target as HTMLTextAreaElement).value;
    });
    shadow.querySelector("#supo-rating-btn")?.addEventListener("click", () => {
      void submitRating();
    });

    const input = shadow.querySelector<HTMLTextAreaElement>("#supo-input");
    shadow.querySelector("#supo-send")?.addEventListener("click", () => {
      void send();
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void send();
      }
    });
    input?.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
    });
  }

  function scrollBottom() {
    const container = shadow.querySelector("#supo-msgs");
    if (container) container.scrollTop = container.scrollHeight;
  }

  function submitIdentity() {
    const nameInput = shadow.querySelector<HTMLInputElement>("#supo-name");
    const emailInput = shadow.querySelector<HTMLInputElement>("#supo-email");
    const normalized = normalizeCustomer({
      name: nameInput?.value,
      email: emailInput?.value,
    });
    if (!normalized) {
      if (!nameInput?.value.trim()) nameInput?.classList.add("supo-error");
      emailInput?.classList.add("supo-error");
      return;
    }
    runtime.identify(normalized);
  }

  async function requestEscalation() {
    try {
      await headless.escalate();
      // The server posts the handoff notice as a system message.
      connection = connectionFor(headless.getEscalationStatus());
      render();
    } catch (error) {
      emitError(error);
      messages = appendUnique(messages, {
        role: "system",
        body: "Could not reach the support team. Please try again.",
      });
      render();
    }
  }

  async function submitFollowUp() {
    const input = shadow.querySelector<HTMLInputElement>("#supo-followup-email");
    const email = input?.value.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      input?.classList.add("supo-error");
      return;
    }
    try {
      await headless.submitFollowUpEmail(email);
      needsEmail = false;
      render();
    } catch (error) {
      emitError(error);
      input?.classList.add("supo-error");
    }
  }

  async function submitRating() {
    const score = rating.selected;
    if (score === null || rating.submitting) return;
    rating = { ...rating, submitting: true };
    render();
    try {
      await headless.submitRating(score, rating.comment);
      // The "rating" event clears the prompt.
      messages = appendUnique(messages, { role: "system", body: "Thanks for your feedback!" });
    } catch (error) {
      emitError(error);
      rating = { ...rating, submitting: false };
    }
    render();
  }

  async function send() {
    if (connection === "streaming") return;
    const input = shadow.querySelector<HTMLTextAreaElement>("#supo-input");
    const body = input?.value.trim() ?? "";
    if (!body) return;
    if (input) {
      input.value = "";
      input.style.height = "auto";
    }

    const local: SupoMessage = { role: "customer", body };
    messages = [...messages, local];
    const humanHandling = connection === "agent_active";
    if (!humanHandling) {
      messages = [...messages, { role: "typing", body: "" }];
      connection = "streaming";
    }
    render();

    try {
      const response = await headless.sendMessageWithSources(body);
      if (response.customerMessageId) {
        messages = assignId(messages, local, response.customerMessageId);
      }
      messages = messages.filter((m) => m.role !== "typing");
      if (response.replyMode === "ai" && response.text.trim()) {
        messages = reconcileMessage(messages, {
          id: response.aiMessageId ?? undefined,
          role: "ai",
          body: response.text,
          sources: response.sources,
        });
      }
    } catch (error) {
      emitError(error);
      messages = messages.filter((m) => m.role !== "typing");
      messages = [...messages, { role: "system", body: "Message not sent. Please try again." }];
    }
    connection = connectionFor(headless.getEscalationStatus());
    render();
  }

  const runtime: SupoRuntime = {
    open() {
      if (isOpen) return;
      isOpen = true;
      render();
      emitter.emit("open", undefined);
      emitState();
      const input = shadow.querySelector<HTMLTextAreaElement>("#supo-input");
      if (input) setTimeout(() => input.focus(), 50);
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      render();
      emitter.emit("close", undefined);
      emitState();
    },
    toggle() {
      if (isOpen) runtime.close();
      else runtime.open();
    },
    identify(nextCustomer) {
      const normalized = normalizeCustomer(nextCustomer);
      if (!normalized) {
        emitError(new Error("Valid customer.externalId/customer.id or customer.email is required."));
        return false;
      }
      customer = normalized;
      storage.setCustomer(normalized);
      headless.identify(normalized);
      render();
      emitState();
      return true;
    },
    reset() {
      headless.reset();
      customer = null;
      messages = [];
      connection = "idle";
      escalationStatus = null;
      needsEmail = false;
      rating = { requested: false, selected: null, comment: "", submitting: false };
      emittedMessageIds.clear();
      clearAgentTyping();
      render();
      emitState();
    },
    destroy() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      clearAgentTyping();
      headless.destroy();
      emitter.clear();
      host.remove();
    },
    getState: state,
    on: emitter.on,
  };

  if (isOpen) {
    emitter.emit("open", undefined);
  }
  emitState();

  return runtime;
}

function resolveCustomer(customer: SupoInitOptions["customer"]): SupoCustomer | null {
  if (typeof customer === "function") {
    try {
      return normalizeCustomer(customer());
    } catch {
      return null;
    }
  }
  return normalizeCustomer(customer);
}

// Merges a server message into the local list: updates a known id, adopts the
// id of a matching optimistic message (sent before the id was known), or appends.
function reconcileMessage(messages: SupoMessage[], message: SupoMessage): SupoMessage[] {
  if (message.id) {
    const index = messages.findIndex((item) => item.id === message.id);
    if (index >= 0) {
      const next = [...messages];
      next[index] = { ...next[index], ...message, sources: message.sources?.length ? message.sources : next[index].sources };
      return next;
    }
    const pending = messages.findIndex(
      (item) => !item.id && item.role === message.role && item.body === message.body,
    );
    if (pending >= 0) {
      const next = [...messages];
      next[pending] = { ...next[pending], ...message };
      return next;
    }
  }
  // Keep the "typing" placeholder last.
  const typingIndex = messages.findIndex((item) => item.role === "typing");
  if (typingIndex >= 0) {
    return [...messages.slice(0, typingIndex), message, ...messages.slice(typingIndex)];
  }
  return appendUnique(messages, message);
}

function assignId(messages: SupoMessage[], local: SupoMessage, id: string): SupoMessage[] {
  if (messages.some((item) => item.id === id)) {
    // The server copy already arrived via realtime; drop the optimistic one.
    return messages.filter((item) => item !== local);
  }
  return messages.map((item) => (item === local ? { ...item, id } : item));
}

function appendUnique(messages: SupoMessage[], message: SupoMessage): SupoMessage[] {
  if (message.id && messages.some((item) => item.id === message.id)) return messages;
  if (!message.id && message.role === "system" && messages.some((item) => item.body === message.body)) {
    return messages;
  }
  return [...messages, message];
}

function createServerRuntime(productId: string): SupoRuntime {
  return {
    open() {},
    close() {},
    toggle() {},
    identify() {
      return false;
    },
    reset() {},
    destroy() {},
    getState() {
      return {
        productId,
        isOpen: false,
        connection: "idle",
        customer: null,
        conversationId: null,
        escalationStatus: null,
      };
    },
    on() {
      return () => {};
    },
  };
}
