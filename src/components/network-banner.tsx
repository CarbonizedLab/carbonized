'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { isMainnetNetwork } from '@/lib/network';

const DEFAULT_MESSAGE =
  'Testnet / unaudited: this deployment uses test tokens with no real value, the smart contracts have not been independently audited, and credits do not represent real-world emissions reductions.';

const MAINNET_UNAUDITED_MESSAGE =
  'Beta: contracts are not yet independently audited and listed credits are demo inventory.';

const DISMISS_KEY = 'carbonized:beta-notice-dismissed';

/**
 * Slim, dismissible notice used inside the app. On testnet it stays visible
 * (it cannot be dismissed) because the tokens have no real value. On mainnet
 * the notice can be closed and stays closed for the browser session. The same
 * disclosure always remains in the site footer.
 */
export const NetworkBanner = ({ children }: { children?: ReactNode }) => {
  // Start hidden so the server render and first client render match; the
  // effect below reveals the notice (or keeps it hidden if it was dismissed).
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!isMainnetNetwork) {
      setDismissed(false);
      return;
    }
    setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  const canDismiss = isMainnetNetwork;

  if (dismissed) {
    return null;
  }

  return (
    <output className='flex items-center justify-center gap-3 border-amber-500/40 border-b border-dashed bg-amber-500/10 px-4 py-1 text-center text-[11px] text-amber-800 leading-5 dark:text-amber-200'>
      <span>
        {children ??
          (isMainnetNetwork ? MAINNET_UNAUDITED_MESSAGE : DEFAULT_MESSAGE)}
      </span>
      {canDismiss ? (
        <button
          aria-label='Dismiss notice'
          className='shrink-0 rounded p-0.5 hover:bg-amber-500/20'
          onClick={() => {
            window.sessionStorage.setItem(DISMISS_KEY, '1');
            setDismissed(true);
          }}
          type='button'
        >
          <X className='size-3' />
        </button>
      ) : null}
    </output>
  );
};
