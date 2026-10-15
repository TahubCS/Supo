export type SupoCustomer = {
  externalId?: string;
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  locale?: string;
  timezone?: string;
  // HMAC-SHA256(identity secret, externalId ?? email), computed by your backend.
  // Required when identity verification is enabled for the product.
  userHash?: string;
};

export type SupoAppearance = {
  theme?: "dark" | "light";
  position?: "bottom-right" | "bottom-left";
  accentColor?: `#${string}`;
  launcherLabel?: string;
  launcherStyle?: "icon" | "icon-label";
  panelSize?: "compact" | "standard" | "wide";
  borderRadius?: "soft" | "rounded" | "square";
  botName?: string;
  greeting?: string;
  introTitle?: string;
  introDescription?: string;
  inputPlaceholder?: string;
  agentHandoffLabel?: string;
  showPoweredBy?: boolean;
};

export type SupoEscalationStatus = "pending" | "active" | null;
export type SupoRealtimeMode = "auto" | "polling";

export type SupoHooks = {
  onReady?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: { message: string }) => void;
  onEscalationChange?: (status: SupoEscalationStatus) => void;
};

export type SupoInitOptions = {
  productId: string;
  apiBaseUrl?: string;
  customer?: SupoCustomer | (() => SupoCustomer | null);
  appearance?: SupoAppearance;
  behavior?: {
    startOpen?: boolean;
    hideLauncher?: boolean;
  };
  realtime?: SupoRealtimeMode;
  hooks?: SupoHooks;
};

export type SupoWidgetConfigResponse = {
  productId: string;
  appearance: Required<SupoAppearance>;
  endpoints: {
    messages: string;
    escalations: string;
    poll: string;
    realtimeToken: string;
  };
  features: {
    realtime: boolean;
    pollingFallback: true;
    betaNotice: true;
  };
};

export type SupoSource = {
  title: string;
  url: string | null;
};

export type SupoMessage = {
  id?: string;
  role: "customer" | "ai" | "agent" | "system" | "typing";
  body: string;
  createdAt?: string;
  // Knowledge base articles an AI answer was based on.
  sources?: SupoSource[];
  // Display name of the human agent who sent the message.
  senderName?: string;
};

export type SupoAgentAvailability = "online" | "offline" | "unknown";

export type SupoSendResult = {
  text: string;
  sources: SupoSource[];
  // Server ids for the customer message and the AI reply (for de-duplication).
  customerMessageId: string | null;
  aiMessageId: string | null;
  // "none" when no AI reply was generated (a human is handling the chat).
  replyMode: "ai" | "none";
};

export type SupoState = {
  productId: string;
  isOpen: boolean;
  connection: "idle" | "streaming" | "waiting_agent" | "agent_active";
  customer: SupoCustomer | null;
  conversationId: string | null;
  escalationStatus: SupoEscalationStatus;
};

export type SupoEventMap = {
  ready: { productId: string };
  open: undefined;
  close: undefined;
  error: { message: string };
  "state-change": SupoState;
  "escalation-change": { status: SupoEscalationStatus };
  message: SupoMessage;
  // A human agent is typing a reply.
  typing: { agentName: string | null };
  // Waiting for a human; `needsEmail` asks the customer for a follow-up address.
  handoff: { availability: SupoAgentAvailability | null; needsEmail: boolean };
  // The conversation was resolved: ask the customer to rate it (1-5).
  // `score` is set once the customer has submitted a rating.
  rating: { requested: boolean; score: number | null };
};

export type SupoEventName = keyof SupoEventMap;

export type SupoEventHandler<EventName extends SupoEventName = SupoEventName> = (
  payload: SupoEventMap[EventName],
) => void;

export type SupoRuntime = {
  open(): void;
  close(): void;
  toggle(): void;
  identify(customer: SupoCustomer): boolean;
  reset(): void;
  destroy(): void;
  getState(): SupoState;
  on<EventName extends SupoEventName>(
    event: EventName,
    handler: SupoEventHandler<EventName>,
  ): () => void;
};
