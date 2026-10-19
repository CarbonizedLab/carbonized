import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SUMSUB_API = 'https://api.sumsub.com';
const SHA256_HEX = /^[a-f\d]{64}$/;

type Body = string | Buffer;

const bytes = (body: Body = ''): Buffer =>
  Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');

/** Sumsub HMAC input is timestamp + method + URI + exact request body. */
export const signSumsubRequest = (
  secret: string,
  timestamp: string,
  method: string,
  uri: string,
  body: Body = ''
): string =>
  createHmac('sha256', secret)
    .update(timestamp)
    .update(method.toUpperCase())
    .update(uri)
    .update(bytes(body))
    .digest('hex');

export const verifySumsubWebhook = (
  secret: string,
  algorithm: string | null,
  receivedDigest: string | null,
  rawBody: Buffer
): boolean => {
  if (
    algorithm !== 'HMAC_SHA256_HEX' ||
    !receivedDigest ||
    !SHA256_HEX.test(receivedDigest)
  ) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = Buffer.from(receivedDigest, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  return (
    actual.length === expectedBytes.length &&
    timingSafeEqual(actual, expectedBytes)
  );
};

/** Wallet signature proves an authenticated app user controls the requested wallet. */
export const sumsubApprovalMessage = (
  userId: string,
  walletAddress: string,
  nonce: string
): string =>
  [
    'Carbonized Sumsub verification request',
    `user:${userId}`,
    `wallet:${walletAddress.toLowerCase()}`,
    `nonce:${nonce}`,
  ].join('\n');

export const newKycNonce = (): string => randomBytes(32).toString('hex');

export interface SumsubConfig {
  appToken: string;
  secretKey: string;
  levelName: string;
}

export const isSumsubConfigured = (config: {
  appToken?: string;
  secretKey?: string;
  webhookSecret?: string;
  levelName?: string;
}): config is {
  appToken: string;
  secretKey: string;
  webhookSecret: string;
  levelName: string;
} =>
  Boolean(
    config.appToken &&
      config.secretKey &&
      config.webhookSecret &&
      config.levelName
  );

export interface SumsubAccessToken {
  token: string;
  userId: string;
}

/** Server-only access-token request for Sumsub WebSDK. Never expose the app token or secret. */
export const createSumsubAccessToken = async (
  config: SumsubConfig,
  userId: string
): Promise<SumsubAccessToken> => {
  const uri = '/resources/accessTokens/sdk';
  const body = JSON.stringify({
    ttlInSecs: 600,
    userId,
    levelName: config.levelName,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetch(`${SUMSUB_API}${uri}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-App-Token': config.appToken,
      'X-App-Access-Sig': signSumsubRequest(
        config.secretKey,
        timestamp,
        'POST',
        uri,
        body
      ),
      'X-App-Access-Ts': timestamp,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Sumsub access token request failed (${response.status})`);
  }
  const data = (await response.json()) as Partial<SumsubAccessToken>;
  if (!(data.token && data.userId === userId)) {
    throw new Error('Sumsub returned an invalid access token response');
  }
  return { token: data.token, userId };
};
