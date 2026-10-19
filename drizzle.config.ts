import type { Config } from 'drizzle-kit';

import { env } from '@/env';

const databaseUrl = env.DATABASE_URL;
const requiresDatabase = process.argv.some(
  (argument) => argument === 'migrate' || argument === 'push'
);
if (requiresDatabase && !databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run drizzle-kit migrate or push.'
  );
}

export default {
  schema: './src/server/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // drizzle-kit generate is schema-only; real DB commands remain fail-closed above.
    url: databaseUrl ?? 'postgresql://unused:unused@localhost:5432/unused',
  },
  tablesFilter: ['blog_*'],
} satisfies Config;
