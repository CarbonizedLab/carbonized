import * as motion from 'motion/react-client';
import Image from 'next/image';
import Link from 'next/link';
import { Icons } from '@/components/icons/icons';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import heroImage from '../../../../public/images/gradient-noise-purple-azure-light.png';

const CARB_ADDRESS = process.env.NEXT_PUBLIC_CARB_TOKEN;
const IS_CARB_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(CARB_ADDRESS ?? '');

const LaunchReadiness = () => (
  <p className='font-mono text-muted-foreground text-sm uppercase tracking-[0.18em]'>
    <span className='font-semibold text-foreground'>$CARB</span>
    {' : '}
    {IS_CARB_ADDRESS ? (
      <a
        className='text-foreground underline decoration-dotted underline-offset-4'
        href={`https://robinhoodchain.blockscout.com/address/${CARB_ADDRESS}`}
        rel='noreferrer'
        target='_blank'
      >
        {CARB_ADDRESS}
      </a>
    ) : (
      'Coming soon'
    )}
  </p>
);

const Hero = () => (
  <Section className='relative w-full overflow-hidden bg-dashed px-4 py-16 sm:px-16 sm:py-24 md:py-32'>
    <motion.div
      animate={{ opacity: 1 }}
      className='absolute inset-0 -z-10 h-full w-full'
      initial={{ opacity: 0 }}
      transition={{
        duration: 0.4,
        scale: { type: 'spring', visualDuration: 0.4, bounce: 0.5 },
      }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1 }}
    >
      <Image
        alt='Hero Background'
        className='pointer-events-none absolute right-0 bottom-0 h-[900px] w-[1004px] max-w-[1004px] translate-x-1/2 translate-y-1/2 select-none opacity-80 dark:opacity-100'
        height={600}
        priority
        src={heroImage}
        width={704}
      />
    </motion.div>
    <div className='mx-auto flex flex-col items-center justify-center gap-8'>
      <Button
        asChild
        className='group gap-4 bg-muted/70'
        size='sm'
        variant='outline'
      >
        <Link href='/app/marketplace'>
          Carbon credit marketplace on Robinhood Chain
          <Icons.arrowUpRight className='size-4 transition-transform group-hover:-rotate-12' />
        </Link>
      </Button>
      <div className='flex flex-col gap-4'>
        <h1 className='max-w-2xl text-center font-regular text-5xl tracking-tighter md:text-7xl'>
          Trade Carbon Credits Fully Onchain
        </h1>
        <p className='max-w-2xl text-center text-lg text-muted-foreground leading-relaxed tracking-tight md:text-xl'>
          Carbonized is an onchain marketplace for carbon credits. Explore order
          books, auctions, retirement certificates and portfolio tracking with
          settlement in USDG on Robinhood Chain.
        </p>
      </div>
      <div className='flex flex-row gap-3'>
        <Button
          asChild
          className='group gap-4 bg-muted/70 shadow-none'
          size='lg'
          variant='outline'
        >
          <Link href='/app/marketplace'>
            Explore marketplace{' '}
            <Icons.arrowUpRight className='size-4 transition-transform group-hover:-rotate-12' />
          </Link>
        </Button>
        <Button asChild className='group gap-4' size='lg'>
          <Link href='/app'>
            Launch app{' '}
            <Icons.arrowUpRight className='size-4 transition-transform group-hover:-rotate-12' />
          </Link>
        </Button>
      </div>
      <LaunchReadiness />
    </div>
  </Section>
);

export default Hero;
