import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import { createMetadata } from '@/lib/metadata';
import { docsSource } from '@/lib/source';

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await props.params;
  const page = docsSource.getPage(slug);

  if (!page) {
    notFound();
  }

  const { body: Mdx, toc } = page.data;

  return (
    <DocsPage full={page.data.full} toc={toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Mdx components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return docsSource.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const page = docsSource.getPage(slug);

  if (!page) {
    notFound();
  }

  return createMetadata({
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url },
  });
}
