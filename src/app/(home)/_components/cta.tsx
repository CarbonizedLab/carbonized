import Link from 'next/link';
import type React from 'react';
import { Icons } from '@/components/icons/icons';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';

export default function CTA(): React.ReactElement {
  return (
    <Section className='relative grid gap-8 px-4 py-10 sm:grid-cols-2 md:py-14 lg:px-6 lg:py-16'>
      <h2 className='max-w-xl font-regular text-3xl md:text-5xl'>
        Start trading carbon credits on Carbonized
      </h2>

      <div className='flex w-full items-center'>
        <div className='max-w-xl space-y-4'>
          <p className='text-muted-foreground text-sm md:text-base'>
            Connect your wallet to buy, sell, auction and retire carbon credits
            with onchain settlement. Companies and traders can register a
            profile; registration data is stored on a public blockchain.
          </p>
          <div className='flex flex-row gap-3'>
            <Button asChild className='group gap-4' size='lg'>
              <Link href='/app'>
                Launch app{' '}
                <Icons.arrowUpRight className='size-4 transition-transform group-hover:-rotate-12' />
              </Link>
            </Button>
            <Button
              asChild
              className='group gap-4 bg-transparent shadow-none'
              size='lg'
              variant='outline'
            >
              <Link href='/app/marketplace'>
                <Icons.fees className='size-4 transition-transform group-hover:-rotate-12' />
                Explore marketplace{' '}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
