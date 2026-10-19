import { InlineLink } from '@/components/inline-link';
import { Section } from '@/components/section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faq = [
  {
    question: 'What is Carbonized?',
    answer:
      'Carbonized is an onchain carbon credit marketplace on Robinhood Chain. Credits are minted by an authorized issuer role, traded through an order book and auctions with onchain settlement, and retired with a certificate anyone can verify from the transaction hash.',
  },
  {
    question: 'How are credits verified?',
    answer:
      'Today, issuance is controlled by an admin/issuer role that records project metadata, a serial number and a proof hash onchain. Automated oracle verification is not live yet (the oracle contracts are not connected to a live data provider), so Carbonized does not guarantee that a credit is real or counted only once. Contracts have not been independently audited.',
  },
  {
    question: 'How does trading work?',
    answer:
      'You can buy or sell through a fixed-price order book or bid in auctions, settling in USDG. The reference price comes from an onchain oracle fed by Chainlink Functions sources set by the admin, with a manual fallback reporter. A trading fee (currently 0.25%, adjustable by the admin within an onchain cap) is charged on executed trades.',
  },
  {
    question: 'What are pooled ERC-20 tokens?',
    answer:
      'Individual credits are ERC-721 NFTs. You can wrap NFTs of the same methodology into a pooled ERC-20 token (CCT) so they can be traded in the order book, and unwrap them back to NFTs later.',
  },
  {
    question: 'Who can use Carbonized?',
    answer:
      'Anyone with a Web3 wallet can buy and retire credits. Companies can register to record self-reported emissions next to their retirements, and traders can register a profile. Registration data is stored on a public blockchain.',
  },
  {
    question: 'Is there a Carbonized token?',
    answer:
      'A utility token called CARB is planned but is not launched yet. It would only add optional utilities (fee tiers, an issuer bond and governance) and carries no financial promises. See the token docs at /docs/token for details and risks.',
  },
  {
    question: 'Do I need CARB to use Carbonized?',
    answer:
      'No. Trading, retirement and certificates work without it. CARB would only add optional fee tiers (a discount on the trading fee, never on the price), a bonded issuer path and governance.',
  },
  {
    question: 'Is CARB an investment?',
    answer:
      'No. CARB is a planned utility token with no returns, yield, revenue share or price commitments. Nothing here is investment advice or an offer or solicitation, and rules differ by jurisdiction, so it may be restricted where you live. Contracts are unaudited; get your own advice.',
  },
];

export const FAQ = () => (
  <Section className='grid divide-y divide-dashed divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
    <div className='flex flex-col gap-2 px-6 py-10 md:py-14'>
      <h4 className='max-w-xl text-left font-regular text-3xl tracking-tighter md:text-5xl'>
        Frequently Asked Questions
      </h4>
      <p className='max-w-xl text-left text-lg text-muted-foreground leading-relaxed tracking-tight lg:max-w-lg'>
        Still have questions?{' '}
        <InlineLink className='no-underline' href='/contact'>
          Contact Us
        </InlineLink>
      </p>
    </div>

    <Accordion
      className='w-full divide-dashed divide-border'
      collapsible
      type='single'
    >
      {faq.map((item) => (
        <AccordionItem key={item.question} value={item.question}>
          <AccordionTrigger className='rounded-none px-4 hover:bg-card hover:no-underline data-[state=open]:bg-card'>
            {item.question}
          </AccordionTrigger>
          <AccordionContent className='p-4'>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </Section>
);
