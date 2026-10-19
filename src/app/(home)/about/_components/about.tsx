import { Section } from '@/components/section';

export default function About(): React.ReactElement {
  return (
    <Section className='grid divide-y divide-dashed divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
      <div className='flex flex-col gap-2 px-6 py-10 md:py-14'>
        <h4 className='text-left font-regular text-3xl tracking-tighter md:text-5xl'>
          Our Story
        </h4>
      </div>

      <div className='gap-4 px-6 py-10 md:py-14'>
        <div className='prose dark:prose-invert w-full space-y-4'>
          <p className='text-lg'>
            Carbon markets today can be opaque, with intermediaries and slow
            settlement that make it hard to see where a credit came from. We
            wanted to see what an open, onchain alternative could look like.
            That's why we built Carbonized.
          </p>

          <p className='text-lg'>
            What began as a simple onchain registry has evolved into a
            marketplace with an order book, auctions and retirement
            certificates. It is early-stage software: the contracts are
            unaudited and verification of credits is still controlled by the
            operator.
          </p>
        </div>
      </div>
    </Section>
  );
}
