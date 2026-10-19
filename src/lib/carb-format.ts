import { format, formatDistanceToNow } from 'date-fns';

export const formatCurrency = (value: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatCarbonTonnes = (tonnes: number): string => {
  if (tonnes >= 1_000_000) {
    return `${(tonnes / 1_000_000).toFixed(2)} Mt`;
  }
  if (tonnes >= 1000) {
    return `${(tonnes / 1000).toFixed(2)} kt`;
  }
  return `${tonnes.toFixed(2)} t`;
};

export const formatPercentage = (value: number, decimals = 2): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

export const formatAddress = (address: string, chars = 4): string => {
  if (!address) {
    return '';
  }
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
};

export const formatDate_ = (timestamp: number | Date): string => {
  try {
    const date =
      typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
    return format(date, 'PPP p');
  } catch {
    return 'Invalid date';
  }
};

export const formatRelativeTime = (timestamp: number | Date): string => {
  try {
    const date =
      typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Invalid date';
  }
};

export const calculatePercentageChange = (
  current: number,
  previous: number
): number => {
  if (previous === 0) {
    return 0;
  }
  return ((current - previous) / previous) * 100;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const validateEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email);
};

export const validateWalletAddress = (address: string): boolean => {
  return WALLET_ADDRESS_REGEX.test(address);
};

export const shortenText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
};

export const debounce = <T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const classNames = (
  ...classes: (string | undefined | null | false)[]
): string => {
  return classes.filter(Boolean).join(' ');
};

export const toWei = (value: string | number, decimals = 18): bigint => {
  const strValue = value.toString();
  const [whole, decimal] = strValue.split('.');
  const decimalPart = decimal
    ? decimal.padEnd(decimals, '0').slice(0, decimals)
    : '0'.repeat(decimals);
  return BigInt(whole + decimalPart);
};

export const fromWei = (
  value: bigint | string | number,
  decimals = 18
): number => {
  const strValue = value.toString();
  const intValue = BigInt(strValue);
  const divisor = BigInt(10) ** BigInt(decimals);
  return Number(intValue) / Number(divisor);
};

export const calculateROI = (
  invested: number,
  currentValue: number
): number => {
  if (invested === 0) {
    return 0;
  }
  return ((currentValue - invested) / invested) * 100;
};

interface GradientContext {
  createLinearGradient?: (
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => CanvasGradient;
}

export const generateChartGradient = (
  ctx: GradientContext | null | undefined
): CanvasGradient | undefined => {
  if (!ctx?.createLinearGradient) {
    return undefined;
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, 'rgba(34, 197, 94, 0.2)');
  gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
  return gradient;
};
