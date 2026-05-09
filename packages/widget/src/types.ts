export type SupoCustomer = {
  externalId?: string;
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  locale?: string;
  timezone?: string;
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

export type SupoMessage = {
  id?: string;
  role: "customer" | "ai" | "agent" | "system" | "typing";
  body: string;
  createdAt?: string;
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
