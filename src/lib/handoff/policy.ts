// Decides when a conversation should be handed from the AI to a human.
//
// Escalate when:
//   1. the customer explicitly asks for a person,
//   2. the customer is clearly frustrated, or
//   3. the knowledge base failed to answer several substantive questions in a row.
// Greetings / small talk and single misses never escalate.

export type HandoffReason = "customer_request" | "frustration" | "repeated_unanswered";

export type HandoffDecision = {
  escalate: boolean;
  reason: HandoffReason | null;
  nextUnansweredStreak: number;
};

export const UNANSWERED_STREAK_LIMIT = 2;

const HUMAN_REQUEST_PATTERNS: RegExp[] = [
  // English
  /\b(talk|speak|chat|connect|transfer)\w*\b.{0,30}\b(human|person|someone|somebody|agent|representative|rep|operator|staff|support team|real (?:person|human)|live (?:agent|person|support|chat))\b/i,
  /\b(human|real person|live agent|live person|customer service|customer support|support agent|representative|operator)\b.{0,15}\b(please|now|asap)\b/i,
  /\b(can|could|may) i (?:have|get) (?:a|an)\s+(?:human|person|agent|representative)\b/i,
  /\b(i (?:want|need|would like)|give me|get me)\b.{0,20}\b(human|person|agent|representative|operator|manager|someone real)\b/i,
  /^\s*(human|agent|representative|operator|real person|live agent|talk to a human)[\s.!?]*$/i,
  /\b(are you|is this) (?:a )?(bot|robot|ai)\b.{0,40}\b(human|person)\b/i,
  // Spanish / Portuguese
  /\b(hablar|habla|falar)\b.{0,25}\b(humano|persona|pessoa|agente|asesor|representante)\b/i,
  // French
  /\b(parler|discuter)\b.{0,25}\b(humain|personne|agent|conseiller)\b/i,
  // German
  /\b(mit einem|einen)\b.{0,15}\b(menschen|mitarbeiter|berater)\b/i,
  // Hindi / Urdu (romanized)
  /\b(insaan|insan|aadmi|banda)\b.{0,20}\b(baat|bat)\b/i,
];

const FRUSTRATION_PATTERNS: RegExp[] = [
  /\b(useless|pointless|ridiculous|terrible|awful|worst|garbage|rubbish)\b/i,
  /\b(not|isn'?t|doesn'?t|didn'?t)\s+(help|helping|helpful|working|answer)/i,
  /\b(this|you)\s+(is|are)\s+(not|n'?t)\s+(helping|working)/i,
  /\byou(?:'re| are)\s+(?:not|n'?t)\s+(?:understanding|listening)/i,
  /\b(wtf|ffs|omfg)\b/i,
  /\b(f+u+c+k+\w*|shit+\w*|damn+)\b/i,
  /!{3,}/,
  /\?{3,}/,
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectHumanRequest(message: string): boolean {
  const text = normalize(message);
  if (!text) return false;
  return HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

function isShouting(message: string): boolean {
  const letters = message.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 12 && letters === letters.toUpperCase();
}

export function detectFrustration(message: string, previousCustomerMessages: string[] = []): boolean {
  const text = normalize(message);
  if (!text) return false;
  if (FRUSTRATION_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (isShouting(message)) return true;

  // Repeating the same question means the previous answers did not help.
  const repeats = previousCustomerMessages
    .slice(-3)
    .filter((previous) => normalize(previous) === text && text.split(" ").length >= 3).length;
  return repeats >= 1;
}

export function decideHandoff({
  message,
  previousCustomerMessages = [],
  unansweredStreak,
  foundKnowledge,
  smallTalk,
}: {
  message: string;
  previousCustomerMessages?: string[];
  unansweredStreak: number;
  foundKnowledge: boolean;
  smallTalk: boolean;
}): HandoffDecision {
  const nextUnansweredStreak = smallTalk ? unansweredStreak : foundKnowledge ? 0 : unansweredStreak + 1;

  if (detectHumanRequest(message)) {
    return { escalate: true, reason: "customer_request", nextUnansweredStreak };
  }
  if (detectFrustration(message, previousCustomerMessages)) {
    return { escalate: true, reason: "frustration", nextUnansweredStreak };
  }
  if (nextUnansweredStreak >= UNANSWERED_STREAK_LIMIT) {
    return { escalate: true, reason: "repeated_unanswered", nextUnansweredStreak };
  }
  return { escalate: false, reason: null, nextUnansweredStreak };
}

export const HANDOFF_REASON_LABELS: Record<string, string> = {
  customer_request: "Customer asked for a person",
  frustration: "Customer seems frustrated",
  repeated_unanswered: "AI couldn't answer repeated questions",
  agent: "Taken over by an agent",
  manual: "Customer pressed “talk to a person”",
};
