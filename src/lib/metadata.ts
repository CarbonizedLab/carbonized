import type { Metadata } from 'next';
import { title } from '@/app/layout.shared';
import { baseUrl } from './constants';
import type { Page } from './source';

export function createMetadata(override: Metadata): Metadata {
  return {
    ...override,
    openGraph: {
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      url: baseUrl.href,
      images: '/banner.png',
      siteName: title,
      ...override.openGraph,
    },
    twitter: {
      card: 'summary_large_image',
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      images: '/banner.png',
      ...override.twitter,
    },
  };
}

/**
 * Social preview image for a post. Uses the photo from the post's frontmatter
 * (a static file in /public) so it works on any host, including Cloudflare
 * Workers where the native image generator cannot run. Falls back to the
 * site banner.
 */
export function getPageImage(page: Page) {
  const photo = (page.data as { image?: string }).image;
  const segments = [...page.slugs, 'image.webp'];
  return {
    segments,
    url: photo?.startsWith('/') ? photo : '/banner.png',
  };
}
