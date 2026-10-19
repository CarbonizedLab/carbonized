import type { Metadata } from 'next';
import { title as homeTitle } from '@/app/layout.shared';
import { InlineLink } from '@/components/inline-link';
import { Section } from '@/components/section';
import { createMetadata } from '@/lib/metadata';

const LAST_UPDATED = 'October 17, 2026';

export default function PrivacyPolicy() {
  return (
    <>
      <Section className='p-4 text-center lg:p-6'>
        <h1 className='mb-2 font-bold text-3xl leading-tight tracking-tighter md:text-4xl'>
          Privacy Policy
        </h1>
        <div className='flex items-center justify-center gap-2'>
          <p className='text-muted-foreground text-sm'>
            Last updated: {LAST_UPDATED}
          </p>
          <span className='text-muted-foreground text-sm'>•</span>
          <InlineLink className='text-sm' href='/terms'>
            Terms of Service
          </InlineLink>
        </div>
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
    title: 'The short version',
    content: (
      <p>
        Carbonized is software that talks to a public blockchain. Anything you
        send in a blockchain transaction is public and permanent: nobody,
        including us, can edit or delete it. Please read the next section before
        you register a company or trader profile.
      </p>
    ),
  },
  {
    title: 'What is written to the public blockchain',
    content: (
      <ul className='ml-4 list-disc space-y-2'>
        <li>
          Your wallet address and every transaction you send: trades, auction
          bids, wrapping, minting and retirements. Retirement certificates
          include the free-text beneficiary statement you type.
        </li>
        <li>
          <strong>Company profiles:</strong> company name, legal entity ID and
          the Scope 1/2/3 emission figures you enter are stored in the registry
          contract and emitted in events. Anyone can read them.
        </li>
        <li>
          <strong>Trader profiles:</strong> name and country are stored in the
          registry contract and can be read by anyone.
        </li>
        <li>
          <strong>Contact details:</strong> your email address and phone number
          are <em>not</em> published. Only a salted hash of them is stored
          onchain, so the details cannot be read from the chain. The details and
          the random salt used to create the hash are kept in this browser
          (local storage) so you can prove them to a verifier; clearing your
          browser data removes them.
        </li>
        <li>
          Because the blockchain is immutable, onchain data cannot be deleted or
          corrected after the fact. Do not enter data you are not willing to
          publish permanently.
        </li>
      </ul>
    ),
  },
  {
    title: 'What we process off-chain',
    content: (
      <ul className='ml-4 list-disc space-y-2'>
        <li>
          <strong>Wallet connection:</strong> if you connect with WalletConnect
          (Reown), connection metadata is relayed through Reown&apos;s
          infrastructure under their own privacy policy. Injected browser
          wallets connect locally.
        </li>
        <li>
          <strong>Blockchain RPC providers:</strong> to read the chain and
          submit transactions, your browser sends requests (including your IP
          address and wallet address) to RPC endpoints such as the Robinhood
          Chain RPC, public node providers and, if configured, Alchemy.
        </li>
        <li>
          <strong>Local storage:</strong> your language, sidebar and
          notification preferences and, after registration, your contact details
          and salt are stored in your browser only.
        </li>
        <li>
          <strong>Analytics:</strong> if the operator has configured Umami
          analytics, page views are sent to that Umami instance. If it is not
          configured, no analytics script is loaded.
        </li>
        <li>
          <strong>Accounts and comments (optional):</strong> when enabled, you
          can sign in with Google to comment on blog posts. In that case your
          name, email address and profile picture from Google and your comments
          are stored in the operator&apos;s database. Sign-in is not required to
          use the marketplace.
        </li>
        <li>
          <strong>Optional backend:</strong> if the operator has configured a
          backend service, company registration details you enter (including
          email and phone) are also sent to it. Check with the operator whether
          one is configured.
        </li>
      </ul>
    ),
  },
  {
    title: 'Sharing',
    content: (
      <p>
        We do not sell personal data. Data is necessarily disclosed to the third
        parties named above (blockchain nodes, Reown, analytics and sign-in
        providers when enabled) to make the service work, and public blockchain
        data is visible to everyone.
      </p>
    ),
  },
  {
    title: 'Security',
    content: (
      <ul className='ml-4 list-disc space-y-2'>
        <li>
          The site is served over HTTPS and sets standard browser security
          headers. We never ask for or store your private keys or seed phrase;
          transactions are signed in your own wallet.
        </li>
        <li>
          The smart contracts have{' '}
          <strong>not been independently audited</strong>. Use the service at
          your own risk and never with funds you cannot afford to lose.
        </li>
      </ul>
    ),
  },
  {
    title: 'Your rights and choices',
    content: (
      <ul className='ml-4 list-disc space-y-2'>
        <li>
          Off-chain data (comments, account, optional backend records,
          analytics) can be requested for access or deletion by contacting us.
        </li>
        <li>
          Onchain data cannot be altered or deleted by anyone. You can avoid
          publishing personal data by using a fresh wallet and by not entering
          personal information in registration fields.
        </li>
        <li>
          You can clear this site&apos;s local storage in your browser at any
          time.
        </li>
      </ul>
    ),
  },
  {
    title: 'Contact Us',
    content: (
      <p>
        If you have any questions about your privacy or how we handle your data,
        please use our <InlineLink href='/contact'>contact page</InlineLink>.
      </p>
    ),
  },
  {
    title: 'Updates to This Policy',
    content: (
      <p>
        We may update this policy. The date above shows the last revision;
        material changes will be announced on this site.
      </p>
    ),
  },
];

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const _params = await props.params;
  const description = `Privacy Policy for ${homeTitle}. Last updated on ${LAST_UPDATED}.`;

  return createMetadata({
    title: 'Privacy Policy',
    description,
    openGraph: {
      url: '/privacy',
    },
    alternates: {
      canonical: '/privacy',
    },
  });
}
