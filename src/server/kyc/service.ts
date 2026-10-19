import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { kycApplications, kycChallenges } from '@/server/db/schema';

export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export const normalizeWallet = (wallet: string): string => wallet.toLowerCase();

export const providerUserId = (userId: string, wallet: string): string =>
  `carbonized:${userId}:${normalizeWallet(wallet)}`;

export const createChallenge = async (
  userId: string,
  walletAddress: string,
  nonce: string
) => {
  const db = getDb();
  const now = new Date();
  const challenge = {
    id: randomUUID(),
    userId,
    walletAddress: normalizeWallet(walletAddress),
    nonce,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
  };
  await db.insert(kycChallenges).values(challenge);
  return challenge;
};

export const getActiveChallenge = async (
  id: string,
  userId: string,
  walletAddress: string
) => {
  const db = getDb();
  const [challenge] = await db
    .select()
    .from(kycChallenges)
    .where(and(eq(kycChallenges.id, id), eq(kycChallenges.userId, userId)));
  if (!(challenge && !challenge.usedAt && challenge.expiresAt > new Date())) {
    return null;
  }
  if (challenge.walletAddress !== normalizeWallet(walletAddress)) {
    return null;
  }
  return challenge;
};

export const consumeChallenge = async (id: string, userId: string) => {
  const db = getDb();
  const updated = await db
    .update(kycChallenges)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(kycChallenges.id, id),
        eq(kycChallenges.userId, userId),
        isNull(kycChallenges.usedAt),
        gt(kycChallenges.expiresAt, new Date())
      )
    )
    .returning({ id: kycChallenges.id });
  return updated.length === 1;
};

export const createOrRefreshApplication = async (
  userId: string,
  walletAddress: string,
  levelName: string
) => {
  const db = getDb();
  const wallet = normalizeWallet(walletAddress);
  const now = new Date();
  const providerId = providerUserId(userId, wallet);
  const [existing] = await db
    .select()
    .from(kycApplications)
    .where(eq(kycApplications.walletAddress, wallet));
  if (existing && existing.userId !== userId) {
    throw new Error(
      'This wallet is already bound to another Carbonized account.'
    );
  }
  if (existing) {
    await db
      .update(kycApplications)
      .set({
        levelName,
        status: existing.status === 'approved' ? 'approved' : 'awaiting_user',
        updatedAt: now,
      })
      .where(eq(kycApplications.id, existing.id));
    return { ...existing, levelName, updatedAt: now };
  }
  const application = {
    id: randomUUID(),
    userId,
    walletAddress: wallet,
    providerUserId: providerId,
    levelName,
    status: 'awaiting_user',
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(kycApplications).values(application);
  return application;
};

export const getApplication = async (userId: string, walletAddress: string) => {
  const db = getDb();
  const [application] = await db
    .select()
    .from(kycApplications)
    .where(
      and(
        eq(kycApplications.userId, userId),
        eq(kycApplications.walletAddress, normalizeWallet(walletAddress))
      )
    );
  return application ?? null;
};

export const applyWebhook = async (
  rawBody: Buffer,
  type: string,
  providerId: string,
  applicantId: string | undefined,
  status: string
): Promise<'accepted' | 'duplicate' | 'unknown_applicant'> => {
  const db = getDb();
  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const [application] = await db
    .select({ id: kycApplications.id })
    .from(kycApplications)
    .where(eq(kycApplications.providerUserId, providerId));
  if (!application) {
    return 'unknown_applicant';
  }
  const now = new Date();
  const reviewedAt =
    status === 'approved' || status === 'rejected' ? now : null;
  const result = await db.execute(sql`
    WITH inserted AS (
      INSERT INTO "blog_kyc_webhook_events" ("id", "application_id", "payload_hash", "type", "received_at")
      VALUES (${randomUUID()}, ${application.id}, ${payloadHash}, ${type}, ${now})
      ON CONFLICT ("payload_hash") DO NOTHING
      RETURNING "id"
    ), updated AS (
      UPDATE "blog_kyc_applications"
      SET "applicant_id" = ${applicantId ?? null}, "status" = ${status},
          "reviewed_at" = ${reviewedAt}, "updated_at" = ${now}
      WHERE "id" = ${application.id}
        AND EXISTS (SELECT 1 FROM inserted)
      RETURNING "id"
    )
    SELECT
      (SELECT count(*)::int FROM inserted) AS "insertedCount",
      (SELECT count(*)::int FROM updated) AS "updatedCount"
  `);
  const row = result.rows[0] as {
    insertedCount: number;
    updatedCount: number;
  };
  if (row.insertedCount === 0) {
    return 'duplicate';
  }
  if (row.updatedCount !== 1) {
    throw new Error('KYC webhook state update did not apply.');
  }
  return 'accepted';
};
