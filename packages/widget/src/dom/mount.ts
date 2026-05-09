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
  const headless = createSupoClient(options);
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

  if (customer) {
    storage.setCustomer(customer);
    headless.identify(customer);
  }

  const unsubscribeMessage = headless.on("message", (message) => {
    if (message.role === "agent") {
      messages = appendUnique(messages, message);
      connection = "agent_active";
      setEscalationStatus("active");
      render();
    }
  });
  const unsubscribeEscalation = headless.on("escalation-change", ({ status }) => {
    setEscalationStatus(status);
    render();
  });

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

  function setEscalationStatus(status: SupoEscalationStatus) {
    if (escalationStatus === status) return;
    escalationStatus = status;
    if (status === "pending") connection = "waiting_agent";
    if (status === "active") connection = "agent_active";
    if (status === null && connection !== "streaming") connection = "idle";
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
      connection,
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
      messages = appendUnique(messages, { role: "system", body: "Connecting you to an agent..." });
      connection = headless.getEscalationStatus() === "active" ? "agent_active" : "waiting_agent";
      render();
    } catch (error) {
      emitError(error);
      messages = appendUnique(messages, {
        role: "system",
        body: "Could not connect to an agent. Please try again.",
      });
      render();
    }
  }

  async function send() {
    if (connection === "streaming" || connection === "waiting_agent") return;
    const input = shadow.querySelector<HTMLTextAreaElement>("#supo-input");
    const body = input?.value.trim() ?? "";
    if (!body) return;
    if (input) {
      input.value = "";
      input.style.height = "auto";
    }

    messages = [...messages, { role: "customer", body }];
    if (connection === "agent_active") {
      render();
      await headless.sendMessage(body).catch(emitError);
      return;
    }

    messages = [...messages, { role: "typing", body: "" }];
    connection = "streaming";
    render();

    try {
      const response = await headless.sendMessage(body);
      messages[messages.length - 1] = { role: "ai", body: response };
      connection = headless.getEscalationStatus() === "pending" ? "waiting_agent" : "idle";
      render();
    } catch (error) {
      emitError(error);
      messages[messages.length - 1] = {
        role: "ai",
        body: "Something went wrong. Please try again.",
      };
      connection = "idle";
      render();
    }
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
      render();
      emitState();
    },
    destroy() {
      unsubscribeMessage();
      unsubscribeEscalation();
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
