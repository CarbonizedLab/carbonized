import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import { Icons } from '@/components/icons/icons';

export const title = 'Carbonized';
export const description =
  'Onchain carbon credit marketplace on Robinhood Chain with order book, auctions and retirement certificates. Early-stage, unaudited software.';
export const owner = 'Carbonized';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className='inline-flex items-center gap-2.5'>
        <Image
          alt='Carbonized'
          className='size-8 rounded object-contain'
          height={1254}
          priority
          src='/brand/carbonized-logo-source.png'
          width={1254}
        />
        <span>{title}</span>
      </span>
    ),
  },
};

export const linkItems: LinkItemType[] = [
  {
    type: 'icon',
    icon: <Icons.x className='size-4' />,
    text: 'X',
    label: 'Carbonized on X',
    url: 'https://x.com/CarbonizedApp',
    external: true,
    secondary: true,
  },
  {
    icon: <Icons.info />,
    text: 'Docs',
    url: '/docs',
    active: 'nested-url',
  },
  {
    icon: <Icons.info />,
    text: 'About',
    url: '/about',
    active: 'url',
  },
  {
    icon: <Icons.fees />,
    text: 'Fees',
    url: '/fees',
    active: 'url',
  },
  {
    icon: <Icons.phone />,
    text: 'Contact',
    url: '/contact',
    active: 'url',
  },
  {
    icon: <Icons.info />,
    text: 'Roadmap',
    url: '/roadmap',
    active: 'url',
  },
  {
    type: 'menu',
    text: 'Blog',
    items: [
      {
        text: 'Posts',
        description: 'View all blog posts',
        url: '/blog',
        icon: <Icons.posts />,
      },
      {
        text: 'Tags',
        description: 'View blog posts by tags',
        url: '/tags',
        icon: <Icons.tags />,
      },
    ],
  },
];

export const postsPerPage = 5;
