import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

import { env } from '@/env';
import * as schema from './schema';

export type Database = NeonHttpDatabase<typeof schema>;

let instance: Database | undefined;

/** Lazily creates the Neon client; throws only when actually used without DATABASE_URL. */
export const getDb = (): Database => {
  if (instance) {
    return instance;
  }
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Database access is disabled.');
  }
  instance = drizzle({
    client: neon(env.DATABASE_URL),
    schema,
    casing: 'snake_case',
  });
  return instance;
};
