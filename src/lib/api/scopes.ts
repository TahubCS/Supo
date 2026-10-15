// Client-safe API scope definitions.

export const API_SCOPES = [
  "conversations:read",
  "conversations:write",
  "customers:read",
  "customers:write",
  "knowledge:read",
  "knowledge:write",
  "articles:read",
  "articles:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "conversations:read": "Read conversations and messages",
  "conversations:write": "Update conversations and post messages",
  "customers:read": "Read customers and export their data",
  "customers:write": "Create, update and erase customers",
  "knowledge:read": "Search the knowledge base and list sources",
  "knowledge:write": "Add, re-index and delete knowledge sources",
  "articles:read": "Read help center articles",
  "articles:write": "Create, update, publish and delete articles",
};
