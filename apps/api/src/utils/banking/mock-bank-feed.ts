import { randomUUID } from 'crypto';
import type {
  BankFeedProvider,
  FeedTransaction,
  FeedBalance,
  PaymentInitiationParams,
  PaymentInitiationResult,
} from './bank-feed.interface';

const NARRATION_TEMPLATES = [
  'NEFT-{ref}-{party}-SALARY {month}',
  'IMPS/{ref}/{party}/PAYMENT',
  'UPI/{ref}/{party}@upi/PURCHASE',
  'NEFT CR-{ref}-{party}-INVOICE PAYMENT',
  'BIL/ONL/{ref}/{party}/ELECTRICITY',
  'IMPS/{ref}/{party}/RENT {month}',
  'UPI/{ref}/{party}@ybl/REIMBURSEMENT',
  'NEFT-{ref}-{party}-VENDOR PAYMENT',
  'CHQ DEP-{ref}-{party}',
  'ATM WDL-{ref}-SELF',
];

const PARTIES = [
  'TATA CONSULTANCY', 'RELIANCE IND', 'BHARTI AIRTEL', 'INFOSYS LTD',
  'HCL TECHNOLOGIES', 'WIPRO LTD', 'MAHINDRA AUTO', 'BAJAJ FINANCE',
  'HDFC BANK LTD', 'ICICI SECURITIES',
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomRef(): string {
  return `N${randomInt(100000000, 999999999)}`;
}

function buildNarration(): string {
  const template = NARRATION_TEMPLATES[randomInt(0, NARRATION_TEMPLATES.length - 1)]!;
  const party = PARTIES[randomInt(0, PARTIES.length - 1)]!;
  const month = MONTHS[randomInt(0, 11)]!;
  return template.replace('{ref}', randomRef()).replace('{party}', party).replace('{month}', month);
}

function generateMockTransactions(fromDate: string, toDate: string): FeedTransaction[] {
  const count = randomInt(5, 10);
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const range = Math.max(to.getTime() - from.getTime(), 86400_000);
  let balance = randomInt(100000, 5000000);

  const transactions: FeedTransaction[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.floor(Math.random() * range);
    const date = new Date(from.getTime() + offset);
    const dateStr = date.toISOString().slice(0, 10);
    const type: 'credit' | 'debit' = Math.random() > 0.4 ? 'debit' : 'credit';
    const amount = parseFloat((randomInt(500, 500000) + Math.random()).toFixed(2));

    balance = type === 'credit' ? balance + amount : balance - amount;

    transactions.push({
      transactionDate: dateStr,
      valueDate: dateStr,
      type,
      amount,
      reference: `MOCK-${randomRef()}`,
      narration: buildNarration(),
      runningBalance: parseFloat(balance.toFixed(2)),
    });
  }

  return transactions.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
}

export class MockBankFeedProvider implements BankFeedProvider {
  async fetchTransactions(accountId: string, fromDate: string, toDate: string): Promise<FeedTransaction[]> {
    return generateMockTransactions(fromDate, toDate);
  }

  async getBalance(accountId: string): Promise<FeedBalance> {
    return {
      accountId,
      balance: parseFloat((randomInt(100000, 5000000) + Math.random()).toFixed(2)),
      asOf: new Date().toISOString(),
    };
  }

  async initiatePayment(params: PaymentInitiationParams): Promise<PaymentInitiationResult> {
    return {
      transactionId: randomUUID(),
      status: 'completed',
      utrNumber: `MOCK-UTR-${randomInt(100000000, 999999999)}`,
    };
  }
}
