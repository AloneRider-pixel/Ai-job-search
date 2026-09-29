import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ]
);

export const profiles = pgTable(
  "profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }),
    name: varchar("name", { length: 160 }).notNull(),
    headline: varchar("headline", { length: 240 }),
    summary: text("summary"),
    location: varchar("location", { length: 160 }),
    targetRoles: jsonb("target_roles").$type<string[]>().default([]).notNull(),
    targetLocations: jsonb("target_locations").$type<string[]>().default([]).notNull(),
    skills: jsonb("skills").$type<string[]>().default([]).notNull(),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("profiles_email_idx").on(table.email),
    uniqueIndex("profiles_user_idx").on(table.userId),
  ]
);

export const profileExperiences = pgTable(
  "profile_experiences",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    company: varchar("company", { length: 180 }).notNull(),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    bullets: jsonb("bullets").$type<string[]>().default([]).notNull(),
    technologies: jsonb("technologies").$type<string[]>().default([]).notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [index("profile_experience_profile_idx").on(table.profileId)]
);

export const resumeDocuments = pgTable(
  "resume_documents",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }),
    sourceType: varchar("source_type", { length: 40 }).default("text").notNull(),
    mimeType: varchar("mime_type", { length: 160 }),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    rawText: text("raw_text").notNull(),
    parsedData: jsonb("parsed_data").$type<Record<string, unknown>>().default({}).notNull(),
    isMaster: boolean("is_master").default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("resume_documents_profile_hash_idx").on(table.profileId, table.fileHash),
    index("resume_documents_profile_idx").on(table.profileId),
    index("resume_documents_master_idx").on(table.profileId, table.isMaster),
  ]
);

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 80 }).notNull(),
    externalId: varchar("external_id", { length: 240 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    company: varchar("company", { length: 240 }).notNull(),
    location: varchar("location", { length: 240 }),
    employmentType: varchar("employment_type", { length: 80 }),
    applyUrl: text("apply_url"),
    sourceUrl: text("source_url"),
    description: text("description").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("jobs_source_external_idx").on(table.source, table.externalId),
    index("jobs_active_posted_idx").on(table.isActive, table.postedAt),
  ]
);

export const jobAnalyses = pgTable(
  "job_analyses",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    fitScore: integer("fit_score").notNull(),
    confidence: integer("confidence").notNull(),
    hardRequirements: jsonb("hard_requirements").$type<Record<string, unknown>[]>().default([]).notNull(),
    strengths: jsonb("strengths").$type<string[]>().default([]).notNull(),
    gaps: jsonb("gaps").$type<string[]>().default([]).notNull(),
    blockers: jsonb("blockers").$type<string[]>().default([]).notNull(),
    recommendation: varchar("recommendation", { length: 40 }).notNull(),
    model: varchar("model", { length: 160 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("job_analyses_job_profile_idx").on(table.jobId, table.profileId),
    index("job_analyses_profile_score_idx").on(table.profileId, table.fitScore),
  ]
);

export const applicationPackages = pgTable(
  "application_packages",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    status: varchar("status", { length: 40 }).default("draft").notNull(),
    fitScore: integer("fit_score"),
    resumeText: text("resume_text"),
    resumeFileUrl: text("resume_file_url"),
    coverLetter: text("cover_letter"),
    outreachDraft: text("outreach_draft"),
    requirementMatrix: jsonb("requirement_matrix").$type<Record<string, unknown>[]>().default([]).notNull(),
    learningPlan: jsonb("learning_plan").$type<Record<string, unknown>[]>().default([]).notNull(),
    nextActions: jsonb("next_actions").$type<string[]>().default([]).notNull(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("application_packages_job_profile_version_idx").on(table.jobId, table.profileId, table.version),
    index("application_packages_profile_status_idx").on(table.profileId, table.status),
  ]
);

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    packageId: integer("package_id").references(() => applicationPackages.id, { onDelete: "set null" }),
    stage: varchar("stage", { length: 40 }).default("wishlist").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    notes: text("notes"),
    outcome: varchar("outcome", { length: 80 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("applications_profile_job_idx").on(table.profileId, table.jobId),
    index("applications_profile_stage_idx").on(table.profileId, table.stage),
  ]
);

export const recruiterContacts = pgTable(
  "recruiter_contacts",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    company: varchar("company", { length: 240 }).notNull(),
    name: varchar("name", { length: 180 }),
    role: varchar("role", { length: 180 }),
    profileUrl: text("profile_url"),
    email: varchar("email", { length: 320 }),
    source: varchar("source", { length: 120 }),
    providerPersonId: varchar("provider_person_id", { length: 160 }),
    verificationState: varchar("verification_state", { length: 40 }).default("unverified").notNull(),
    approvalState: varchar("approval_state", { length: 40 }).default("candidate").notNull(),
    confidence: integer("confidence").default(0).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [
    index("recruiter_contacts_profile_idx").on(table.profileId),
    index("recruiter_contacts_company_idx").on(table.company),
    index("recruiter_contacts_profile_job_idx").on(table.profileId, table.jobId),
    index("recruiter_contacts_provider_person_idx").on(table.source, table.providerPersonId),
  ]
);

export const mailboxConnections = pgTable(
  "mailbox_connections",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 320 }).notNull(),
    accountEmail: varchar("account_email", { length: 320 }).notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
    syncCursor: text("sync_cursor"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    status: varchar("status", { length: 40 }).default("connected").notNull(),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("mailbox_connections_profile_provider_account_idx").on(table.profileId, table.provider, table.providerAccountId),
    index("mailbox_connections_profile_idx").on(table.profileId),
  ]
);

export const oauthStates = pgTable(
  "oauth_states",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    stateHash: varchar("state_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("oauth_states_hash_idx").on(table.stateHash),
    index("oauth_states_user_idx").on(table.userId),
    index("oauth_states_expiry_idx").on(table.expiresAt),
  ]
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    connectionId: integer("connection_id").notNull().references(() => mailboxConnections.id, { onDelete: "cascade" }),
    providerMessageId: varchar("provider_message_id", { length: 320 }).notNull(),
    threadId: varchar("thread_id", { length: 320 }),
    direction: varchar("direction", { length: 20 }).notNull(),
    subject: text("subject"),
    fromEmail: varchar("from_email", { length: 320 }),
    toEmails: jsonb("to_emails").$type<string[]>().default([]).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("email_messages_connection_provider_id_idx").on(table.connectionId, table.providerMessageId),
    index("email_messages_profile_received_idx").on(table.profileId, table.receivedAt),
    index("email_messages_profile_thread_idx").on(table.profileId, table.threadId),
  ]
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => applications.id, { onDelete: "set null" }),
    messageId: integer("message_id").notNull().references(() => emailMessages.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    confidence: integer("confidence").notNull(),
    evidence: jsonb("evidence").$type<string[]>().default([]).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("application_events_message_type_idx").on(table.messageId, table.eventType),
    index("application_events_profile_time_idx").on(table.profileId, table.occurredAt),
  ]
);

export const outreachSequences = pgTable(
  "outreach_sequences",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => applications.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 40 }).default("draft").notNull(),
    currentStep: integer("current_step").default(0).notNull(),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    stopReason: text("stop_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("outreach_sequences_profile_application_idx").on(table.profileId, table.applicationId),
    index("outreach_sequences_due_idx").on(table.status, table.nextActionAt),
  ]
);

export const outreachMessages = pgTable(
  "outreach_messages",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    applicationId: integer("application_id").references(() => applications.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => recruiterContacts.id, { onDelete: "set null" }),
    channel: varchar("channel", { length: 40 }).notNull(),
    status: varchar("status", { length: 40 }).default("draft").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    providerMessageId: varchar("provider_message_id", { length: 320 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    replyAt: timestamp("reply_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    index("outreach_messages_application_idx").on(table.applicationId),
    index("outreach_messages_profile_status_idx").on(table.profileId, table.status),
  ]
);

export const learningTasks = pgTable(
  "learning_tasks",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    skill: varchar("skill", { length: 160 }).notNull(),
    priority: integer("priority").default(50).notNull(),
    status: varchar("status", { length: 40 }).default("planned").notNull(),
    resourceUrl: text("resource_url"),
    practiceTask: text("practice_task"),
    masteryScore: integer("mastery_score").default(0).notNull(),
    ...timestamps,
  },
  (table) => [index("learning_tasks_profile_status_idx").on(table.profileId, table.status)]
);
