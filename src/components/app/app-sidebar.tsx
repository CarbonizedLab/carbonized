'use client';

import {
  ArrowLeft,
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Coins,
  Factory,
  Gavel,
  Gem,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  UserRound,
  Vote,
  Wallet,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { targetChain } from '@/config/wagmi';
import { type TranslateFn, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { navMessages } from './nav-messages';

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** Path prefix that keeps the item highlighted on nested routes. */
  matchPrefix?: string;
}

interface NavGroup {
  id: string;
  labelKey: string;
  items: readonly NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'overview',
    labelKey: 'group.overview',
    items: [{ href: '/app', labelKey: 'nav.dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'emissions',
    labelKey: 'group.emissions',
    items: [
      { href: '/app/emissions', labelKey: 'nav.emissions', icon: Factory },
      { href: '/app/assess', labelKey: 'nav.assess', icon: ClipboardCheck },
    ],
  },
  {
    id: 'credits',
    labelKey: 'group.credits',
    items: [
      { href: '/app/tokenize', labelKey: 'nav.tokenize', icon: Coins },
      {
        href: '/app/carbon-wallet',
        labelKey: 'nav.carbonWallet',
        icon: Wallet,
      },
      { href: '/app/portfolio', labelKey: 'nav.portfolio', icon: Briefcase },
      {
        href: '/app/credit-requests',
        labelKey: 'nav.creditRequests',
        icon: Inbox,
      },
      { href: '/app/issuer', labelKey: 'nav.issuer', icon: BadgeCheck },
    ],
  },
  {
    id: 'trading',
    labelKey: 'group.trading',
    items: [
      { href: '/app/marketplace', labelKey: 'nav.marketplace', icon: Store },
      { href: '/app/auctions', labelKey: 'nav.auctions', icon: Gavel },
      { href: '/app/sell-credits', labelKey: 'nav.sell', icon: Tag },
    ],
  },
  {
    id: 'compliance',
    labelKey: 'group.compliance',
    items: [
      { href: '/app/certificates', labelKey: 'nav.certificates', icon: Award },
      { href: '/app/audit', labelKey: 'nav.audit', icon: ShieldCheck },
      { href: '/app/settings', labelKey: 'nav.settings', icon: Settings },
    ],
  },
  {
    id: 'token',
    labelKey: 'group.token',
    items: [
      { href: '/app/token', labelKey: 'nav.token', icon: Gem },
      { href: '/app/governance', labelKey: 'nav.governance', icon: Vote },
    ],
  },
  {
    id: 'accounts',
    labelKey: 'group.accounts',
    items: [
      {
        href: '/app/company/dashboard',
        matchPrefix: '/app/company',
        labelKey: 'nav.company',
        icon: Building2,
      },
      {
        href: '/app/trader/dashboard',
        matchPrefix: '/app/trader',
        labelKey: 'nav.trader',
        icon: UserRound,
      },
    ],
  },
];

const isActive = (pathname: string, item: NavItem): boolean => {
  const base = item.matchPrefix ?? item.href;
  if (base === '/app') {
    return pathname === base || pathname === `${base}/`;
  }
  return pathname === base || pathname.startsWith(`${base}/`);
};

const NavLink = ({
  item,
  active,
  collapsed,
  label,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  label: string;
  onNavigate?: () => void;
}) => {
  const Icon = item.icon;
  const link = (
    <Link
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group flex items-center gap-3 border-l-2 px-3 py-2 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
        collapsed && 'justify-center px-0',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      href={item.href}
      onClick={onNavigate}
    >
      <Icon
        aria-hidden='true'
        className={cn('size-4 shrink-0', active && 'text-primary')}
      />
      {collapsed ? null : <span className='truncate'>{label}</span>}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side='right' sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
};

const NavGroups = ({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) => {
  const pathname = usePathname();
  const t = useT(navMessages);

  return (
    <nav
      aria-label={t('sidebar.label')}
      className='min-h-0 flex-1 space-y-4 overflow-y-auto py-4'
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.id}>
          {collapsed ? (
            <div
              aria-hidden='true'
              className='mx-3 mb-2 border-t border-dashed'
            />
          ) : (
            <h2
              className='mb-1 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider'
              id={`nav-group-${group.id}`}
            >
              {t(group.labelKey)}
            </h2>
          )}
          <ul aria-label={collapsed ? t(group.labelKey) : undefined}>
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  active={isActive(pathname, item)}
                  collapsed={collapsed}
                  item={item}
                  label={t(item.labelKey)}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
};

const StatusDot = ({ ok }: { ok: boolean }) => (
  <span
    aria-hidden='true'
    className={cn(
      'size-2 shrink-0 rounded-full',
      ok ? 'bg-emerald-500' : 'bg-amber-500'
    )}
  />
);

interface StatusEntry {
  id: string;
  ok: boolean;
  label: string;
}

const getStatusEntries = (
  t: TranslateFn,
  state: {
    isConnected: boolean;
    chainId: number | undefined;
    contractsConfigured: boolean;
  }
): StatusEntry[] => {
  let networkLabel = t('status.networkUnknown');
  if (state.isConnected && state.chainId !== undefined) {
    networkLabel =
      state.chainId === targetChain.id
        ? t('status.networkOk')
        : t('status.networkWrong');
  }
  return [
    {
      id: 'wallet',
      ok: state.isConnected,
      label: state.isConnected ? t('status.walletOn') : t('status.walletOff'),
    },
    {
      id: 'network',
      ok: state.isConnected && state.chainId === targetChain.id,
      label: networkLabel,
    },
    {
      id: 'contracts',
      ok: state.contractsConfigured,
      label: state.contractsConfigured
        ? t('status.contractsOk')
        : t('status.contractsMissing'),
    },
  ];
};

const StatusChips = ({
  collapsed,
  contractsConfigured,
}: {
  collapsed: boolean;
  contractsConfigured: boolean;
}) => {
  const t = useT(navMessages);
  const { isConnected, chainId } = useAccount();
  const entries = getStatusEntries(t, {
    isConnected,
    chainId,
    contractsConfigured,
  });

  return (
    <section
      aria-label={t('status.title')}
      className='border-t border-dashed p-3'
    >
      {collapsed ? null : (
        <h2 className='mb-2 px-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider'>
          {t('status.title')}
        </h2>
      )}
      <ul
        className={cn(
          'flex gap-1.5',
          collapsed ? 'flex-col items-center' : 'flex-col items-stretch'
        )}
      >
        {entries.map((entry) => (
          <li
            className={cn(
              'flex items-center gap-2 border border-dashed text-xs',
              collapsed ? 'justify-center p-1.5' : 'px-2 py-1'
            )}
            key={entry.id}
            title={collapsed ? entry.label : undefined}
          >
            <StatusDot ok={entry.ok} />
            {collapsed ? (
              <span className='sr-only'>{entry.label}</span>
            ) : (
              <span className='truncate'>{entry.label}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

const FOOTER_LINKS: readonly NavItem[] = [
  { href: '/docs', labelKey: 'sidebar.docs', icon: BookOpen },
  { href: '/', labelKey: 'sidebar.website', icon: ArrowLeft },
];

const BrandLink = ({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) => {
  const t = useT(navMessages);
  return (
    <Link
      aria-label={t('sidebar.brandLabel')}
      className='flex min-w-0 items-center gap-2 font-semibold text-sm focus-visible:outline-2 focus-visible:outline-ring'
      href='/'
      onClick={onNavigate}
    >
      <span className='inline-flex size-8 shrink-0 overflow-hidden bg-black'>
        <Image
          alt='Carbonized'
          className='size-full object-contain'
          height={1254}
          priority
          src='/brand/carbonized-logo-source.png'
          width={1254}
        />
      </span>
      {collapsed ? null : (
        <span className='flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('sidebar.title')}</span>
          <span className='shrink-0 rounded-full border border-border px-1.5 py-0.5 font-mono font-normal text-[10px] text-muted-foreground uppercase tracking-wider'>
            Beta
          </span>
        </span>
      )}
    </Link>
  );
};

const SidebarFooterLinks = ({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) => {
  const t = useT(navMessages);
  return (
    <ul className='border-t border-dashed py-2'>
      {FOOTER_LINKS.map((item) => (
        <li key={item.href}>
          <NavLink
            active={false}
            collapsed={collapsed}
            item={item}
            label={t(item.labelKey)}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  );
};

export const AppSidebar = ({
  collapsed,
  onToggleCollapsed,
  contractsConfigured,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  contractsConfigured: boolean;
}) => {
  const t = useT(navMessages);
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  const toggleLabel = collapsed ? t('sidebar.expand') : t('sidebar.collapse');

  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-dashed bg-card transition-[width] duration-200 lg:flex',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2 border-b border-dashed px-3',
          collapsed && 'justify-center px-0'
        )}
      >
        <BrandLink collapsed={collapsed} />
      </div>
      <NavGroups collapsed={collapsed} />
      <StatusChips
        collapsed={collapsed}
        contractsConfigured={contractsConfigured}
      />
      <SidebarFooterLinks collapsed={collapsed} />
      <button
        aria-expanded={!collapsed}
        aria-label={toggleLabel}
        className={cn(
          'flex h-10 shrink-0 items-center gap-3 border-t border-dashed px-4 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
          collapsed && 'justify-center px-0'
        )}
        onClick={onToggleCollapsed}
        title={toggleLabel}
        type='button'
      >
        <ToggleIcon aria-hidden='true' className='size-4 shrink-0' />
        {collapsed ? null : <span className='truncate'>{toggleLabel}</span>}
      </button>
    </aside>
  );
};

const LOCK_CLASS = 'overflow-hidden';

export const MobileNavDrawer = ({
  id,
  open,
  onClose,
  contractsConfigured,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  contractsConfigured: boolean;
}) => {
  const t = useT(navMessages);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
    if (!open) {
      return;
    }
    document.body.classList.add(LOCK_CLASS);
    return () => document.body.classList.remove(LOCK_CLASS);
  }, [open]);

  return (
    <dialog
      aria-label={t('sidebar.label')}
      className='fixed inset-0 m-0 hidden size-full max-h-none max-w-none bg-transparent p-0 text-foreground open:block lg:hidden'
      id={id}
      onClose={onClose}
      ref={dialogRef}
    >
      <button
        aria-hidden='true'
        className='absolute inset-0 cursor-default bg-black/50'
        onClick={onClose}
        tabIndex={-1}
        type='button'
      />
      <div className='relative flex h-full w-72 max-w-[85vw] flex-col border-r border-dashed bg-card'>
        <div className='flex h-14 shrink-0 items-center justify-between border-b border-dashed px-3'>
          <BrandLink collapsed={false} onNavigate={onClose} />
          <button
            aria-label={t('sidebar.closeMenu')}
            className='inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring'
            onClick={onClose}
            type='button'
          >
            <X aria-hidden='true' className='size-4' />
          </button>
        </div>
        <NavGroups collapsed={false} onNavigate={onClose} />
        <StatusChips
          collapsed={false}
          contractsConfigured={contractsConfigured}
        />
        <SidebarFooterLinks collapsed={false} onNavigate={onClose} />
      </div>
    </dialog>
  );
};
