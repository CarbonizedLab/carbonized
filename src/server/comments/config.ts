import type { AuthAdapter } from '@fuma-comment/server';
import { createBetterAuthAdapter } from '@fuma-comment/server/adapters/better-auth';
import { createDrizzleAdapter } from '@fuma-comment/server/adapters/drizzle';
import type { CustomRequest } from '@fuma-comment/server/custom';

import { getAuth } from '@/server/auth';
import { getDb } from '@/server/db';
import { comments, rates, roles, users } from '@/server/db/schema';

export const createCommentsAuth = (): AuthAdapter<CustomRequest> =>
  createBetterAuthAdapter(getAuth());

export const createCommentsStorage = () =>
  createDrizzleAdapter({
    db: getDb(),
    schemas: {
      comments,
      rates,
      roles,
      user: users,
    },
    auth: 'better-auth',
  });
