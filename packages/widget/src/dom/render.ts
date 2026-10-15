import { ICON_AGENT, ICON_CHAT, ICON_CLOSE, ICON_MSG_SM, ICON_X_SM } from "./icons";
import type { SupoAppearance, SupoCustomer, SupoMessage } from "../types";

function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function renderSources(sources: SupoMessage["sources"]): string {
  if (!sources || sources.length === 0) return "";
  const items = sources
    .slice(0, 4)
    .map((source) => {
      const title = escapeHtml(source.title.length > 60 ? `${source.title.slice(0, 57)}…` : source.title);
      const href = safeHttpUrl(source.url);
      return href
        ? `<a class="supo-source" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${title}</a>`
        : `<span class="supo-source">${title}</span>`;
    })
    .join("");
  return `<div class="supo-sources"><span class="supo-sources-label">Sources</span>${items}</div>`;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

export type ChatView = {
  connection: "idle" | "streaming" | "waiting_agent" | "agent_active";
  // Show the "talk to a person" button.
  canEscalate: boolean;
  // Ask the customer for a follow-up email (no agent available).
  needsEmail: boolean;
  // Name of the agent currently typing, if any.
  agentTyping: string | null;
  // CSAT prompt after the conversation was resolved.
  rating: { requested: boolean; selected: number | null; comment: string; submitting: boolean };
};

export function renderPanel({
  appearance,
  poweredByUrl,
  customer,
  isOpen,
  messages,
  view,
}: {
  appearance: Required<SupoAppearance>;
  poweredByUrl: string;
  customer: SupoCustomer | null;
  isOpen: boolean;
  messages: SupoMessage[];
  view: ChatView;
}) {
  return `<div id="supo-panel" class="${isOpen ? "" : "supo-hidden"}">${renderHeader(
    appearance,
    view.connection,
  )}${
    customer ? renderChat(appearance, messages, view) : renderIdForm(appearance)
  }${appearance.showPoweredBy ? `<div id="supo-powered"><a href="${escapeHtml(poweredByUrl)}" target="_blank" rel="noopener">Powered by Supo</a></div>` : ""}</div>`;
}

function renderHeader(
  appearance: Required<SupoAppearance>,
  connection: "idle" | "streaming" | "waiting_agent" | "agent_active",
) {
  const subtitle =
    connection === "waiting_agent"
      ? '<div id="supo-head-status"><span class="supo-spin"></span> Waiting for a teammate…</div>'
      : connection === "agent_active"
        ? `<div id="supo-head-status">${ICON_AGENT} Agent connected</div>`
        : "";
  return `<div id="supo-head"><div id="supo-head-icon">${ICON_MSG_SM}</div><div style="flex:1;min-width:0"><div id="supo-head-name">${escapeHtml(
    appearance.botName,
  )}</div>${subtitle}</div><button id="supo-close" aria-label="Close">${ICON_X_SM}</button></div>`;
}

function renderChat(appearance: Required<SupoAppearance>, messages: SupoMessage[], view: ChatView) {
  const { connection } = view;
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
      html += `<div class="supo-msg supo-ai"><div class="supo-bub supo-ai-bub">${escapeHtml(message.body)}</div>${renderSources(message.sources)}</div>`;
    } else if (message.role === "agent") {
      html += `<div class="supo-msg supo-agent"><div class="supo-sender-label">${escapeHtml(message.senderName || "Support")}</div><div class="supo-bub">${escapeHtml(message.body)}</div></div>`;
    } else if (message.role === "typing") {
      html += '<div class="supo-msg supo-ai"><div class="supo-bub"><span class="supo-dot"></span><span class="supo-dot"></span><span class="supo-dot"></span></div></div>';
    } else {
      html += `<div class="supo-msg supo-system"><div class="supo-bub">${escapeHtml(message.body)}</div></div>`;
    }
  }

  if (view.agentTyping) {
    html += `<div class="supo-msg supo-agent"><div class="supo-sender-label">${escapeHtml(view.agentTyping)} is typing</div><div class="supo-bub"><span class="supo-dot"></span><span class="supo-dot"></span><span class="supo-dot"></span></div></div>`;
  }

  html += "</div>";
  if (view.needsEmail && isWaiting) {
    html += `<div id="supo-followup"><input id="supo-followup-email" class="supo-inp" type="email" placeholder="you@example.com" autocomplete="email" aria-label="Email for follow-up" /><button id="supo-followup-btn">Notify me</button></div>`;
  }
  if (view.rating.requested) {
    html += renderRating(view.rating);
  }
  if (view.canEscalate && connection === "idle" && !view.rating.requested) {
    html += `<button id="supo-escalate-btn">${escapeHtml(appearance.agentHandoffLabel)}</button>`;
  }

  const placeholder = isWaiting
    ? "Add details while you wait…"
    : isAgentActive
      ? "Reply to agent..."
      : appearance.inputPlaceholder;
  const disabled = isStreaming ? " disabled" : "";
  return `${html}<div id="supo-composer"><textarea id="supo-input" placeholder="${escapeHtml(
    placeholder,
  )}" rows="1"${disabled}></textarea><button id="supo-send"${disabled}>Send</button></div>`;
}

function renderRating(rating: ChatView["rating"]) {
  const stars = [1, 2, 3, 4, 5]
    .map(
      (score) =>
        `<button class="supo-star${rating.selected !== null && score <= rating.selected ? " supo-star-on" : ""}" data-score="${score}" aria-label="${score} out of 5"${
          rating.submitting ? " disabled" : ""
        }>★</button>`,
    )
    .join("");
  const details =
    rating.selected === null
      ? ""
      : `<textarea id="supo-rating-comment" class="supo-inp" rows="2" maxlength="1000" placeholder="Anything we could do better? (optional)">${escapeHtml(
          rating.comment,
        )}</textarea><button id="supo-rating-btn"${rating.submitting ? " disabled" : ""}>${
          rating.submitting ? "Sending…" : "Send feedback"
        }</button>`;
  return `<div id="supo-rating"><div class="supo-rating-title">How did we do?</div><div class="supo-stars" role="group" aria-label="Rate this conversation">${stars}</div>${details}</div>`;
}

function renderIdForm(appearance: Required<SupoAppearance>) {
  return `<div id="supo-id-form"><h3>${escapeHtml(appearance.introTitle)}</h3><p>${escapeHtml(
    appearance.introDescription,
  )}</p><input id="supo-name" class="supo-inp" type="text" placeholder="Your name" autocomplete="name" /><input id="supo-email" class="supo-inp" type="email" placeholder="Your email" autocomplete="email" /><button id="supo-id-btn">Start chat</button></div>`;
}
