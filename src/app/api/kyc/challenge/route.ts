import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { env } from '@/env';
import { getSession } from '@/server/auth';
import { allowKycChallenge } from '@/server/kyc/rate-limit';
import { createChallenge } from '@/server/kyc/service';
import {
  isSumsubConfigured,
  newKycNonce,
  sumsubApprovalMessage,
} from '@/server/kyc/sumsub';

export const runtime = 'nodejs';

export const POST = async (request: Request) => {
  if (
    !isSumsubConfigured({
      appToken: env.SUMSUB_APP_TOKEN,
      secretKey: env.SUMSUB_SECRET_KEY,
      webhookSecret: env.SUMSUB_WEBHOOK_SECRET,
      levelName: env.SUMSUB_KYC_LEVEL,
    })
  ) {
    return NextResponse.json(
      { error: 'KYC is not configured yet.' },
      { status: 503 }
    );
  }
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 }
    );
  }
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!allowKycChallenge(session.user.id, ip)) {
    return NextResponse.json(
      { error: 'Too many KYC challenges requested. Try again later.' },
      { status: 429 }
    );
  }
  const payload = (await request.json().catch(() => null)) as {
    walletAddress?: unknown;
  } | null;
  if (
    !(
      typeof payload?.walletAddress === 'string' &&
      isAddress(payload.walletAddress)
    )
  ) {
    return NextResponse.json(
      { error: 'A valid wallet address is required.' },
      { status: 400 }
    );
  }
  const nonce = newKycNonce();
  const challenge = await createChallenge(
    session.user.id,
    payload.walletAddress,
    nonce
  );
  return NextResponse.json({
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    message: sumsubApprovalMessage(
      session.user.id,
      payload.walletAddress,
      nonce
    ),
  });
};
