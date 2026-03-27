import type { BankFeedProvider } from './bank-feed.interface';
import { MockBankFeedProvider } from './mock-bank-feed';

let instance: BankFeedProvider | null = null;

export function getBankFeedProvider(): BankFeedProvider {
  if (instance) return instance;

  const provider = process.env.BANK_FEED_PROVIDER ?? 'mock';

  switch (provider) {
    case 'mock':
    default:
      instance = new MockBankFeedProvider();
      break;
  }

  return instance;
}

export type { BankFeedProvider, FeedTransaction, FeedBalance, PaymentInitiationParams, PaymentInitiationResult } from './bank-feed.interface';
