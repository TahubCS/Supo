// Pure helpers for the email channel: addresses, subjects, quoted replies and threading.

export type ParsedAddress = { name: string | null; email: string };

/** Parses `Jane Doe <jane@example.com>` or a bare address. */
export function parseAddress(raw: string): ParsedAddress | null {
  const value = raw.trim();
  const angle = /^(.*)<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value);
  const email = (angle ? angle[2] : value).trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return null;
  const name = angle ? angle[1].trim().replace(/^"|"$/g, "").trim() : "";
  return { name: name || null, email };
}

/** Removes reply/forward prefixes ("Re:", "Fwd:", "AW:", "SV:", …). */
export function normalizeSubject(subject: string): string {
  let current = subject.trim();
  for (;;) {
    const next = current.replace(/^(re|fw|fwd|aw|sv|vs|antw|wg|tr)\s*(\[\d+\])?\s*:\s*/i, "").trim();
    if (next === current) return current;
    current = next;
  }
}

const QUOTE_MARKERS = [
  /^On .{3,200}wrote:\s*$/i, // Gmail / Apple Mail
  /^Le .{3,200}a écrit\s*:\s*$/i,
  /^Am .{3,200}schrieb .{0,100}:\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i, // Outlook
  /^_{10,}\s*$/, // Outlook separator
  /^From:\s.+$/i, // Outlook header block
  /^Sent from my /i,
];

/** The new text of a reply, without the quoted history and signature delimiter block. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // A wrapped "On … wrote:" spans two lines in some clients.
    const joined = `${trimmed} ${lines[i + 1]?.trim() ?? ""}`;
    if (QUOTE_MARKERS.some((marker) => marker.test(trimmed)) || /^On .{3,200}wrote:\s*$/i.test(joined)) break;
    if (trimmed === "--" || line === "-- ") break; // signature delimiter
    if (/^>/.test(trimmed)) continue;
    kept.push(line);
  }
  const result = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Never return nothing for a message that only had quoted text.
  return result || text.trim();
}

/** Message-ID for an outbound reply; encodes the conversation for threading. */
export function outboundMessageId(conversationId: string, messageId: string, domain: string): string {
  return `<conv-${conversationId}.${messageId}@${domain}>`;
}

const THREAD_PATTERN = /<conv-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[^>]*>/i;

/** Conversation id from In-Reply-To / References headers of a reply to one of our emails. */
export function threadConversationId(headers: Record<string, string> | null | undefined): string | null {
  if (!headers) return null;
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of ["in-reply-to", "references"]) {
    const match = THREAD_PATTERN.exec(lower[key] ?? "");
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/** The mailbox local part (without +tag) when `address` belongs to `domain`. */
export function inboundLocalPart(address: string, domain: string): string | null {
  const parsed = parseAddress(address);
  if (!parsed) return null;
  const [local, host] = parsed.email.split("@");
  if (host !== domain.toLowerCase()) return null;
  return local.split("+")[0] || null;
}

/** Minimal HTML for an outbound reply: escaped text with line breaks. */
export function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escaped}</div>`;
}
