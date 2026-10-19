import { NextResponse } from 'next/server';
import { isAddress, verifyMessage } from 'viem';
import { env } from '@/env';
import { getSession } from '@/server/auth';
import { allowKycSession } from '@/server/kyc/rate-limit';
import {
  consumeChallenge,
  createOrRefreshApplication,
  getActiveChallenge,
} from '@/server/kyc/service';
import {
  createSumsubAccessToken,
  isSumsubConfigured,
  sumsubApprovalMessage,
} from '@/server/kyc/sumsub';

export const runtime = 'nodejs';

export const POST = async (request: Request) => {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 }
    );
  }
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!allowKycSession(session.user.id, ip)) {
    return NextResponse.json(
      { error: 'Too many KYC session attempts. Try again later.' },
      { status: 429 }
    );
  }
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
  const payload = (await request.json().catch(() => null)) as {
    challengeId?: unknown;
    walletAddress?: unknown;
    signature?: unknown;
  } | null;
  if (
    !(
      typeof payload?.challengeId === 'string' &&
      typeof payload.walletAddress === 'string' &&
      typeof payload.signature === 'string' &&
      isAddress(payload.walletAddress)
    )
  ) {
    return NextResponse.json(
      { error: 'Invalid KYC session request.' },
      { status: 400 }
    );
  }
  const challenge = await getActiveChallenge(
    payload.challengeId,
    session.user.id,
    payload.walletAddress
  );
  if (!challenge) {
    return NextResponse.json(
      { error: 'KYC wallet challenge is invalid or expired.' },
      { status: 400 }
    );
  }
  const valid = await verifyMessage({
    address: payload.walletAddress,
    message: sumsubApprovalMessage(
      session.user.id,
      payload.walletAddress,
      challenge.nonce
    ),
    signature: payload.signature as `0x${string}`,
  });
  if (!valid) {
    return NextResponse.json(
      { error: 'Wallet signature does not match this challenge.' },
      { status: 401 }
    );
  }
  if (!(await consumeChallenge(challenge.id, session.user.id))) {
    return NextResponse.json(
      { error: 'KYC wallet challenge was already used.' },
      { status: 409 }
    );
  }
  const appToken = env.SUMSUB_APP_TOKEN;
  const secretKey = env.SUMSUB_SECRET_KEY;
  const levelName = env.SUMSUB_KYC_LEVEL;
  if (!(appToken && secretKey && levelName)) {
    return NextResponse.json(
      { error: 'KYC is not configured yet.' },
      { status: 503 }
    );
  }
  let application: Awaited<ReturnType<typeof createOrRefreshApplication>>;
  try {
    application = await createOrRefreshApplication(
      session.user.id,
      payload.walletAddress,
      levelName
    );
  } catch {
    return NextResponse.json(
      { error: 'This wallet cannot be used for this verification request.' },
      { status: 409 }
    );
  }
  try {
    const access = await createSumsubAccessToken(
      {
        appToken,
        secretKey,
        levelName,
      },
      application.providerUserId
    );
    return NextResponse.json({
      token: access.token,
      userId: access.userId,
      expiresInSeconds: 600,
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to start verification. Please try again later.' },
      { status: 502 }
    );
  }
};
