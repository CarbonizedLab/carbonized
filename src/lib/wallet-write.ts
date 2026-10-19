import type { Hash, WalletClient } from 'viem';
import { targetChain } from '@/config/wagmi';

export const writeContractOnTargetChain = async (
  walletClient: WalletClient,
  request: unknown
): Promise<Hash> => {
  const chainId = await walletClient.getChainId();
  if (chainId !== targetChain.id) {
    throw new Error(
      `Wrong network: switch to ${targetChain.name} (chain ${targetChain.id}).`
    );
  }

  return await walletClient.writeContract({
    ...(request as object),
    chain: targetChain,
  } as never);
};
