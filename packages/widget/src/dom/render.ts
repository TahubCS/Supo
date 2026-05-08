import { ICON_AGENT, ICON_CHAT, ICON_CLOSE, ICON_MSG_SM, ICON_X_SM } from "./icons";
import type { SupoAppearance, SupoCustomer, SupoMessage } from "../types";

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lastAiOfferedEscalation(messages: SupoMessage[]): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "ai") {
      const lower = message.body.toLowerCase();
      return ["human agent", "connect you", "live agent", "support agent", "speak to"].some((term) =>
        lower.includes(term),
      );
    }
    if (message.role === "customer" || message.role === "agent") break;
  }
  return false;
}

export function renderBubble({
  isOpen,
  hideLauncher,
  appearance,
}: {
  isOpen: boolean;
  hideLauncher: boolean;
  appearance: Required<SupoAppearance>;
}) {
  if (hideLauncher) return "";
  const label =
    !isOpen && appearance.launcherStyle === "icon-label"
      ? `<span id="supo-bubble-label">${escapeHtml(appearance.launcherLabel)}</span>`
      : "";
  return `<button id="supo-bubble" class="${isOpen ? "supo-open" : ""}" aria-label="Open support chat">${
    isOpen ? ICON_CLOSE : ICON_CHAT
  }${label}</button>`;
}

export function renderPanel({
  appearance,
  customer,
  isOpen,
  messages,
  connection,
}: {
  appearance: Required<SupoAppearance>;
  customer: SupoCustomer | null;
  isOpen: boolean;
  messages: SupoMessage[];
  connection: "idle" | "streaming" | "waiting_agent" | "agent_active";
}) {
  return `<div id="supo-panel" class="${isOpen ? "" : "supo-hidden"}">${renderHeader(
    appearance,
    connection,
  )}<div id="supo-beta"><strong>BETA testing:</strong> this widget is unstable at the moment.</div>${
    customer ? renderChat(appearance, messages, connection) : renderIdForm(appearance)
  }${appearance.showPoweredBy ? '<div id="supo-powered"><a href="https://supo.app" target="_blank" rel="noopener">Powered by Supo</a></div>' : ""}</div>`;
}

function renderHeader(
  appearance: Required<SupoAppearance>,
  connection: "idle" | "streaming" | "waiting_agent" | "agent_active",
) {
  const subtitle =
    connection === "waiting_agent"
      ? '<div id="supo-head-status"><span class="supo-spin"></span> Connecting to an agent...</div>'
      : connection === "agent_active"
        ? `<div id="supo-head-status">${ICON_AGENT} Agent connected</div>`
        : "";
  return `<div id="supo-head"><div id="supo-head-icon">${ICON_MSG_SM}</div><div style="flex:1;min-width:0"><div id="supo-head-name">${escapeHtml(
    appearance.botName,
  )}</div>${subtitle}</div><button id="supo-close" aria-label="Close">${ICON_X_SM}</button></div>`;
}

function renderChat(
  appearance: Required<SupoAppearance>,
  messages: SupoMessage[],
  connection: "idle" | "streaming" | "waiting_agent" | "agent_active",
) {
  const isWaiting = connection === "waiting_agent";
  const isAgentActive = connection === "agent_active";
  const isStreaming = connection === "streaming";
  let html = '<div id="supo-msgs">';

  if (messages.length === 0) {
    html += `<div class="supo-msg supo-ai"><div class="supo-bub">${escapeHtml(appearance.greeting)}</div></div>`;
  }

  for (const message of messages) {
    if (message.role === "customer") {
      html += `<div class="supo-msg supo-user"><div class="supo-bub">${escapeHtml(message.body)}</div></div>`;
    } else if (message.role === "ai") {
      html += `<div class="supo-msg supo-ai"><div class="supo-bub supo-ai-bub">${escapeHtml(message.body)}</div></div>`;
    } else if (message.role === "agent") {
      html += `<div class="supo-msg supo-agent"><div class="supo-sender-label">Support Agent</div><div class="supo-bub">${escapeHtml(message.body)}</div></div>`;
    } else if (message.role === "typing") {
      html += '<div class="supo-msg supo-ai"><div class="supo-bub"><span class="supo-dot"></span><span class="supo-dot"></span><span class="supo-dot"></span></div></div>';
    } else {
      html += `<div class="supo-msg supo-system"><div class="supo-bub">${escapeHtml(message.body)}</div></div>`;
    }
  }

  html += "</div>";
  if (connection === "idle" && lastAiOfferedEscalation(messages)) {
    html += `<button id="supo-escalate-btn">${escapeHtml(appearance.agentHandoffLabel)}</button>`;
  }

  const placeholder = isWaiting
    ? "Waiting for an agent..."
    : isAgentActive
      ? "Reply to agent..."
      : appearance.inputPlaceholder;
  const disabled = isStreaming || isWaiting ? " disabled" : "";
  return `${html}<div id="supo-composer"><textarea id="supo-input" placeholder="${escapeHtml(
    placeholder,
  )}" rows="1"${disabled}></textarea><button id="supo-send"${disabled}>Send</button></div>`;
}

function renderIdForm(appearance: Required<SupoAppearance>) {
  return `<div id="supo-id-form"><h3>${escapeHtml(appearance.introTitle)}</h3><p>${escapeHtml(
    appearance.introDescription,
  )}</p><input id="supo-name" class="supo-inp" type="text" placeholder="Your name" autocomplete="name" /><input id="supo-email" class="supo-inp" type="email" placeholder="Your email" autocomplete="email" /><button id="supo-id-btn">Start chat</button></div>`;
}
