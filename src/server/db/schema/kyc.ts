import {
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

const createTable = pgTableCreator((name) => `blog_${name}`);

/** One-time wallet challenge; the signed nonce prevents a browser from binding another wallet to a user session. */
export const kycChallenges = createTable(
  'kyc_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletAddress: text('wallet_address').notNull(),
    nonce: text('nonce').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [uniqueIndex('kyc_challenge_nonce_idx').on(table.nonce)]
);

/** Minimal verification state only; documents and raw PII stay with Sumsub. */
export const kycApplications = createTable(
  'kyc_applications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletAddress: text('wallet_address').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    applicantId: text('applicant_id'),
    levelName: text('level_name').notNull(),
    status: text('status').notNull(),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('kyc_application_wallet_idx').on(table.walletAddress),
    uniqueIndex('kyc_application_provider_user_idx').on(table.providerUserId),
  ]
);

/** Provider webhook body digest gives replay-safe delivery accounting without storing raw PII payloads. */
export const kycWebhookEvents = createTable(
  'kyc_webhook_events',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => kycApplications.id, { onDelete: 'cascade' }),
    payloadHash: text('payload_hash').notNull(),
    type: text('type').notNull(),
    receivedAt: timestamp('received_at').notNull(),
  },
  (table) => [uniqueIndex('kyc_webhook_payload_hash_idx').on(table.payloadHash)]
);
