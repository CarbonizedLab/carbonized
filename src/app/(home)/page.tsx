import Hero from '@/app/(home)/_components/hero';
import Separator from '@/components/separator';
import CTA from './_components/cta';
import { Customers } from './_components/customers';
import { FAQ } from './_components/faq';
import Features from './_components/features';
import Testimonials from './_components/testimonials';

export default function Home() {
  return (
    <>
      <Hero />
      <Customers />
      <Separator />
      <Features />
      <Separator />
      <Testimonials />
      <Separator />
      <FAQ />
      <Separator />
      <CTA />
    </>
  );
}
