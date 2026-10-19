import { resolveLinkItems } from 'fumadocs-ui/layouts/shared';
import { linkItems, owner, postsPerPage } from '@/app/layout.shared';
import { getSortedByDatePosts, getTags } from '@/lib/source';
import { cn } from '@/lib/utils';
import { isAuthConfigured } from '@/server/auth/enabled';
import { ActiveLink } from '../active-link';
import { UserButton } from '../auth/user-button';

export function Footer() {
  const links = resolveLinkItems({ links: linkItems });
  const navItems = links.filter((item) =>
    ['nav', 'all'].includes(item.on ?? 'all')
  );

  const posts = getSortedByDatePosts();
  const tags = getTags();

  return (
    <footer
      className={cn(
        'container mx-auto flex flex-col gap-4',
        'gap-16 px-8 py-16'
      )}
    >
      <div
        className={cn(
          'grid gap-8 text-muted-foreground text-sm sm:grid-cols-2 lg:grid-cols-5'
        )}
      >
        <div className='flex flex-col gap-6'>
          <p className='font-medium text-foreground'>Pages</p>

          <ul className='flex flex-col gap-3'>
            <li>
              <ActiveLink href={'/'}>Home</ActiveLink>
            </li>
            <li>
              <ActiveLink href={'/app'}>Launch App</ActiveLink>
            </li>
            {navItems
              .filter(
                (item) =>
                  item.type !== 'menu' &&
                  item.type !== 'custom' &&
                  item.type !== 'icon'
              )
              .map((item, i) => (
                <li key={item.url}>
                  <ActiveLink href={item.url} key={i.toString()}>
                    {item.text}
                  </ActiveLink>
                </li>
              ))}
          </ul>
        </div>

        <div className='flex flex-col gap-6'>
          <p className='font-medium text-foreground'>Posts</p>

          <ul className='flex flex-col gap-3'>
            {posts.slice(0, postsPerPage).map((post, i) => (
              <li key={post.url}>
                <ActiveLink href={post.url} key={i.toString()}>
                  {post.data.title}
                </ActiveLink>
              </li>
            ))}
          </ul>
        </div>

        <div className='flex flex-col gap-6'>
          <p className='font-medium text-foreground'>Tags</p>

          <ul className='flex flex-col gap-3'>
            {tags.slice(0, postsPerPage).map((name, i) => (
              <li key={`/tags/${name}`}>
                <ActiveLink href={`/tags/${name}`} key={i.toString()}>
                  <span className='capitalize'>{name}</span>
                </ActiveLink>
              </li>
            ))}
          </ul>
        </div>

        <div className='flex flex-col gap-6'>
          <p className='font-medium text-foreground'>Legal</p>

          <ul className='flex flex-col gap-3'>
            <li>
              <ActiveLink href={'/privacy'}>Privacy Policy</ActiveLink>
            </li>
            <li>
              <ActiveLink href={'/terms'}>Terms of Service</ActiveLink>
            </li>
          </ul>
        </div>
        <div className='flex flex-col gap-6'>
          <p className='font-medium text-foreground'>Social</p>
          <ul className='flex flex-col gap-3'>
            <li>
              <a
                className='transition-colors hover:text-foreground'
                href='https://x.com/CarbonizedApp'
                rel='noreferrer'
                target='_blank'
              >
                X @CarbonizedApp
              </a>
            </li>
            <li>
              <a
                className='transition-colors hover:text-foreground'
                href='https://github.com/CarbonizedLab/carbonized'
                rel='noreferrer'
                target='_blank'
              >
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <Copyright />
    </footer>
  );
}

function Copyright() {
  return (
    <div className='grid items-center gap-4 sm:grid-cols-3'>
      <div className='w-min'>{isAuthConfigured ? <UserButton /> : null}</div>
      <div className='flex items-center sm:justify-center'>
        <p className='whitespace-nowrap text-muted-foreground text-sm'>
          &copy; {new Date().getFullYear()} {owner}. All rights reserved.
        </p>
      </div>
      <div className='hidden sm:block' />
      <p className='text-muted-foreground/80 text-xs sm:col-span-3 sm:text-center'>
        Beta on Robinhood Chain mainnet. Contracts are not yet independently
        audited, and listed credits are demo inventory, not verified real-world
        emissions reductions.
      </p>
    </div>
  );
}
