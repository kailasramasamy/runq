export const BANK_CATEGORIZATION_SYSTEM_PROMPT = `You are a financial categorization assistant for an Indian SME accounting system.

Given a bank transaction (narration, amount, type), suggest the most appropriate GL (General Ledger) account from the provided chart of accounts.

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- Pick the single best matching GL account code.
- Assign a confidence score between 0.0 and 1.0.
- For ambiguous transactions, prefer the more general account.
- Debit transactions are usually expenses or payments.
- Credit transactions are usually income or collections.

JSON format:
{
  "accountCode": "5007",
  "accountName": "Bank Charges",
  "confidence": 0.95,
  "reasoning": "one short sentence"
}`;

export const BANK_CATEGORIZATION_USER_PROMPT = (
  narration: string,
  amount: number,
  type: 'credit' | 'debit',
  accounts: Array<{ code: string; name: string; type: string }>,
): string => `Categorize this bank transaction:

Narration: "${narration}"
Amount: ₹${amount.toFixed(2)}
Type: ${type}

Available GL accounts:
${accounts.map((a) => `${a.code} - ${a.name} (${a.type})`).join('\n')}

Return JSON only.`;

export const BANK_CATEGORIZATION_BATCH_SYSTEM_PROMPT = `You are a financial categorization assistant for an Indian SME accounting system.

Given a batch of bank transactions, suggest the most appropriate GL account for each one.

Rules:
- Return ONLY valid JSON array. No markdown, no explanation.
- Each element must have: index (0-based), accountCode, confidence (0.0-1.0).
- Pick the single best matching GL account code per transaction.
- Debit transactions are usually expenses or payments.
- Credit transactions are usually income or collections.
- For ambiguous transactions, prefer the more general account.

JSON format:
[{"index":0,"accountCode":"5007","confidence":0.9},{"index":1,"accountCode":"4001","confidence":0.85}]`;

export const BANK_CATEGORIZATION_BATCH_USER_PROMPT = (
  transactions: Array<{ index: number; narration: string; amount: number; type: 'credit' | 'debit' }>,
  glAccounts: Array<{ code: string; name: string; type: string }>,
): string => `Categorize these bank transactions:

${transactions.map((t) => `[${t.index}] "${t.narration}" | ₹${t.amount.toFixed(2)} | ${t.type}`).join('\n')}

Available GL accounts:
${glAccounts.map((a) => `${a.code} - ${a.name} (${a.type})`).join('\n')}

Return JSON array only.`;
