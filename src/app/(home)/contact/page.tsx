import type { Metadata } from 'next';
import { Icons } from '@/components/icons/icons';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { CONTACT_EMAIL, CONTACT_X_URL } from '@/lib/constants';
import { createMetadata } from '@/lib/metadata';
import CTA from '../_components/cta';

export default function Contact(): React.ReactElement {
  return (
    <>
      <Section className='grid divide-y divide-dashed divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
        <div className='flex flex-col gap-2 px-6 py-10 md:py-14'>
          <h4 className='max-w-xl text-left font-regular text-3xl tracking-tighter md:text-5xl'>
            Contact
          </h4>
          <p className='max-w-xl text-left text-lg text-muted-foreground leading-relaxed tracking-tight lg:max-w-lg'>
            Let us know if you have any questions or feedback. We are here to
            help you.
          </p>
        </div>

        <div className='flex w-full flex-col items-start justify-center gap-3 px-6 py-10 sm:flex-row sm:items-center md:py-14'>
          <Button asChild className='w-full sm:w-auto'>
            <a href={CONTACT_X_URL} rel='noopener noreferrer' target='_blank'>
              <Icons.x className='mr-2 size-4' />
              Message us on X
            </a>
          </Button>
          {CONTACT_EMAIL ? (
            <Button asChild className='w-full sm:w-auto' variant='outline'>
              <a href={`mailto:${CONTACT_EMAIL}`}>
                <Icons.mail className='mr-2 size-4' />
                Email {CONTACT_EMAIL}
              </a>
            </Button>
          ) : null}
        </div>
      </Section>
      <CTA />
    </>
  );
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const _params = await props.params;
  const description =
    'Contact us for any inquiries, feedback, or support. We are here to assist you.';

  return createMetadata({
    title: 'Contact',
    description,
    openGraph: {
      url: '/contact',
    },
    alternates: {
      canonical: '/contact',
    },
  });
}
