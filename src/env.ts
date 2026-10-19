import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  shared: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
  },

  // Accounts & comments are optional: the app deploys with only the public
  // NEXT_PUBLIC_* variables. See src/server/auth/enabled.ts.
  server: {
    // Database
    DATABASE_URL: z.string().url().optional(),
    // Authentication
    BETTER_AUTH_SECRET: z.string().min(1).optional(),
    BETTER_AUTH_URL: z.string().min(1).optional(),
    // Google
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    // Sumsub: server-only. Never expose any of these values through NEXT_PUBLIC_*.
    SUMSUB_APP_TOKEN: z.string().min(1).optional(),
    SUMSUB_SECRET_KEY: z.string().min(1).optional(),
    SUMSUB_WEBHOOK_SECRET: z.string().min(1).optional(),
    SUMSUB_KYC_LEVEL: z.string().min(1).optional(),
  },

  client: {
    // App
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    // Analytics
    NEXT_PUBLIC_UMAMI_URL: z.string().url().optional(),
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().uuid().optional(),
  },

  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,

    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_UMAMI_URL: process.env.NEXT_PUBLIC_UMAMI_URL,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
