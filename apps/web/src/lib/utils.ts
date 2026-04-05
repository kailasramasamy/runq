import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number in Indian numbering system
 * 1234567 → "12,34,567"
 */
export function formatIndianNumber(num: number): string {
  const str = Math.abs(num).toFixed(2);
  const [integer, decimal] = str.split('.');
  const lastThree = integer.slice(-3);
  const rest = integer.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const result = rest ? `${formatted},${lastThree}` : lastThree;
  return `${num < 0 ? '-' : ''}${result}.${decimal}`;
}

/**
 * Format amount as Indian Rupees
 * 1234567 → "₹12,34,567.00"
 */
export function formatINR(amount: number): string {
  return `₹${formatIndianNumber(amount)}`;
}

/**
 * Format in Indian accounting convention — negatives in parentheses
 * -1234567 → "(₹12,34,567.00)"
 */
export function formatINRAccounting(amount: number): string {
  if (amount < 0) {
    const str = formatIndianNumber(Math.abs(amount));
    return `(₹${str})`;
  }
  return `₹${formatIndianNumber(amount)}`;
}
