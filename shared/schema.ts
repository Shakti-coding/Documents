import { pgTable, serial, varchar, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Database tables
export const downloads = pgTable("downloads", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  messageId: integer("message_id").notNull(),
  originalFilename: varchar("original_filename").notNull(),
  filePath: varchar("file_path"),
  url: text("url"),
  fileType: varchar("file_type").notNull(),
  fileSize: integer("file_size"),
  status: varchar("status").notNull().default("pending"), // pending, downloading, completed, failed
  progress: integer("progress").default(0),
  error: text("error"),
  downloadDate: timestamp("download_date").defaultNow(),
  updateDate: timestamp("update_date"),
});

export const pendingMessages = pgTable("pending_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  messageId: integer("message_id").notNull(),
  messageType: varchar("message_type").notNull(), // download, command, youtube
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const botSessions = pgTable("bot_sessions", {
  id: serial("id").primaryKey(),
  botId: varchar("bot_id").notNull().unique(),
  sessionString: text("session_string").notNull(),
  config: jsonb("config").notNull(),
  status: varchar("status").notNull().default("inactive"), // active, inactive, error
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const githubSettings = pgTable("github_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  personalAccessToken: text("personal_access_token"),
  isDefault: boolean("is_default").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gitTokenConfigs = pgTable("git_token_configs", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 100 }).notNull(),
  tokenHash: text("token_hash").notNull(), // Hashed PAT for security
  scopes: text("scopes").array(), // Available GitHub scopes
  createdAt: timestamp("created_at").defaultNow(),
  lastUsed: timestamp("last_used"),
});

export const gitRepositories = pgTable("git_repositories", {
  id: serial("id").primaryKey(),
  owner: varchar("owner", { length: 100 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  private: boolean("private").default(false),
  description: text("description"),
  defaultBranch: varchar("default_branch").default("main"),
  homepage: text("homepage"),
  topics: text("topics").array(),
  cachedAt: timestamp("cached_at").defaultNow(),
});

// TextMemo tables
export const textMemos = pgTable("text_memos", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  hint: text("hint"),
  content: text("content").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

// Live Cloning tables
export const liveCloningInstances = pgTable("live_cloning_instances", {
  id: serial("id").primaryKey(),
  instanceId: varchar("instance_id").notNull().unique(),
  sessionString: text("session_string").notNull(),
  config: jsonb("config").notNull(),
  status: varchar("status").notNull().default("inactive"), // active, inactive, error
  botEnabled: boolean("bot_enabled").default(true),
  filterWords: boolean("filter_words").default(true),
  addSignature: boolean("add_signature").default(false),
  signature: text("signature"),
  lastError: text("last_error"),
  processedMessages: integer("processed_messages").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const entityLinks = pgTable("entity_links", {
  id: serial("id").primaryKey(),
  instanceId: varchar("instance_id").notNull(),
  fromEntity: text("from_entity").notNull(), // Chat ID or username
  toEntity: text("to_entity").notNull(), // Chat ID or username
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wordFilters = pgTable("word_filters", {
  id: serial("id").primaryKey(),
  instanceId: varchar("instance_id").notNull(),
  fromWord: text("from_word").notNull(),
  toWord: text("to_word").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const liveCloningMessages = pgTable("live_cloning_messages", {
  id: serial("id").primaryKey(),
  instanceId: varchar("instance_id").notNull(),
  baseEntity: text("base_entity").notNull(),
  baseMessageId: integer("base_message_id").notNull(),
  targetEntity: text("target_entity").notNull(),
  targetMessageId: integer("target_message_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Console logs table for real-time logging
export const consoleLogs = pgTable("console_logs", {
  id: serial("id").primaryKey(),
  level: varchar("level").notNull(), // DEBUG, INFO, WARN, ERROR
  message: text("message").notNull(),
  source: varchar("source").default("application"), // application, bot, system
  metadata: jsonb("metadata"), // Additional context like user ID, bot ID, etc.
  timestamp: timestamp("timestamp").defaultNow(),
});

// Zod schemas for validation
export const telegramSessionSchema = z.object({
  sessionString: z.string(),
  apiId: z.number(),
  apiHash: z.string(),
  phoneNumber: z.string(),
  userId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const chatSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['channel', 'group', 'private']),
  participantCount: z.number().optional(),
  username: z.string().optional(),
  accessHash: z.string().optional(),
});

export const messageSchema = z.object({
  id: z.number(),
  chatId: z.string(),
  text: z.string().optional(),
  date: z.string(),
  senderId: z.string().optional(),
  senderName: z.string().optional(),
  hasMedia: z.boolean(),
  mediaType: z.string().optional(),
  mediaSize: z.number().optional(),
  mediaFileName: z.string().optional(),
});

export const downloadItemSchema = z.object({
  id: z.string(),
  messageId: z.number(),
  chatId: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  progress: z.number(),
  status: z.enum(['pending', 'downloading', 'completed', 'failed', 'cancelled', 'paused']),
  downloadPath: z.string().optional(),
  speed: z.number().optional(),
});

export const searchParamsSchema = z.object({
  chatId: z.string().optional(),
  query: z.string().optional(),
  messageId: z.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  similarityThreshold: z.number().min(0).max(100).default(70),
  hasMedia: z.boolean().optional(),
  searchInWholeMessage: z.boolean().optional(),
});

export const forwardConfigSchema = z.object({
  name: z.string().min(1, "Configuration name is required"),
  fromChatId: z.string().min(1, "Source chat is required"),
  toChatId: z.string().min(1, "Destination chat is required"),
  offsetFrom: z.number().min(0).default(0),
  offsetTo: z.number().min(0).default(0),
});

export const forwardJobSchema = z.object({
  id: z.string(),
  config: forwardConfigSchema,
  status: z.enum(['idle', 'running', 'paused', 'completed', 'error']),
  currentOffset: z.number(),
  progress: z.number().min(0).max(100),
  logs: z.array(z.string()),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Git Control Schemas
export const gitTokenConfigSchema = z.object({
  id: z.number().optional(),
  label: z.string().min(1, "Label is required").max(100),
  maskedToken: z.string().optional(), // For display only
  scopes: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  lastUsed: z.string().optional(),
});

export const repoRefSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  private: z.boolean().default(false),
});

export const branchInfoSchema = z.object({
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  protected: z.boolean().default(false),
  sha: z.string().optional(),
});

export const branchProtectionRuleSchema = z.object({
  requiredStatusChecks: z.object({
    contexts: z.array(z.string()),
  }).optional(),
  enforceAdmins: z.boolean().optional(),
  requiredPullRequestReviews: z.object({
    requiredApprovingReviewCount: z.number().min(0).max(6).default(1),
  }).optional(),
});

export const webhookConfigSchema = z.object({
  id: z.number().optional(),
  url: z.string().url("Invalid webhook URL"),
  contentType: z.enum(['json', 'form']).default('json'),
  events: z.array(z.string()).default(['push']),
  active: z.boolean().default(true),
});

export const collaboratorSchema = z.object({
  login: z.string().min(1),
  permission: z.enum(['pull', 'triage', 'push', 'maintain', 'admin']),
  avatarUrl: z.string().optional(),
  type: z.enum(['User', 'Bot']).optional(),
});

export const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().optional(),
  head: z.string(),
  base: z.string(),
  state: z.enum(['open', 'closed', 'draft']),
  user: z.object({
    login: z.string(),
    avatarUrl: z.string().optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const commitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
    date: z.string(),
  }),
  committer: z.object({
    name: z.string(),
    email: z.string(),
    date: z.string(),
  }),
  htmlUrl: z.string().optional(),
});

export const repoSettingsSchema = z.object({
  description: z.string().max(350).optional(),
  homepage: z.string().url().optional().or(z.literal('')),
  topics: z.array(z.string()).max(20).optional(),
  defaultBranch: z.string().min(1).optional(),
  hasIssues: z.boolean().optional(),
  hasWiki: z.boolean().optional(),
  hasPages: z.boolean().optional(),
});

// Live Cloning schemas
export const liveCloningInstanceSchema = z.object({
  id: z.number().optional(),
  instanceId: z.string(),
  sessionString: z.string().min(1, "Session string is required"),
  config: z.record(z.any()),
  status: z.enum(['active', 'inactive', 'error']),
  botEnabled: z.boolean().default(true),
  filterWords: z.boolean().default(true),
  addSignature: z.boolean().default(false),
  signature: z.string().optional(),
  lastError: z.string().optional(),
  processedMessages: z.number().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const entityLinkSchema = z.object({
  id: z.number().optional(),
  instanceId: z.string(),
  fromEntity: z.string().min(1, "Source entity is required"),
  toEntity: z.string().min(1, "Target entity is required"),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
});

export const wordFilterSchema = z.object({
  id: z.number().optional(),
  instanceId: z.string(),
  fromWord: z.string().min(1, "Source word is required"),
  toWord: z.string().min(1, "Target word is required"),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
});

export const liveCloningMessageSchema = z.object({
  id: z.number().optional(),
  instanceId: z.string(),
  baseEntity: z.string(),
  baseMessageId: z.number(),
  targetEntity: z.string(),
  targetMessageId: z.number(),
  createdAt: z.string().optional(),
});

export const liveCloningStatusSchema = z.object({
  running: z.boolean(),
  instanceId: z.string().optional(),
  lastActivity: z.string().nullable(),
  processedMessages: z.number(),
  totalLinks: z.number(),
  currentUserInfo: z.object({
    id: z.number(),
    username: z.string(),
    firstName: z.string(),
  }).optional(),
  sessionValid: z.boolean(),
  botEnabled: z.boolean(),
  filterWords: z.boolean(),
  addSignature: z.boolean(),
  signature: z.string().optional(),
});

// Create insert schemas
export const insertDownloadSchema = createInsertSchema(downloads);
export const insertPendingMessageSchema = createInsertSchema(pendingMessages);
export const insertBotSessionSchema = createInsertSchema(botSessions);
export const insertGithubSettingsSchema = createInsertSchema(githubSettings).omit({ id: true, updatedAt: true });
export const insertGitTokenConfigSchema = createInsertSchema(gitTokenConfigs).omit({ id: true, createdAt: true, lastUsed: true });
export const insertGitRepositorySchema = createInsertSchema(gitRepositories).omit({ id: true, cachedAt: true });

// TextMemo insert schema
export const insertTextMemoSchema = createInsertSchema(textMemos).omit({ id: true, createdAt: true });

// Console logs insert schema
export const insertConsoleLogSchema = createInsertSchema(consoleLogs).omit({ id: true, timestamp: true });

// Live Cloning insert schemas
export const insertLiveCloningInstanceSchema = createInsertSchema(liveCloningInstances).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEntityLinkSchema = createInsertSchema(entityLinks).omit({ id: true, createdAt: true });
export const insertWordFilterSchema = createInsertSchema(wordFilters).omit({ id: true, createdAt: true });
export const insertLiveCloningMessageSchema = createInsertSchema(liveCloningMessages).omit({ id: true, createdAt: true });

// Git Control insert schemas
export const secureTokenSchema = z.object({
  label: z.string().min(1, "Label is required").max(100),
  token: z.string().min(1, "Token is required"), // Raw token for server-side processing
});

// Types
export type Download = typeof downloads.$inferSelect;
export type PendingMessage = typeof pendingMessages.$inferSelect;
export type BotSession = typeof botSessions.$inferSelect;
export type GitHubSettings = typeof githubSettings.$inferSelect;
export type GitTokenConfig = typeof gitTokenConfigs.$inferSelect;
export type GitRepository = typeof gitRepositories.$inferSelect;
export type TextMemo = typeof textMemos.$inferSelect;
export type ConsoleLog = typeof consoleLogs.$inferSelect;

// Live Cloning types
export type LiveCloningInstance = typeof liveCloningInstances.$inferSelect;
export type EntityLink = typeof entityLinks.$inferSelect;
export type WordFilter = typeof wordFilters.$inferSelect;
export type LiveCloningMessage = typeof liveCloningMessages.$inferSelect;

export type InsertDownload = z.infer<typeof insertDownloadSchema>;
export type InsertPendingMessage = z.infer<typeof insertPendingMessageSchema>;
export type InsertBotSession = z.infer<typeof insertBotSessionSchema>;
export type InsertGitHubSettings = z.infer<typeof insertGithubSettingsSchema>;
export type InsertGitTokenConfig = z.infer<typeof insertGitTokenConfigSchema>;
export type InsertGitRepository = z.infer<typeof insertGitRepositorySchema>;
export type InsertTextMemo = z.infer<typeof insertTextMemoSchema>;
export type InsertConsoleLog = z.infer<typeof insertConsoleLogSchema>;

// Live Cloning insert types
export type InsertLiveCloningInstance = z.infer<typeof insertLiveCloningInstanceSchema>;
export type InsertEntityLink = z.infer<typeof insertEntityLinkSchema>;
export type InsertWordFilter = z.infer<typeof insertWordFilterSchema>;
export type InsertLiveCloningMessage = z.infer<typeof insertLiveCloningMessageSchema>;

export type TelegramSession = z.infer<typeof telegramSessionSchema>;
export type Chat = z.infer<typeof chatSchema>;
export type Message = z.infer<typeof messageSchema>;
export type DownloadItem = z.infer<typeof downloadItemSchema>;
export type SearchParams = z.infer<typeof searchParamsSchema>;
export type ForwardConfig = z.infer<typeof forwardConfigSchema>;
export type ForwardJob = z.infer<typeof forwardJobSchema>;

// Git Control types
export type GitTokenConfigType = z.infer<typeof gitTokenConfigSchema>;
export type RepoRef = z.infer<typeof repoRefSchema>;
export type BranchInfo = z.infer<typeof branchInfoSchema>;
export type BranchProtectionRule = z.infer<typeof branchProtectionRuleSchema>;
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
export type Collaborator = z.infer<typeof collaboratorSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type Commit = z.infer<typeof commitSchema>;
export type RepoSettings = z.infer<typeof repoSettingsSchema>;
export type SecureToken = z.infer<typeof secureTokenSchema>;

// Live Cloning schema types
export type LiveCloningInstanceType = z.infer<typeof liveCloningInstanceSchema>;
export type EntityLinkType = z.infer<typeof entityLinkSchema>;
export type WordFilterType = z.infer<typeof wordFilterSchema>;
export type LiveCloningMessageType = z.infer<typeof liveCloningMessageSchema>;
export type LiveCloningStatus = z.infer<typeof liveCloningStatusSchema>;
