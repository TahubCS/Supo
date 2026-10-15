import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export type MessageSource = { title: string; url: string | null };

export const productRoleEnum = pgEnum("product_role", ["admin", "developer", "agent"]);
export const productInvitationStatusEnum = pgEnum("product_invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

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
  productMembers: many(productMember),
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
  // "manual" | "round_robin": how escalated conversations are assigned.
  routingMode: text("routing_mode").notNull().default("manual"),
  // Round-robin skips agents already handling this many active conversations.
  maxConcurrentChats: integer("max_concurrent_chats").notNull().default(5),
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
  members: many(productMember),
  invitations: many(productInvitation),
  knowledgeSources: many(knowledgeSource),
  knowledgeSuggestions: many(knowledgeSuggestion),
  securityEvents: many(securityEvent),
}));

export const productMember = pgTable(
  "product_member",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: productRoleEnum("role").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("product_member_product_user_idx").on(table.productId, table.userId),
    index("product_member_user_idx").on(table.userId),
    index("product_member_product_role_idx").on(table.productId, table.role),
  ],
);

export const productInvitation = pgTable(
  "product_invitation",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: productRoleEnum("role").notNull(),
    status: productInvitationStatusEnum("status").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("product_invitation_product_email_idx").on(table.productId, table.email),
    index("product_invitation_product_status_idx").on(table.productId, table.status),
    index("product_invitation_email_idx").on(table.email),
  ],
);

export const productMemberRelations = relations(productMember, ({ one }) => ({
  product: one(product, {
    fields: [productMember.productId],
    references: [product.id],
  }),
  user: one(user, { fields: [productMember.userId], references: [user.id] }),
}));

export const productInvitationRelations = relations(productInvitation, ({ one }) => ({
  product: one(product, {
    fields: [productInvitation.productId],
    references: [product.id],
  }),
  inviter: one(user, { fields: [productInvitation.inviterId], references: [user.id] }),
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
  launcherLabel: text("launcher_label").notNull().default("Support"),
  launcherStyle: text("launcher_style").notNull().default("icon"),
  panelSize: text("panel_size").notNull().default("standard"),
  borderRadius: text("border_radius").notNull().default("rounded"),
  introTitle: text("intro_title").notNull().default("Start a conversation"),
  introDescription: text("intro_description")
    .notNull()
    .default("Enter your details so we can help you."),
  inputPlaceholder: text("input_placeholder").notNull().default("Ask a question..."),
  agentHandoffLabel: text("agent_handoff_label").notNull().default("Speak to an Agent"),
  showPoweredBy: boolean("show_powered_by").notNull().default(true),
  // Browser origins allowed to call the public widget API. Empty = any origin.
  allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'::text[]`),
  // Seconds a customer waits for an agent before being told the team will follow up by email.
  handoffTimeoutSec: integer("handoff_timeout_sec").notNull().default(300),
  // HMAC-SHA256 secret for identity verification (customer.userHash). Null = disabled.
  identitySecret: text("identity_secret"),
  // "off" | "optional" | "required"
  identityVerification: text("identity_verification").notNull().default("off"),
  // Ask customers to rate the conversation when it is resolved.
  csatEnabled: boolean("csat_enabled").notNull().default(true),
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
  externalId: text("external_id"),
  name: text("name").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  locale: text("locale"),
  timezone: text("timezone"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
}, (table) => [
  uniqueIndex("customer_org_external_id_idx")
    .on(table.organizationId, table.externalId)
    .where(sql`${table.externalId} IS NOT NULL`),
]);

export const customerRelations = relations(customer, ({ one, many }) => ({
  organization: one(organization, {
    fields: [customer.organizationId],
    references: [organization.id],
  }),
  conversations: many(conversation),
}));

export const conversation = pgTable(
  "conversation",
  {
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
    // "customer_request" | "repeated_unanswered" | "frustration" | "agent" | ...
    handoffReason: text("handoff_reason"),
    // Consecutive substantive customer questions the knowledge base could not answer.
    unansweredStreak: integer("unanswered_streak").notNull().default(0),
    // Short AI summary for the agent picking up the conversation.
    aiSummary: text("ai_summary"),
    // Set when the "we'll follow up by email" notice was posted after a handoff wait.
    handoffTimeoutNotifiedAt: timestamp("handoff_timeout_notified_at"),
    // Email to follow up on when the customer leaves before an agent replies.
    followUpEmail: text("follow_up_email"),
    customerLastSeenAt: timestamp("customer_last_seen_at"),
    customerNotifiedAt: timestamp("customer_notified_at"),
    identityVerified: boolean("identity_verified").notNull().default(false),
    snoozedUntil: timestamp("snoozed_until"),
    resolvedAt: timestamp("resolved_at"),
    resolvedById: text("resolved_by_id").references(() => user.id, { onDelete: "set null" }),
    // "low" | "normal" | "high" | "urgent"
    priority: text("priority").notNull().default("normal"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // "widget" | "email" | "api"
    channel: text("channel").notNull().default("widget"),
    // First human reply after the conversation was handed off (SLA tracking).
    firstResponseAt: timestamp("first_response_at"),
    // SLA targets computed from the product's policy and business hours.
    firstResponseDueAt: timestamp("first_response_due_at"),
    resolutionDueAt: timestamp("resolution_due_at"),
    slaWarningSentAt: timestamp("sla_warning_sent_at"),
    publicAccessToken: text("public_access_token").notNull(),
    subject: text("subject"),
    lastMessageAt: timestamp("last_message_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("conversation_public_access_token_idx").on(table.publicAccessToken),
    // Used by the SLA breach-warning sweeper (migration 0023).
    index("conversation_first_response_due_idx")
      .on(table.firstResponseDueAt)
      .where(sql`${table.firstResponseAt} IS NULL AND ${table.firstResponseDueAt} IS NOT NULL`),
  ],
);

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
  // Knowledge citations attached to AI answers.
  sources: jsonb("sources").$type<MessageSource[]>(),
  // Monotonic cursor for lossless polling (timestamps can collide or commit out of order).
  seq: bigserial("seq", { mode: "number" }).notNull(),
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
  // Disabled sources stay indexed but are excluded from retrieval.
  enabled: boolean("enabled").notNull().default(true),
  indexingStartedAt: timestamp("indexing_started_at"),
  pageCount: integer("page_count").notNull().default(0),
  // Bumped on every edit/re-index request; an ingest only swaps chunks if the
  // revision it started from is still current.
  revision: integer("revision").notNull().default(0),
  // Crawl settings for website sources, e.g. { maxPages: 50 }.
  settings: jsonb("settings").$type<KnowledgeSourceSettings>(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export type KnowledgeSourceSettings = { maxPages?: number };

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
    // How many times customers asked this (gap suggestions are de-duplicated).
    hits: integer("hits").notNull().default(1),
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
  embeddingModel: text("embedding_model"),
  metadata: text("metadata"), // JSON: { title, url, headingPath, chunkIndex }
  // Keyword search vector maintained by Postgres (hybrid retrieval).
  contentTsv: tsvector("content_tsv").generatedAlwaysAs(sql`to_tsvector('english', content)`),
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

// Durable background work (knowledge indexing, notifications, webhooks).
// Jobs are claimed with FOR UPDATE SKIP LOCKED; see src/lib/jobs/queue.ts.
export const backgroundJob = pgTable(
  "background_job",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at").notNull(),
    lockedAt: timestamp("locked_at"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("background_job_status_run_at_idx").on(table.status, table.runAt),
    uniqueIndex("background_job_queued_dedupe_idx")
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} IS NOT NULL AND ${table.status} = 'queued'`),
  ],
);

// Canned responses ("macros") agents insert with "/" in the composer. Optional
// actions run when the macro is applied (set priority, add tags, resolve).
export type MacroActions = {
  status?: "resolved" | "snoozed";
  priority?: "low" | "normal" | "high" | "urgent";
  addTags?: string[];
};

export const macro = pgTable(
  "macro",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    shortcut: text("shortcut"),
    body: text("body").notNull(),
    actions: jsonb("actions").$type<MacroActions>(),
    usageCount: integer("usage_count").notNull().default(0),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("macro_product_idx").on(table.productId),
    uniqueIndex("macro_product_shortcut_idx")
      .on(table.productId, table.shortcut)
      .where(sql`${table.shortcut} IS NOT NULL`),
  ],
);

// Tenant-visible audit trail of changes inside a product.
export const productAuditLog = pgTable(
  "product_audit_log",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("product_audit_log_product_created_idx").on(table.productId, table.createdAt)],
);

export const businessHours = pgTable("business_hours", {
  productId: text("product_id")
    .primaryKey()
    .references(() => product.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  timezone: text("timezone").notNull().default("UTC"),
  // { mon: [{ start: "09:00", end: "17:00" }], ... }
  schedule: jsonb("schedule").$type<Record<string, { start: string; end: string }[]>>().notNull(),
  holidays: text("holidays").array().notNull().default(sql`'{}'::text[]`),
  updatedAt: timestamp("updated_at").notNull(),
});

// Per-priority SLA targets. No row for a priority = no SLA for it.
export const slaPolicy = pgTable(
  "sla_policy",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    priority: text("priority").notNull(),
    firstResponseMinutes: integer("first_response_minutes").notNull(),
    resolutionMinutes: integer("resolution_minutes"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [uniqueIndex("sla_policy_product_priority_idx").on(table.productId, table.priority)],
);

export const conversationRating = pgTable(
  "conversation_rating",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .unique()
      .references(() => conversation.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    // Agent who resolved the conversation (for per-agent CSAT).
    agentId: text("agent_id").references(() => user.id, { onDelete: "set null" }),
    score: integer("score").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("conversation_rating_product_created_idx").on(table.productId, table.createdAt)],
);

// ── Help center ─────────────────────────────────────────────────────────────

export const helpCenter = pgTable(
  "help_center",
  {
    productId: text("product_id")
      .primaryKey()
      .references(() => product.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    // Public URL: /help/{slug}
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [uniqueIndex("help_center_slug_idx").on(table.slug)],
);

export const articleCategory = pgTable(
  "article_category",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [uniqueIndex("article_category_product_slug_idx").on(table.productId, table.slug)],
);

export const article = pgTable(
  "article",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => articleCategory.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    bodyMd: text("body_md").notNull().default(""),
    status: text("status").notNull().default("draft"), // "draft" | "published"
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    // Published articles are mirrored into the knowledge base for the AI.
    knowledgeSourceId: text("knowledge_source_id").references(() => knowledgeSource.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at"),
    viewCount: integer("view_count").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),
    notHelpfulCount: integer("not_helpful_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('english', coalesce(body_md, '')), 'C')`,
    ),
  },
  (table) => [
    uniqueIndex("article_product_slug_idx").on(table.productId, table.slug),
    index("article_product_status_idx").on(table.productId, table.status),
  ],
);

export const articleVersion = pgTable(
  "article_version",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    bodyMd: text("body_md").notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("article_version_article_idx").on(table.articleId, table.createdAt)],
);

export const helpCenterRelations = relations(helpCenter, ({ one }) => ({
  product: one(product, { fields: [helpCenter.productId], references: [product.id] }),
}));

export const articleRelations = relations(article, ({ one, many }) => ({
  product: one(product, { fields: [article.productId], references: [product.id] }),
  category: one(articleCategory, { fields: [article.categoryId], references: [articleCategory.id] }),
  author: one(user, { fields: [article.authorId], references: [user.id] }),
  versions: many(articleVersion),
}));

export const articleVersionRelations = relations(articleVersion, ({ one }) => ({
  article: one(article, { fields: [articleVersion.articleId], references: [article.id] }),
  author: one(user, { fields: [articleVersion.authorId], references: [user.id] }),
}));
