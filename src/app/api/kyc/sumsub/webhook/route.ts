import { NextResponse } from 'next/server';
import { env } from '@/env';
import { applyWebhook } from '@/server/kyc/service';
import { isSumsubConfigured, verifySumsubWebhook } from '@/server/kyc/sumsub';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BYTES = 256 * 1024;

interface SumsubWebhook {
  applicantId?: unknown;
  externalUserId?: unknown;
  reviewResult?: { reviewAnswer?: unknown; reviewRejectType?: unknown };
  reviewStatus?: unknown;
  type?: unknown;
}

const statusFromWebhook = (event: SumsubWebhook): string => {
  if (event.reviewResult?.reviewAnswer === 'GREEN') {
    return 'approved';
  }
  if (event.reviewResult?.reviewAnswer === 'RED') {
    return event.reviewResult.reviewRejectType === 'RETRY'
      ? 'retry_required'
      : 'rejected';
  }
  return event.reviewStatus === 'onHold' ? 'on_hold' : 'pending';
};

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
      { error: 'Webhook is not configured.' },
      { status: 503 }
    );
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: 'Webhook body is too large.' },
      { status: 413 }
    );
  }
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (rawBody.length > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: 'Webhook body is too large.' },
      { status: 413 }
    );
  }
  if (
    !verifySumsubWebhook(
      env.SUMSUB_WEBHOOK_SECRET as string,
      request.headers.get('x-payload-digest-alg'),
      request.headers.get('x-payload-digest'),
      rawBody
    )
  ) {
    return NextResponse.json(
      { error: 'Invalid webhook signature.' },
      { status: 401 }
    );
  }
  let event: SumsubWebhook;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as SumsubWebhook;
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook JSON.' },
      { status: 400 }
    );
  }
  if (
    !(
      typeof event.type === 'string' &&
      typeof event.externalUserId === 'string' &&
      event.externalUserId.startsWith('carbonized:')
    )
  ) {
    return NextResponse.json(
      { error: 'Unsupported webhook payload.' },
      { status: 400 }
    );
  }
  const outcome = await applyWebhook(
    rawBody,
    event.type,
    event.externalUserId,
    typeof event.applicantId === 'string' ? event.applicantId : undefined,
    statusFromWebhook(event)
  );
  if (outcome === 'unknown_applicant') {
    return NextResponse.json(
      { error: 'Unknown verification applicant.' },
      { status: 404 }
    );
  }
  if (outcome === 'duplicate') {
    return NextResponse.json({ received: true, duplicate: true });
  }
  // This only persists provider state. An authorized multisig operator must separately update KYC_ROLE onchain.
  return NextResponse.json({ received: true });
};
