import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSumsubConfigured,
  signSumsubRequest,
  sumsubApprovalMessage,
  verifySumsubWebhook,
} from './sumsub';

const USER_PATTERN = /user:user-1/;
const WALLET_PATTERN = /wallet:0xabc/;
const NONCE_PATTERN = /nonce:nonce-1/;

test('Sumsub is enabled only with every server-side secret and verification level', () => {
  assert.equal(
    isSumsubConfigured({
      appToken: 'app-token',
      secretKey: 'api-secret',
      webhookSecret: 'webhook-secret',
      levelName: 'basic-kyc',
    }),
    true
  );
  assert.equal(
    isSumsubConfigured({
      appToken: 'app-token',
      secretKey: 'api-secret',
      levelName: 'basic-kyc',
    }),
    false
  );
});

test('signSumsubRequest uses timestamp, method, path and exact body bytes', () => {
  const body = '{"ttlInSecs":600}';
  assert.equal(
    signSumsubRequest(
      'secret',
      '1700000000',
      'POST',
      '/resources/accessTokens/sdk',
      body
    ),
    '481efd872878e79b1c0f1e9a511491608773b5a1ef0c80114cc83eac6d3a195f'
  );
});

test('verifySumsubWebhook accepts matching HMAC-SHA256 and rejects tampering', () => {
  const raw = Buffer.from('{"type":"applicantReviewed"}');
  const signature = signSumsubRequest('webhook-secret', '', '', '', raw);
  assert.equal(
    verifySumsubWebhook('webhook-secret', 'HMAC_SHA256_HEX', signature, raw),
    true
  );
  assert.equal(
    verifySumsubWebhook(
      'webhook-secret',
      'HMAC_SHA256_HEX',
      signature.toUpperCase(),
      raw
    ),
    false
  );
  assert.equal(
    verifySumsubWebhook(
      'webhook-secret',
      'HMAC_SHA256_HEX',
      `${signature}zz`,
      raw
    ),
    false
  );
  assert.equal(
    verifySumsubWebhook(
      'webhook-secret',
      'HMAC_SHA256_HEX',
      `${signature}0`,
      raw
    ),
    false
  );
  assert.equal(
    verifySumsubWebhook(
      'webhook-secret',
      'HMAC_SHA256_HEX',
      signature.slice(1),
      raw
    ),
    false
  );
});

test('sumsubApprovalMessage binds the application user, wallet and nonce', () => {
  assert.match(
    sumsubApprovalMessage('user-1', '0xabc', 'nonce-1'),
    USER_PATTERN
  );
  assert.match(
    sumsubApprovalMessage('user-1', '0xabc', 'nonce-1'),
    WALLET_PATTERN
  );
  assert.match(
    sumsubApprovalMessage('user-1', '0xabc', 'nonce-1'),
    NONCE_PATTERN
  );
});
