import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bundleAnalyzer from '@next/bundle-analyzer';
import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

/**
 * Content-Security-Policy for the app.
 *
 * Sources, derived from `grep -rn "https://" src` and the Reown/WalletConnect CSP guide
 * (https://docs.reown.com/advanced/security/content-security-policy):
 * - RPC: Robinhood Chain mainnet/testnet RPCs, the publicnode log RPCs, Alchemy
 *   (`*.g.alchemy.com`), plus whatever origin NEXT_PUBLIC_RPC_URL / NEXT_PUBLIC_LOGS_RPC_URL /
 *   NEXT_PUBLIC_BACKEND_URL / NEXT_PUBLIC_UMAMI_URL point at.
 * - Reown / WalletConnect: api.web3modal.*, *.walletconnect.*, wss relay, Coinbase wallet SDK.
 * - Next.js needs inline bootstrap scripts, so `script-src` keeps 'unsafe-inline'
 *   (nonces are a future hardening); 'unsafe-eval' is dev-only (React/Turbopack).
 */
const originOf = (value: string | undefined): string | undefined => {
  if (!value) {
    return;
  }
  try {
    return new URL(value).origin;
  } catch {
    return;
  }
};

const buildContentSecurityPolicy = (frameAncestors: "'none'" | "'self'") => {
  const isDev = process.env.NODE_ENV !== 'production';
  const isPreview = process.env.VERCEL_ENV === 'preview';

  const envOrigins = [
    process.env.NEXT_PUBLIC_RPC_URL,
    process.env.NEXT_PUBLIC_LOGS_RPC_URL,
    process.env.NEXT_PUBLIC_BACKEND_URL,
    process.env.NEXT_PUBLIC_UMAMI_URL,
  ]
    .map(originOf)
    .filter((origin): origin is string => Boolean(origin));

  const connectSrc = [
    "'self'",
    // Cloudflare web analytics beacon reports here on custom domains
    'https://cloudflareinsights.com',
    // Robinhood Chain RPCs (mainnet + testnet) and the log-scan fallbacks
    'https://rpc.mainnet.chain.robinhood.com',
    'https://rpc.testnet.chain.robinhood.com',
    'https://robinhood-rpc.publicnode.com',
    'https://robinhood-sepolia-rpc.publicnode.com',
    // Alchemy RPC (HTTP + WebSocket)
    'https://*.g.alchemy.com',
    'wss://*.g.alchemy.com',
    // Reown / WalletConnect
    'https://*.walletconnect.com',
    'https://*.walletconnect.org',
    'wss://*.walletconnect.com',
    'wss://*.walletconnect.org',
    'https://api.web3modal.com',
    'https://api.web3modal.org',
    'https://*.reown.com',
    // Coinbase Wallet SDK (bundled via @reown/appkit)
    'wss://www.walletlink.org',
    'https://cca-lite.coinbase.com',
    'https://*.coinbase.com',
    ...envOrigins,
    ...(isDev
      ? [
          'http://localhost:*',
          'http://127.0.0.1:*',
          'ws://localhost:*',
          'ws://127.0.0.1:*',
        ]
      : []),
    ...(isPreview ? ['https://vercel.live', 'wss://*.pusher.com'] : []),
  ];

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...(originOf(process.env.NEXT_PUBLIC_UMAMI_URL)
      ? [originOf(process.env.NEXT_PUBLIC_UMAMI_URL) as string]
      : []),
    // Cloudflare injects its privacy-friendly web analytics beacon on custom
    // domains; allow its script and reporting endpoint.
    'https://static.cloudflareinsights.com',
    ...(isPreview ? ['https://vercel.live'] : []),
  ];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    // Wallet logos / token icons come from many hosts (Reown, IPFS, 1inch, Zerion, ...)
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': [
      "'self'",
      'data:',
      'https://fonts.gstatic.com',
      'https://fonts.reown.com',
    ],
    'connect-src': connectSrc,
    'frame-src': [
      "'self'",
      'https://verify.walletconnect.com',
      'https://verify.walletconnect.org',
      'https://secure.walletconnect.com',
      'https://secure.walletconnect.org',
      ...(isPreview ? ['https://vercel.live'] : []),
    ],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'media-src': ["'self'", 'data:', 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': [frameAncestors],
  };

  const policy = Object.entries(directives).map(
    ([name, sources]) => `${name} ${sources.join(' ')}`
  );
  if (!isDev) {
    policy.push('upgrade-insecure-requests');
  }
  return policy.join('; ');
};

async function createNextConfig(): Promise<NextConfig> {
  const { createJiti } = await import('jiti');
  const jiti = createJiti(fileURLToPath(import.meta.url));

  await jiti.import('./src/env');

  const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    productionBrowserSourceMaps: process.env.SOURCE_MAPS === 'true',
    devIndicators: false,
    turbopack: {
      root: dirname(fileURLToPath(import.meta.url)),
    },
    logging: {
      fetches: {
        fullUrl: true,
      },
    },
    images: {
      qualities: [100, 75, 85, 95],
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'avatars.githubusercontent.com',
          port: '',
        },
        {
          protocol: 'https',
          hostname: 'fumadocs.dev',
          port: '',
        },
      ],
    },
    // Type errors must fail the build (`pnpm tsc --noEmit -p .` is clean).
    typescript: {
      ignoreBuildErrors: false,
    },
    async redirects() {
      return [
        { source: '/pricing', destination: '/fees', permanent: true },
        // One canonical origin: the workers.dev preview and www both go to
        // the apex domain, keeping the path and query string.
        {
          source: '/:path*',
          has: [
            { type: 'host', value: 'carbonized.carbonizedlab.workers.dev' },
          ],
          destination: 'https://carbonized.app/:path*',
          permanent: true,
        },
        {
          source: '/:path*',
          has: [{ type: 'host', value: 'www.carbonized.app' }],
          destination: 'https://carbonized.app/:path*',
          permanent: true,
        },
      ];
    },
    async headers() {
      const baseHeaders = (frameAncestors: "'none'" | "'self'") => [
        {
          key: 'Content-Security-Policy',
          value: buildContentSecurityPolicy(frameAncestors),
        },
        {
          key: 'X-Frame-Options',
          value: frameAncestors === "'none'" ? 'DENY' : 'SAMEORIGIN',
        },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value:
            'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
        },
        // Required by Reown AppKit social login (see Reown CSP docs).
        {
          key: 'Cross-Origin-Opener-Policy',
          value: 'same-origin-allow-popups',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
      ];
      // Later matching rules override earlier ones for the same header key:
      // everything gets a same-origin frame policy, the wallet app is never framable.
      return [
        { source: '/:path*', headers: baseHeaders("'self'") },
        {
          source: '/app/:path*',
          headers: [
            ...baseHeaders("'none'"),
            { key: 'Cache-Control', value: 'no-store, max-age=0' },
          ],
        },
        // Do not let a visitor retain a previous HTML shell across Worker
        // deployments: an old shell can reference chunks from an old build and
        // cause the browser's generic "page couldn't load" screen.
        {
          source: '/',
          headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
        },
      ];
    },
    serverExternalPackages: [
      'ts-morph',
      'typescript',
      'oxc-transform',
      'twoslash',
      'twoslash-protocol',
      'shiki',
      '@takumi-rs/image-response',
    ],
  };

  return nextConfig;
}

const bundleAnalyzerPlugin = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const mdxPlugin = createMDX();

const NextApp = async () => {
  const nextConfig = await createNextConfig();
  const plugins = [bundleAnalyzerPlugin, mdxPlugin];
  return plugins.reduce((config, plugin) => plugin(config), nextConfig);
};

export default NextApp;
