export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Public contact address used by the mailto: CTA on the contact page. Set
 * `NEXT_PUBLIC_CONTACT_EMAIL`; the placeholder below is NOT a real mailbox.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || '';
export const CONTACT_X_URL = 'https://x.com/CarbonizedApp';

const LOCAL_URL = 'http://localhost:3000';
const PRODUCTION_FALLBACK_URL = 'https://carbonized.app';

const asUrl = (value: string | undefined, fallback: string): URL => {
  try {
    return new URL(value || fallback);
  } catch {
    return new URL(fallback);
  }
};

const resolveBaseUrl = (): URL => {
  if (!isProduction) {
    return new URL(LOCAL_URL);
  }
  const { NEXT_PUBLIC_APP_URL, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL } =
    process.env;
  if (NEXT_PUBLIC_APP_URL) {
    return asUrl(NEXT_PUBLIC_APP_URL, PRODUCTION_FALLBACK_URL);
  }
  if (VERCEL_PROJECT_PRODUCTION_URL) {
    return asUrl(
      `https://${VERCEL_PROJECT_PRODUCTION_URL}`,
      PRODUCTION_FALLBACK_URL
    );
  }
  if (VERCEL_URL) {
    return asUrl(`https://${VERCEL_URL}`, PRODUCTION_FALLBACK_URL);
  }
  return new URL(PRODUCTION_FALLBACK_URL);
};

export const baseUrl = resolveBaseUrl();
