export const WIDGET_API_ROUTES = {
  config: "/api/widget/config",
  messages: "/api/widget/messages",
  escalations: "/api/widget/escalations",
  poll: "/api/widget/messages/poll",
  realtimeToken: "/api/widget/realtime/token",
} as const;

export const LEGACY_WIDGET_API_ROUTES = {
  configAndMessages: "/api/chat",
  escalations: "/api/chat/escalate",
  poll: "/api/messages/poll",
  realtimeToken: "/api/ably/token",
} as const;
