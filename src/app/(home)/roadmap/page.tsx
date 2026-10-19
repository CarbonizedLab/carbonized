import {
  BadgeCheck,
  Check,
  Coins,
  FileSearch,
  ScanFace,
  ShieldCheck,
  Store,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Timeline,
  type TimelineItem,
  type TimelineStatus,
} from '@/components/ui/timeline';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    'Carbonized launch roadmap: controlled mainnet, verification onboarding, issuers, independent audit, registry attestation and CARB.',
};

interface Phase {
  description: string;
  icon: typeof Store;
  id: string;
  items: readonly string[];
  label: string;
  status: TimelineStatus;
  title: string;
}

const phases: readonly Phase[] = [
  {
    id: '01',
    title: 'Controlled marketplace',
    label: 'Live · Beta',
    status: 'completed',
    icon: Store,
    description:
      'Contracts are deployed on Robinhood Chain with USDG settlement. Administration is held by a Safe wallet and the deployer holds no roles.',
    items: [
      'Order book, auctions and retirement certificates',
      'USDG settlement',
      'Safe-held administration',
    ],
  },
  {
    id: '02',
    title: 'Verification onboarding',
    label: 'In preparation',
    status: 'active',
    icon: ScanFace,
    description:
      'Wallet-bound KYC is the access layer before broader participation. The flow is built and fails closed until the provider is switched on.',
    items: [
      'Signed wallet binding',
      'Provider-reviewed identity workflow',
      'Eligibility set onchain by the multisig',
    ],
  },
  {
    id: '03',
    title: 'Issuers and inventory',
    label: 'Next',
    status: 'next',
    icon: BadgeCheck,
    description:
      'The first authorised issuers list inventory. Demo entries are clearly labelled and are never presented as verified credits.',
    items: [
      'Authorised issuer roles',
      'Labelled demo inventory',
      'First listings and settlement',
    ],
  },
  {
    id: '04',
    title: 'Independent audit',
    label: 'Planned',
    status: 'pending',
    icon: ShieldCheck,
    description:
      'An external security audit of the contracts and the app is completed and published before any public rollout.',
    items: [
      'External auditor review',
      'Published report',
      'Fixes verified before opening',
    ],
  },
  {
    id: '05',
    title: 'Registry attestation',
    label: 'Planned',
    status: 'pending',
    icon: FileSearch,
    description:
      'Registry-source evidence strengthens provenance before credits are described as verified inventory.',
    items: [
      'External registry evidence',
      'Serial and freshness checks',
      'Public provenance links',
    ],
  },
  {
    id: '06',
    title: 'CARB utility launch',
    label: 'Planned',
    status: 'pending',
    icon: Coins,
    description:
      'The official CARB contract address is published only after the token is live and verifiable on the explorer.',
    items: [
      'Public contract address',
      'Explorer verification',
      'Utility and governance rollout',
    ],
  },
];

const timelineItems: readonly TimelineItem[] = phases.map((phase) => {
  const Icon = phase.icon;
  return {
    id: phase.id,
    eyebrow: phase.id,
    title: phase.title,
    label: phase.label,
    status: phase.status,
    description: phase.description,
    icon: <Icon aria-hidden='true' className='size-4' />,
    content: (
      <ul className='grid gap-2 sm:grid-cols-3'>
        {phase.items.map((item) => (
          <li
            className='flex items-start gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs'
            key={item}
          >
            <Check
              aria-hidden='true'
              className={cn(
                'mt-0.5 size-3.5 shrink-0',
                phase.status === 'completed'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground/50'
              )}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ),
  };
});

const summary = [
  {
    label: 'Live',
    value: phases.filter((p) => p.status === 'completed').length,
  },
  {
    label: 'In preparation',
    value: phases.filter((p) => p.status === 'active').length,
  },
  {
    label: 'Planned',
    value: phases.filter((p) => p.status === 'next' || p.status === 'pending')
      .length,
  },
] as const;

export default function RoadmapPage() {
  return (
    <main className='container mx-auto px-4 py-16 sm:px-8 md:py-24'>
      <header className='mx-auto flex max-w-3xl flex-col items-center gap-5 text-center'>
        <Badge variant='outline'>Roadmap</Badge>
        <h1 className='font-regular text-4xl tracking-tighter md:text-6xl'>
          Build trust in stages.
        </h1>
        <p className='max-w-2xl text-lg text-muted-foreground leading-relaxed tracking-tight'>
          Each phase opens only when the controls and evidence behind it are in
          place. Statuses describe where we are today, not delivery dates.
        </p>
        <dl className='mt-4 grid w-full max-w-md grid-cols-3 divide-x divide-dashed divide-border rounded-xl border bg-card/60'>
          {summary.map((item) => (
            <div className='flex flex-col gap-1 px-3 py-4' key={item.label}>
              <dd className='font-semibold text-2xl tabular-nums'>
                {item.value}
              </dd>
              <dt className='text-muted-foreground text-xs'>{item.label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <Timeline className='mx-auto mt-16 max-w-3xl' items={timelineItems} />

      <footer className='mx-auto mt-14 flex max-w-3xl flex-col items-center gap-4 text-center'>
        <p className='text-muted-foreground text-sm'>
          Want the full detail on limitations and what is not built yet?
        </p>
        <div className='flex flex-wrap justify-center gap-3'>
          <Button asChild variant='outline'>
            <Link href='/docs/roadmap'>Read the detailed roadmap</Link>
          </Button>
          <Button asChild>
            <Link href='/app'>Launch app</Link>
          </Button>
        </div>
      </footer>
    </main>
  );
}
