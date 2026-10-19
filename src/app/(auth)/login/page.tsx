import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions, linkItems } from '@/app/layout.shared';
import { Header } from '@/components/sections/header';
import { isAuthConfigured } from '@/server/auth/enabled';
import { SignInCard } from './sign-in-card';

export default function LoginPage() {
  return (
    <HomeLayout
      {...baseOptions}
      className='pt-0'
      links={linkItems}
      nav={{
        component: <Header links={linkItems} {...baseOptions} />,
      }}
    >
      <main className='flex flex-1'>
        <div className='container relative mx-auto flex min-h-full flex-1 items-center justify-center border-border border-x border-b border-dashed'>
          {isAuthConfigured ? (
            <SignInCard />
          ) : (
            <div className='mx-auto max-w-xl px-6 py-10 text-center'>
              <h1 className='font-medium text-lg md:text-xl'>
                Sign-in is not enabled
              </h1>
              <p className='mt-2 text-muted-foreground text-sm'>
                Accounts and comments are not enabled on this deployment yet.
                The marketplace, docs and blog work without signing in.
              </p>
            </div>
          )}
        </div>
      </main>
    </HomeLayout>
  );
}
