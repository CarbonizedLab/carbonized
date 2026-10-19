import type { Metadata } from 'next';
import Link from 'next/link';
import { title as homeTitle } from '@/app/layout.shared';
import { Section } from '@/components/section';
import { createMetadata } from '@/lib/metadata';

const LAST_UPDATED = 'October 17, 2026';

export default function TermsOfService() {
  return (
    <>
      <Section className='p-4 text-center lg:p-6'>
        <h1 className='mb-2 font-bold text-3xl leading-tight tracking-tighter md:text-4xl'>
          Terms of Service
        </h1>
        <p className='text-muted-foreground text-sm'>
          Last updated: {LAST_UPDATED}
        </p>
      </Section>
      <Section>
        <div className='grid divide-y divide-dashed divide-border'>
          {sections.map((section) => (
            <div className='group p-6 transition-all' key={section.title}>
              <h2 className='mb-4 font-semibold text-xl tracking-tight'>
                {section.title}
              </h2>
              <div className='prose prose-sm prose-zinc dark:prose-invert max-w-none'>
                {section.content}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

const sections = [
  {
    title: 'Overview',
    content: (
      <p>
        Carbonized is an onchain marketplace for carbon credits. By using the
        site or interacting with its smart contracts, you agree to these terms.
        If you do not agree, do not use the service.
      </p>
    ),
  },
  {
    title: 'Early-stage software, no warranty',
    content: (
      <ul className='ml-4 list-disc space-y-2'>
        <li>
          The smart contracts and this web application are early-stage and{' '}
          <strong>have not been independently audited</strong>. They may contain
          bugs that cause loss of funds.
        </li>
        <li>
          Where the site is connected to a test network, tokens (including
          &quot;USDG&quot;) and credits have no real-world value and do not
          represent real emissions reductions.
        </li>
        <li>
          The service is provided &quot;as is&quot; and &quot;as
          available&quot;, without warranties of any kind, including
          availability, accuracy, fitness for a particular purpose or
          uninterrupted operation. There is no service level agreement.
        </li>
        <li>
          Nothing on this site is financial, investment, legal, tax or
          environmental advice, and carbon credits listed here are not
          guaranteed to satisfy any regulatory or voluntary offsetting
          requirement.
        </li>
      </ul>
    ),
  },
  {
    title: 'Service Description',
    content: (
      <div className='space-y-8'>
        <div>
          <h3 className='mb-3 font-medium text-card-foreground text-xl'>
            Platform Services
          </h3>
          <ul className='ml-4 list-disc space-y-2'>
            <li>
              The platform lets users browse, buy, sell, auction and retire
              carbon credits that are represented as tokens on a blockchain.
            </li>
            <li>
              Credits are issued by an authorized issuer role controlled by the
              operator. Carbonized does not guarantee that a credit corresponds
              to a real-world emissions reduction or that it has not been
              counted elsewhere. Oracle-based verification is not live; oracle
              components may be mocks on test networks.
            </li>
            <li>
              A fee is charged to the seller when an order-book trade or auction
              settles (and on AMM swaps). It is currently 0.25% and can be
              changed by the contract administrator or governance within the 1%
              cap enforced by the contract; the fee in force is the one read
              from the contract when the order is created. See the Fees page.
            </li>
            <li>
              Emission figures recorded in company profiles are self-reported
              and are not verified by Carbonized.
            </li>
          </ul>
        </div>
        <div>
          <h3 className='mb-3 font-medium text-card-foreground text-xl'>
            Third-Party Integrations
          </h3>
          <ul className='ml-4 list-disc space-y-2'>
            <li>
              The platform relies on blockchain networks, wallets, RPC providers
              and payment stablecoins such as USDG. Issuers of those assets may
              freeze or restrict transfers.
            </li>
            <li>
              You must comply with the terms of any third-party service you use
              with Carbonized.
            </li>
            <li>
              We are not responsible for disruptions or losses caused by
              third-party services or networks.
            </li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    title: 'User Responsibilities',
    content: (
      <div className='mt-4 space-y-3 text-muted-foreground'>
        <p>By using the platform, you agree to:</p>
        <ul className='ml-4 list-disc space-y-2'>
          <li>Comply with all laws and regulations that apply to you.</li>
          <li>
            Keep your wallet, private keys and seed phrase secure. Transactions
            are irreversible and we cannot recover lost funds or keys.
          </li>
          <li>
            Understand that data you submit in blockchain transactions (for
            example company names, legal IDs and retirement statements) is
            public and permanent.
          </li>
          <li>Use the platform for lawful purposes only.</li>
          <li>Report security issues responsibly through the contact page.</li>
        </ul>
      </div>
    ),
  },
  {
    title: 'Limitation of liability',
    content: (
      <p>
        To the maximum extent permitted by law, the operator is not liable for
        any indirect, incidental or consequential damages, or for loss of funds,
        profits or data arising from the use of, or inability to use, the
        service or the smart contracts, including losses caused by smart
        contract bugs, oracle or price errors, network congestion, or the
        actions of other users or administrators.
      </p>
    ),
  },
  {
    title: 'Data',
    content: (
      <p>
        How data is handled, including what is stored permanently on the public
        blockchain, is described in the{' '}
        <Link
          className='text-fd-primary underline duration-300 hover:text-fd-primary/70'
          href='/privacy'
        >
          Privacy Policy
        </Link>
        .
      </p>
    ),
  },
  {
    title: 'Changes',
    content: (
      <p>
        We may update these terms. Continued use of the service after a change
        means you accept the updated terms. The date above shows the last
        revision.
      </p>
    ),
  },
  {
    title: 'Contact Information',
    content: (
      <div className='mt-4 space-y-3 text-muted-foreground'>
        <p>For questions about these terms, use the contact page:</p>
        <div className='flex flex-col space-y-2'>
          <Link
            className='inline-flex items-center text-fd-primary underline duration-300 hover:text-fd-primary/70'
            href='/contact'
          >
            Contact
          </Link>
        </div>
      </div>
    ),
  },
];

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const _params = await props.params;
  const description = `Terms of service for ${homeTitle}. Last updated on ${LAST_UPDATED}.`;

  return createMetadata({
    title: 'Terms of Service',
    description,
    openGraph: {
      url: '/terms',
    },
    alternates: {
      canonical: '/terms',
    },
  });
}
