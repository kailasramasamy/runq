# Recipe 09 — Reconcile your bank

> **Time:** 5–10 minutes (after auto-reconcile does most of the work) · **You'll need:** an imported bank statement and recorded receipts/payments
> **Do this:** immediately after every bank statement import.

Bank reconciliation is the process of matching every line on your bank statement to a corresponding entry in your books — a customer receipt, a vendor payment, or a recognised expense. When everything matches, your **Bank Balance** equals your **Book Balance**, and you know your numbers are right.

In Tally this is the most-skipped task in any small business. In runQ it takes 5 minutes a week.

---

## Before you start

Make sure:
- ✅ You've [imported your latest bank statement](./08-import-bank-statement.md)
- ✅ You've recorded the [customer receipts](./04-record-customer-payment.md) and [vendor payments](./07-pay-vendor-bill.md) from this period

If you skipped recording receipts/payments, do that first — auto-reconcile can only match transactions to receipts/payments that exist in runQ.

---

## Steps

### 1. Open the Reconciliation page

Sidebar → **Banking → Reconciliation**

You'll see:
- A **Bank Account** dropdown (top left)
- A **Summary Bar** with **Bank Balance**, **Book Balance**, and **Difference**
- An **Auto Reconcile** button (top right)
- Two side-by-side tables: **Unreconciled Bank Transactions** (left) and **Unreconciled Payments & Receipts** (right)

### 2. Pick the bank account

Pick the account you just imported. The page reloads with that account's unreconciled transactions and your unmatched payments/receipts.

### 3. Click "Auto Reconcile"

Click the big **🔄 Auto Reconcile** button at the top right.

runQ runs its matching engine. In a few seconds, you'll see a results card:

- **Matched** — how many transactions were auto-matched
- **Unmatched** — how many couldn't be matched
- **Match Rate** — `Matched / Total`

A typical week has an **80–90% match rate** out of the box. The matches use:
- **Exact UTR match** — highest confidence
- **Amount + date proximity** — high confidence
- **Amount alone** — medium confidence

### 4. Review the auto matches (optional but recommended)

Scroll to the **Recently Matched** section at the bottom. Each match shows:
- Bank transaction ID
- What it matched to (Payment or Receipt)
- The strategy used (`exact_utr`, `amount_date`, etc.)
- The confidence (Exact / High / Medium)
- The amount
- An ❌ unmatch button

If you spot an obviously wrong match, click ❌ to undo it.

### 5. Manually match the rest

The two side-by-side tables show what's still unmatched:

**Left: Unreconciled Bank Transactions**
- Shows everything from the bank that couldn't be auto-matched
- Each row has a confidence badge if there's a *suggested* match (yellow = medium, green = high)

**Right: Unreconciled Payments & Receipts**
- Shows runQ payments and receipts that haven't been matched to a bank transaction yet

To manually match:

1. **Click a bank transaction** on the left (a radio button selects it)
2. **Click a payment or receipt** on the right (a checkbox selects it)
3. The sticky bar at the bottom of the page lights up — **"Ready to match — confirm to link these records"**
4. Click **Match**

The two records pair up. The bank transaction disappears from the left table, the payment/receipt disappears from the right.

### 6. Handle leftover bank transactions

After auto-match and manual match, you may have a few transactions left on the left side that have no corresponding payment/receipt at all. These are usually:

- **Bank charges** — small debits with narrations like "CHG", "FEE", "SMS CHARGE"
- **Interest credits** — small credits with narrations like "INT CR", "INTEREST"
- **GST refunds** — credits from the GST department
- **Cash deposits / withdrawals** — if you handle physical cash
- **Customer payments you didn't know about** — UPI receipts where the customer didn't tell you

For each one:

| Type | What to do |
|---|---|
| **Bank charges** | Click the transaction, choose "Categorise as Expense", pick the GL account `5910 — Bank Charges` |
| **Interest credit** | Categorise as `4910 — Interest Income` |
| **GST refund** | Categorise as `2810 — GST Receivable` (offset against your GST liability) |
| **Unknown customer receipt** | Go to **AR → Receipts → New Receipt**, find the customer, allocate to their oldest open invoice, save. Come back here and run Auto Reconcile again — it'll match. |

### 7. Verify Bank Balance = Book Balance

Look at the **Summary Bar** at the top.

- If **Difference = "Balanced"** in green → ✅ done
- If there's a non-zero difference → something is still unmatched. Look for the missing amount in the unreconciled lists.

---

## How often to do this

- **Weekly** is the sweet spot for most businesses. Pick a fixed day.
- **Daily** if you're cash-tight and need real-time visibility.
- **Monthly** is the bare minimum — and you'll regret it because the unmatched pile is huge by then.

---

## Why you should never skip this

- **You catch errors fast.** A misallocated receipt or a duplicate bill shows up as an unreconciled transaction within a week, not at year-end.
- **Your dashboard is honest.** Cash-on-hand only matches reality if you reconcile.
- **Your CA's job is easier.** When the Tally export goes out at month-end, the books match the bank, so your CA doesn't have to debug.
- **Fraud detection.** If someone uses your card or makes an unauthorised transfer, you spot it within a week.

---

## Common gotchas

- **No UTR on the receipt → low confidence match.** Always paste UTRs when recording receipts and payments — it boosts the match rate from ~60% to ~90%.
- **Customer paid via UPI without a UTR** — UPI references are valid; just paste them as the reference number on the receipt. Reconcile will pick them up.
- **Bank charges piling up** — if you ignore them, your Book Balance drifts further from Bank Balance every week. Categorise them at the time of reconciliation.
- **Cash transactions** — if you withdraw cash from your current account for petty cash, record it as a transfer (Banking → Petty Cash → New Entry). Otherwise the bank debit has nothing to match against.

---

## What's next

- [Recipe 10 — View AR aging →](./10-view-ar-aging.md)
- [Recipe 11 — Export to Tally →](./11-export-to-tally.md)
