import { describe, expect, it } from "vitest";

import {
  inboundLocalPart,
  normalizeSubject,
  outboundMessageId,
  parseAddress,
  stripQuotedReply,
  textToHtml,
  threadConversationId,
} from "@/lib/email-channel/parse";

describe("email parsing", () => {
  it("parses addresses", () => {
    expect(parseAddress('"Jane Doe" <Jane@Example.com>')).toEqual({ name: "Jane Doe", email: "jane@example.com" });
    expect(parseAddress("bob@example.com")).toEqual({ name: null, email: "bob@example.com" });
    expect(parseAddress("not an address")).toBeNull();
  });

  it("normalizes reply subjects", () => {
    expect(normalizeSubject("Re: RE: Fwd: Refund")).toBe("Refund");
    expect(normalizeSubject("AW: SV: Frage")).toBe("Frage");
    expect(normalizeSubject("Re[2]: Hello")).toBe("Hello");
    expect(normalizeSubject("Return policy")).toBe("Return policy");
  });

  it("strips quoted history", () => {
    const gmail = "Thanks, that worked!\n\nOn Tue, Oct 14, 2026 at 9:00 AM Acme Support <s@x.com> wrote:\n> Try resetting.\n> Bye";
    expect(stripQuotedReply(gmail)).toBe("Thanks, that worked!");
    const wrapped = "Great\n\nOn Tue, Oct 14, 2026 at 9:00 AM Acme Support\n<s@x.com> wrote:\n> old";
    expect(stripQuotedReply(wrapped)).toBe("Great");
    const outlook = "See attached.\r\n\r\n-----Original Message-----\r\nFrom: Acme\r\nOld text";
    expect(stripQuotedReply(outlook)).toBe("See attached.");
    expect(stripQuotedReply("Hi\n-- \nJane\nCEO")).toBe("Hi");
    expect(stripQuotedReply("> only quoted")).toBe("> only quoted");
    expect(stripQuotedReply("Line one\n\n\n\nLine two")).toBe("Line one\n\nLine two");
  });

  it("threads replies to our outbound message ids", () => {
    const conv = "0b7d6b1e-5f0a-4c3e-9a51-0e2f3c4d5e6f";
    const id = outboundMessageId(conv, "m1", "inbound.example.com");
    expect(id).toBe(`<conv-${conv}.m1@inbound.example.com>`);
    expect(threadConversationId({ "In-Reply-To": id })).toBe(conv);
    expect(threadConversationId({ references: `<abc@mail.gmail.com> ${id}` })).toBe(conv);
    expect(threadConversationId({ "in-reply-to": "<abc@mail.gmail.com>" })).toBeNull();
    expect(threadConversationId(null)).toBeNull();
  });

  it("recognizes inbound addresses", () => {
    expect(inboundLocalPart("Acme <support-ab12@Inbound.Example.com>", "inbound.example.com")).toBe("support-ab12");
    expect(inboundLocalPart("support-ab12+tag@inbound.example.com", "inbound.example.com")).toBe("support-ab12");
    expect(inboundLocalPart("support@other.com", "inbound.example.com")).toBeNull();
  });

  it("escapes outbound html", () => {
    expect(textToHtml('<b>"hi"</b> & bye')).toContain("&lt;b&gt;&quot;hi&quot;&lt;/b&gt; &amp; bye");
  });
});
