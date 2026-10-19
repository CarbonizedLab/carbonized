import type { BlogPosting, BreadcrumbList, Graph } from 'schema-dts';
import { title as homeTitle, owner } from '@/app/layout.shared';
import { baseUrl } from '@/lib/constants';
import { getPageImage } from '@/lib/metadata';
import type { Post } from '@/lib/source';

const serializeJsonLd = (value: Graph): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export const PostJsonLd = ({ page }: { page: Post }) => {
  if (!page) {
    return null;
  }

  const url = new URL(page.url, baseUrl.href).href;

  const post: BlogPosting = {
    '@type': 'BlogPosting',
    headline: page.data.title,
    description: page.data.description,
    image: new URL(getPageImage(page).url, baseUrl.href).href,
    datePublished: new Date(page.data.date).toISOString(),
    dateModified: page.data.lastModified
      ? new Date(page.data.lastModified).toISOString()
      : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    author: {
      '@type': 'Organization',
      name: page.data.author,
    },
    publisher: {
      '@type': 'Organization',
      name: owner,
      url: baseUrl.href,
    },
  };

  const breadcrumbList: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: homeTitle,
        item: baseUrl.href,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: `${homeTitle} | Posts`,
        item: new URL('/blog', baseUrl.href).href,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: page.data.title,
        item: url,
      },
    ],
  };

  const graph: Graph = {
    '@context': 'https://schema.org',
    '@graph': [post, breadcrumbList],
  };

  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
      type='application/ld+json'
    />
  );
};

export const TagJsonLd = ({ tag }: { tag: string }) => {
  const breadcrumbList: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: homeTitle,
        item: baseUrl.href,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: `${homeTitle} | Tags`,
        item: new URL('/tags', baseUrl.href).href,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${homeTitle} | Posts tagged with ${tag}`,
        item: new URL(`/tags/${tag}`, baseUrl.href).href,
      },
    ],
  };

  const graph: Graph = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbList],
  };

  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
      type='application/ld+json'
    />
  );
};
