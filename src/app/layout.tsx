import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { createMetadata } from '@/lib/metadata';
import '@/styles/globals.css';
import 'katex/dist/katex.css';
import { baseUrl } from '@/lib/constants';
import { Body } from './layout.client';
import { description as homeDescription } from './layout.shared';
import { Provider } from './provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = createMetadata({
  title: {
    template: '%s | Carbonized',
    default: 'Carbonized',
  },
  description: homeDescription,
  metadataBase: baseUrl,
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0A' },
    { media: '(prefers-color-scheme: light)', color: '#fff' },
  ],
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      lang='en'
      suppressHydrationWarning
    >
      <head>
        {/*
          The Worker bundler injects `__name(fn, "fn")` helpers into inlined
          functions. next-themes serialises a function with `.toString()` into
          an inline <script>, so that helper reaches the browser where it does
          not exist. A no-op shim keeps the theme script from throwing.
        */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, constant shim
          dangerouslySetInnerHTML={{
            __html: 'window.__name=window.__name||function(f){return f};',
          }}
        />
      </head>
      <Body>
        <RootProvider
          theme={{
            enabled: false,
          }}
        >
          <Provider>{children}</Provider>
        </RootProvider>
      </Body>
    </html>
  );
};

export default RootLayout;
