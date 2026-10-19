import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { env } from '@/env';
import { getSession } from '@/server/auth';
import { getApplication } from '@/server/kyc/service';
import { isSumsubConfigured } from '@/server/kyc/sumsub';

export const runtime = 'nodejs';

export const GET = async (request: Request) => {
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
  const walletAddress = new URL(request.url).searchParams.get('walletAddress');
  if (!(walletAddress && isAddress(walletAddress))) {
    return NextResponse.json(
      { error: 'A valid wallet address is required.' },
      { status: 400 }
    );
  }
  const application = await getApplication(session.user.id, walletAddress);
  return NextResponse.json({
    status: application?.status ?? 'not_started',
    walletAddress: application?.walletAddress ?? walletAddress.toLowerCase(),
    reviewedAt: application?.reviewedAt?.toISOString() ?? null,
  });
};
