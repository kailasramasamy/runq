# Recipe 08 — Import your bank statement

> **Time:** 3 minutes · **You'll need:** a CSV file from your bank's net banking portal
> **Do this:** weekly. Pick a fixed day (e.g. Wednesday morning) and stick to it.

Importing your bank statement pulls every credit and debit from your bank into runQ. Once imported, runQ can **reconcile** them — matching credits to your customer receipts and debits to your vendor payments — so you always know exactly what's in your account vs what's in your books.

---

## Prereq: Add a bank account

If you haven't already, add your bank account to runQ.

1. Sidebar → **Banking → Accounts → + New Account**
2. Fill in:
   - **Account Name** — your label, e.g. `HDFC Current 1234`
   - **Bank Name** — `HDFC Bank`
   - **Account Number** — the full 14-digit account number
   - **IFSC Code** — `HDFC0001234`
   - **Account Type** — Current / Savings / Cash Credit
   - **Opening Balance** — what was in the account on the day you started using runQ
   - **Opening Date** — the same day
3. Save.

You only do this once per bank account.

---

## Get your CSV from your bank

Every Indian bank lets you download statements as CSV from their net banking portal. The exact path varies:

| Bank | Path |
|---|---|
| **HDFC** | NetBanking → Account → Statement → Date Range → Download as CSV |
| **ICICI** | iMobile / Web → Accounts → Statement → Download → CSV |
| **SBI** | OnlineSBI → Account Summary → Mini Statement / Download Statement → CSV |
| **Axis** | Internet Banking → Account → Statement → Custom Range → CSV |
| **Kotak** | Net Banking → Accounts → Statement → CSV |

Pick a date range from "the day after your last import" to "today".

> 💡 **Don't overlap.** If you import the same statement twice, the second import will skip duplicates — but it's tidier to pick non-overlapping ranges. The auto-deduplication relies on date + amount + reference, so as long as those match, it's safe.

### Expected CSV format

runQ expects 6 columns in this order:

| Date | Narration | Reference | Debit | Credit | Balance |
|---|---|---|---|---|---|
| 2026-03-01 | NEFT Transfer to Crompton | UTR123456 | 50000 | (blank) | 150000 |
| 2026-03-02 | Salary Credit from Sharma | (blank) | (blank) | 100000 | 250000 |

If your bank's CSV has different column names or extra columns, **paste only the relevant 6 columns** when you import. (You can also pre-process in Excel if needed.)

---

## Import the CSV

### 1. Open the import page

Sidebar → **Banking → Transactions → Import**

You'll see a 4-step wizard.

### 2. Step 1 — Select Bank Account

Pick the bank account you're importing into. The dropdown shows all the accounts you've added.

### 3. Step 2 — Paste CSV Data

Open your CSV in any text editor (or Excel → Save As → CSV). Select all the rows including the header, copy, and paste into the **CSV Data** textbox.

It should look like:

```
Date,Narration,Reference,Debit,Credit,Balance
2026-04-01,NEFT to Crompton Distributors,UTR2604001,112000,,375000
2026-04-02,Receipt from Sharma Electricals,UTR2604002,,85000,460000
2026-04-03,GST Refund,,5430,,454570
...
```

Click **Preview Rows**.

### 4. Step 3 — Preview

runQ shows the first 20 parsed rows in a table. Each row has:
- Date in `YYYY-MM-DD`
- Narration (the text from the bank)
- Reference (UTR / cheque number / UPI ref)
- Debit (in red)
- Credit (in green)
- Balance

**Sanity check:**
- Are dates parsed correctly?
- Do the Debit/Credit columns line up correctly? (If the bank flipped them, you'll see all your payments as receipts and vice versa — fix the CSV before continuing.)
- Does the row count match what you expected from the bank?

If something looks wrong, click **Back**, fix the CSV, and retry.

If everything looks right, click **Import N Transactions**.

### 5. Step 4 — Results

runQ shows three counters:

- **Imported** — the new transactions added
- **Duplicates Skipped** — rows that already existed (same date + amount + reference)
- **Errors** — rows that couldn't be parsed (with row numbers and reasons)

If there are errors, fix them in the CSV and re-import — duplicates from the successful rows will be safely skipped.

Click **View Transactions** to see your full bank ledger.

---

## What runQ does after import

For each new transaction, runQ:
1. Stores it as an **unreconciled** bank transaction
2. Updates the running balance for the bank account
3. Runs the matching engine to find candidate matches (customer receipts, vendor payments, transfers)
4. Surfaces all of this on the **Banking → Reconciliation** page

The next step is to actually reconcile them — see [Recipe 09](./09-reconcile-bank.md).

---

## Common gotchas

- **Wrong column order** — runQ expects Date, Narration, Reference, Debit, Credit, Balance. If your bank's CSV is different, reorder columns in Excel before pasting.
- **Date format** — must be `YYYY-MM-DD`. If your bank uses `DD/MM/YYYY`, convert it in Excel: select column → Format Cells → Custom → `yyyy-mm-dd`.
- **Comma in narration** — if a vendor's name contains a comma, the CSV parser may split the row. Either replace commas with spaces in the narration, or wrap that field in double quotes.
- **Missing reference numbers** — bank charges and interest don't have a UTR. That's fine — they import normally, but you'll have to manually categorise them during reconciliation.

---

## What's next

- [Recipe 09 — Reconcile your bank →](./09-reconcile-bank.md) — do this immediately after importing
