import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { headers } from 'next/headers';

import { env } from '@/env';
import { getDb } from '@/server/db';
import { isAuthConfigured } from './enabled';

const createAuth = (clientId: string, clientSecret: string) =>
  betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      usePlural: true,
    }),
    socialProviders: {
      google: { clientId, clientSecret },
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: true,
          input: false,
          defaultValue: 'user',
        },
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Lazily builds better-auth; throws only when used while auth is not configured. */
export const getAuth = (): Auth => {
  if (instance) {
    return instance;
  }
  if (!(isAuthConfigured && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) {
    throw new Error('Auth is not configured. Sign-in is disabled.');
  }
  instance = createAuth(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  return instance;
};

export const getSession = async () => {
  if (!isAuthConfigured) {
    return null;
  }
  return await getAuth().api.getSession({
    headers: await headers(),
  });
};
