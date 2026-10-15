import { describe, expect, it } from "vitest";

import { decideHandoff, detectFrustration, detectHumanRequest } from "@/lib/handoff/policy";

describe("detectHumanRequest", () => {
  it.each([
    "Can I talk to a human?",
    "I want to speak with a real person",
    "connect me to an agent please",
    "agent",
    "Human!",
    "i need a representative",
    "transfer me to live support",
    "customer service please",
    "are you a bot? I want a human",
    "quiero hablar con una persona",
    "je veux parler à un humain",
  ])("detects %j", (message) => {
    expect(detectHumanRequest(message)).toBe(true);
  });

  it.each([
    "hi",
    "How do I add a team member to my workspace?",
    "What does the agent setting do?",
    "Is there a human-readable export format?",
    "Can my support team see invoices?",
  ])("ignores %j", (message) => {
    expect(detectHumanRequest(message)).toBe(false);
  });
});

describe("detectFrustration", () => {
  it("detects explicit frustration, shouting and repeated questions", () => {
    expect(detectFrustration("this is useless")).toBe(true);
    expect(detectFrustration("you're not helping at all")).toBe(true);
    expect(detectFrustration("WHY IS MY ACCOUNT LOCKED")).toBe(true);
    expect(detectFrustration("how do I cancel my plan", ["how do I cancel my plan"])).toBe(true);
  });

  it("does not flag normal questions", () => {
    expect(detectFrustration("How do I cancel my plan?")).toBe(false);
    expect(detectFrustration("Is it working for SSO?")).toBe(false);
    expect(detectFrustration("OK")).toBe(false);
  });
});

describe("decideHandoff", () => {
  const base = { previousCustomerMessages: [], unansweredStreak: 0, foundKnowledge: true, smallTalk: false };

  it("never escalates on greetings, even without knowledge", () => {
    const decision = decideHandoff({ ...base, message: "hi", foundKnowledge: false, smallTalk: true });
    expect(decision).toEqual({ escalate: false, reason: null, nextUnansweredStreak: 0 });
  });

  it("does not escalate on a single unanswered question", () => {
    const decision = decideHandoff({ ...base, message: "Do you support Okta?", foundKnowledge: false });
    expect(decision).toEqual({ escalate: false, reason: null, nextUnansweredStreak: 1 });
  });

  it("escalates after repeated unanswered questions", () => {
    const decision = decideHandoff({ ...base, message: "What about Azure AD?", unansweredStreak: 1, foundKnowledge: false });
    expect(decision).toMatchObject({ escalate: true, reason: "repeated_unanswered", nextUnansweredStreak: 2 });
  });

  it("resets the streak when the knowledge base answers", () => {
    expect(decideHandoff({ ...base, message: "pricing?", unansweredStreak: 1 }).nextUnansweredStreak).toBe(0);
  });

  it("escalates immediately on explicit requests and frustration", () => {
    expect(decideHandoff({ ...base, message: "let me talk to a human" }).reason).toBe("customer_request");
    expect(decideHandoff({ ...base, message: "this is ridiculous" }).reason).toBe("frustration");
  });
});
