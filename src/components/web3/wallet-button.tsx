'use client';

import { useAppKit } from '@reown/appkit/react';
import { LogOut, Wallet } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { Button } from '@/components/ui/button';
import { isReownEnabled, targetChain } from '@/config/wagmi';
import { formatAddress } from '@/lib/carb-format';

const ConnectedWalletButton = () => {
  const { address, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!address) {
    return null;
  }

  if (chainId !== targetChain.id) {
    return (
      <Button
        onClick={() => switchChain({ chainId: targetChain.id })}
        size='sm'
        variant='destructive'
      >
        Switch to {targetChain.name}
      </Button>
    );
  }

  return (
    <Button onClick={() => disconnect()} size='sm' variant='outline'>
      <Wallet />
      {formatAddress(address)}
      <LogOut />
    </Button>
  );
};

const ReownWalletButton = () => {
  const { isConnected } = useAccount();
  const { open } = useAppKit();

  if (isConnected) {
    return <ConnectedWalletButton />;
  }

  return (
    <Button onClick={() => open()} size='sm'>
      <Wallet />
      Connect Wallet
    </Button>
  );
};

const InjectedWalletButton = () => {
  const { isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();

  if (isConnected) {
    return <ConnectedWalletButton />;
  }

  const connector = connectors[0];
  return (
    <Button
      disabled={!connector || isPending}
      onClick={() => connector && connect({ connector })}
      size='sm'
    >
      <Wallet />
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </Button>
  );
};

export const WalletButton = () =>
  isReownEnabled ? <ReownWalletButton /> : <InjectedWalletButton />;
