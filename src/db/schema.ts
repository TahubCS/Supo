import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: text("impersonated_by"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// Relations for experimental joins (2-3x query performance improvement)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
  assignedConversations: many(conversation),
  sentMessages: many(message),
  reviewedKnowledgeSuggestions: many(knowledgeSuggestion),
  securityEvents: many(securityEvent),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => user.id),
    targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
    targetOrganizationId: text("target_organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    metadata: text("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("admin_audit_log_admin_created_idx").on(table.adminUserId, table.createdAt),
    index("admin_audit_log_target_user_idx").on(table.targetUserId),
  ],
);

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  adminUser: one(user, {
    fields: [adminAuditLog.adminUserId],
    references: [user.id],
  }),
  targetUser: one(user, {
    fields: [adminAuditLog.targetUserId],
    references: [user.id],
  }),
  targetOrganization: one(organization, {
    fields: [adminAuditLog.targetOrganizationId],
    references: [organization.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  products: many(product),
  customers: many(customer),
  securityEvents: many(securityEvent),
}));

export const memberRelations = relations(member, ({ one }) => ({
  user: one(user, { fields: [member.userId], references: [user.id] }),
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, { fields: [invitation.inviterId], references: [user.id] }),
}));

export const product = pgTable("product", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"),
  url: text("url"),
  embeddingModel: text("embedding_model"), // locked on first index, never changed
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const productRelations = relations(product, ({ one, many }) => ({
  organization: one(organization, {
    fields: [product.organizationId],
    references: [organization.id],
  }),
  widgetConfigs: many(widgetConfig),
  conversations: many(conversation),
  knowledgeSources: many(knowledgeSource),
  knowledgeSuggestions: many(knowledgeSuggestion),
  securityEvents: many(securityEvent),
}));

export const securityEvent = pgTable(
  "security_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    severity: text("severity").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    path: text("path"),
    method: text("method"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("security_event_created_idx").on(table.createdAt),
    index("security_event_user_created_idx").on(table.userId, table.createdAt),
    index("security_event_product_created_idx").on(table.productId, table.createdAt),
    index("security_event_severity_created_idx").on(table.severity, table.createdAt),
  ],
);

export const securityEventRelations = relations(securityEvent, ({ one }) => ({
  user: one(user, {
    fields: [securityEvent.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [securityEvent.organizationId],
    references: [organization.id],
  }),
  product: one(product, {
    fields: [securityEvent.productId],
    references: [product.id],
  }),
}));

export const widgetConfig = pgTable("widget_config", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .unique()
    .references(() => product.id, { onDelete: "cascade" }),
  botName: text("bot_name").notNull().default("Support"),
  greeting: text("greeting")
    .notNull()
    .default("Hi there! How can I help you today?"),
  position: text("position").notNull().default("bottom-right"),
  theme: text("theme").notNull().default("dark"),
  accentColor: text("accent_color").notNull().default("#18181b"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const widgetConfigRelations = relations(widgetConfig, ({ one }) => ({
  product: one(product, {
    fields: [widgetConfig.productId],
    references: [product.id],
  }),
}));

export const customer = pgTable("customer", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const customerRelations = relations(customer, ({ one, many }) => ({
  organization: one(organization, {
    fields: [customer.organizationId],
    references: [organization.id],
  }),
  conversations: many(conversation),
}));

export const conversation = pgTable("conversation", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  customerId: text("customer_id")
    .notNull()
    .references(() => customer.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("open"),
  assigneeId: text("assignee_id").references(() => user.id, {
    onDelete: "set null",
  }),
  aiHandled: boolean("ai_handled").notNull().default(true),
  escalationStatus: text("escalation_status"), // null | "pending" | "active"
  escalatedAt: timestamp("escalated_at"),
  subject: text("subject"),
  lastMessageAt: timestamp("last_message_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  product: one(product, {
    fields: [conversation.productId],
    references: [product.id],
  }),
  customer: one(customer, {
    fields: [conversation.customerId],
    references: [customer.id],
  }),
  assignee: one(user, {
    fields: [conversation.assigneeId],
    references: [user.id],
  }),
  messages: many(message),
  knowledgeSuggestions: many(knowledgeSuggestion),
}));

export const message = pgTable("message", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  senderType: text("sender_type").notNull(),
  senderId: text("sender_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull(),
});

export const messageRelations = relations(message, ({ one }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id],
  }),
  sender: one(user, {
    fields: [message.senderId],
    references: [user.id],
  }),
}));

export const knowledgeSource = pgTable("knowledge_source", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "article" | "url" | "github" | "conversation" | "sitemap"
  name: text("name").notNull(),
  url: text("url"),
  content: text("content"),
  status: text("status").notNull().default("pending"), // "pending" | "indexing" | "indexed" | "error"
  errorMessage: text("error_message"),
  chunkCount: integer("chunk_count").notNull().default(0),
  contentHash: text("content_hash"),     // SHA-256 of last fetched content; set after each index
  lastCheckedAt: timestamp("last_checked_at"), // last time content was fetched and compared
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const knowledgeSourceRelations = relations(knowledgeSource, ({ one, many }) => ({
  product: one(product, {
    fields: [knowledgeSource.productId],
    references: [product.id],
  }),
  chunks: many(knowledgeChunk),
  approvedSuggestions: many(knowledgeSuggestion),
}));

export const knowledgeSuggestion = pgTable(
  "knowledge_suggestion",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    sourceConversationId: text("source_conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    approvedSourceId: text("approved_source_id").references(() => knowledgeSource.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
    kind: text("kind").notNull().default("faq"), // "faq" | "gap"
    confidence: integer("confidence").notNull().default(0),
    question: text("question").notNull(),
    answer: text("answer"),
    content: text("content"),
    reason: text("reason"),
    reviewNote: text("review_note"),
    reviewedById: text("reviewed_by_id").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("knowledge_suggestion_product_status_idx").on(table.productId, table.status),
  ],
);

export const knowledgeSuggestionRelations = relations(knowledgeSuggestion, ({ one }) => ({
  product: one(product, {
    fields: [knowledgeSuggestion.productId],
    references: [product.id],
  }),
  sourceConversation: one(conversation, {
    fields: [knowledgeSuggestion.sourceConversationId],
    references: [conversation.id],
  }),
  approvedSource: one(knowledgeSource, {
    fields: [knowledgeSuggestion.approvedSourceId],
    references: [knowledgeSource.id],
  }),
  reviewedBy: one(user, {
    fields: [knowledgeSuggestion.reviewedById],
    references: [user.id],
  }),
}));

export const knowledgeChunk = pgTable("knowledge_chunk", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => knowledgeSource.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  metadata: text("metadata"), // JSON: { title, url, chunkIndex }
  createdAt: timestamp("created_at").notNull(),
});

export const knowledgeChunkRelations = relations(knowledgeChunk, ({ one }) => ({
  source: one(knowledgeSource, {
    fields: [knowledgeChunk.sourceId],
    references: [knowledgeSource.id],
  }),
  product: one(product, {
    fields: [knowledgeChunk.productId],
    references: [product.id],
  }),
}));
