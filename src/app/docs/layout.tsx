import type { ReactNode } from 'react';
import { DocsLayout } from '@/components/docs';
import { docsSource } from '@/lib/source';
import { baseOptions, linkItems } from '../layout.shared';

const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <DocsLayout {...baseOptions} links={linkItems} tree={docsSource.pageTree}>
      {children}
    </DocsLayout>
  );
};

export default Layout;
