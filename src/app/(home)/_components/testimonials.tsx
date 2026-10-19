'use client';

import { User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Section } from '@/components/section';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';

const testimonials = [
  {
    title: 'Transparent records',
    description:
      'Issuance, trades and retirements are recorded on a public chain, so buyers can inspect the history of a credit.',
    author: { name: 'For buyers' },
  },
  {
    title: 'Unified liquidity',
    description:
      'One market with an order book and auctions instead of fragmented venues.',
    author: { name: 'For traders' },
  },
  {
    title: 'Retirement certificates',
    description:
      'Retire credits onchain and share a certificate that anyone can re-verify from the transaction hash. Emissions figures are self-reported.',
    author: { name: 'For companies' },
  },
  {
    title: 'Open to extension',
    description:
      'Designed with carbon markets such as the China national ETS and CCER in mind; no registry integration exists yet.',
    author: { name: 'For the market' },
  },
];

const Testimonials = () => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }

    setTimeout(() => {
      if (api.selectedScrollSnap() + 1 === api.scrollSnapList().length) {
        setCurrent(0);
        api.scrollTo(0);
      } else {
        api.scrollNext();
        setCurrent(current + 1);
      }
    }, 4000);
  }, [api, current]);

  return (
    <Section className='relative w-full pt-10'>
      <div className='flex flex-col gap-10'>
        <div className='flex flex-col gap-2 px-6'>
          <h2 className='max-w-xl text-left font-regular text-3xl tracking-tighter md:text-5xl'>
            Built for every side of the market
          </h2>
          <p className='max-w-xl text-left text-lg text-muted-foreground leading-relaxed tracking-tight lg:max-w-lg'>
            See how Carbonized works for you.
          </p>
        </div>

        <Carousel
          className='w-full border-border border-t border-dashed'
          setApi={setApi}
        >
          <CarouselContent className='ml-0 divide-x divide-dashed divide-border'>
            {testimonials.map((item) => (
              <CarouselItem className='pl-0 lg:basis-1/2' key={item.title}>
                <div className='flex aspect-video flex-col justify-between p-6 hover:bg-card lg:col-span-2'>
                  <User className='h-8 w-8 stroke-1 transition-transform hover:rotate-12 hover:scale-125' />
                  <div className='flex flex-col gap-4'>
                    <div className='flex flex-col'>
                      <h3 className='text-xl tracking-tight'>{item.title}</h3>
                      <p className='max-w-xs text-base text-muted-foreground'>
                        {item.description}
                      </p>
                    </div>
                    <p className='flex flex-row items-center gap-2 text-sm'>
                      <span>{item.author.name}</span>
                    </p>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </Section>
  );
};

export default Testimonials;
