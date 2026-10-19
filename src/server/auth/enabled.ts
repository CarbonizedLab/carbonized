import { env } from '@/env';

/** True when a Postgres connection string is available. */
export const isDatabaseConfigured = Boolean(env.DATABASE_URL);

/** True when accounts (Google sign-in) and blog comments can work. */
export const isAuthConfigured = Boolean(
  env.DATABASE_URL &&
    env.BETTER_AUTH_SECRET &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET
);

export const AUTH_NOT_CONFIGURED_MESSAGE = 'Auth/comments are not configured';
