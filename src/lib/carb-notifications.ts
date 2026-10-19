import { toast } from 'sonner';

type TradeAction = 'buy' | 'sell';

const canUseBrowserNotification = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const requestNotificationPermission = async () => {
  if (!canUseBrowserNotification()) {
    return;
  }
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn('Notification permission request failed:', error);
    }
  }
};

export const notifyTradeSuccess = (
  action: TradeAction,
  amount: number,
  unitPrice: number,
  txHash?: `0x${string}` | string | null
) => {
  const normalizedAction = action === 'buy' ? 'Purchase' : 'Sale';
  const message = `${normalizedAction} complete: ${amount.toFixed(2)} tonnes @ $${unitPrice.toFixed(2)}/t`;

  toast.success(message);

  if (canUseBrowserNotification() && Notification.permission === 'granted') {
    const body = txHash
      ? `${message}\nTx: ${String(txHash).slice(0, 10)}...`
      : message;
    new Notification('Carbon Marketplace', { body });
  }
};
