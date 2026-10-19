import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';

const AppLayout = ({ children }: { children: ReactNode }) => (
  <AppShell>{children}</AppShell>
);

export default AppLayout;
