// Ably channel names, shared by server publishers and browser subscribers.
// Every channel is scoped by organization AND product so a token's capability
// can be limited to exactly one product (no cross-product reads).

export function productChannelPrefix(orgId: string, productId: string) {
  return `org:${orgId}:product:${productId}`;
}

export function conversationChannelName(orgId: string, productId: string, convId: string) {
  return `${productChannelPrefix(orgId, productId)}:conversation:${convId}`;
}

// Capability pattern matching every conversation channel of one product.
export function productConversationsChannelPattern(orgId: string, productId: string) {
  return `${productChannelPrefix(orgId, productId)}:conversation:*`;
}

export function inboxChannelName(orgId: string, productId: string) {
  return `${productChannelPrefix(orgId, productId)}:inbox`;
}

export function presenceChannelName(orgId: string, productId: string) {
  return `${productChannelPrefix(orgId, productId)}:presence`;
}
