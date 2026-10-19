import type { ReactNode } from 'react';
import { isMainnetNetwork } from '@/lib/network';

const DEFAULT_MESSAGE =
  'Testnet / unaudited: this deployment uses test tokens with no real value, the smart contracts have not been independently audited, and credits do not represent real-world emissions reductions.';

const MAINNET_UNAUDITED_MESSAGE =
  'Beta on Robinhood Chain mainnet. Contracts are not yet independently audited, and listed credits are not verified real-world emissions reductions.';

/**
 * Visible warning shown whenever `NEXT_PUBLIC_NETWORK` is not
 * `robinhood-mainnet` (testnet), AND also on mainnet until this deployment
 * has passed an independent audit and uses a real production multisig.
 * Server-safe (no hooks); pass `children` for a translated message inside
 * the app.
 */
export const NetworkBanner = ({ children }: { children?: ReactNode }) => (
  <output className='block border-amber-500/40 border-b border-dashed bg-amber-500/15 px-4 py-2 text-center font-medium text-amber-800 text-xs dark:text-amber-200'>
    {children ??
      (isMainnetNetwork ? MAINNET_UNAUDITED_MESSAGE : DEFAULT_MESSAGE)}
  </output>
);
