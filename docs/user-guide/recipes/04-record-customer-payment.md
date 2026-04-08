# Recipe 04 — Record a customer payment

> **Time:** 1–2 minutes · **You'll need:** customer name, the bank account the money came into, the UTR/reference number
> **Do this:** every time a customer pays you.

In runQ, recording a payment is called **creating a Receipt**. The receipt links the money you got to one or more invoices, so each invoice's outstanding balance updates correctly.

---

## Before you start

Make sure:
- ✅ The customer has at least one invoice in status **Sent** or **Partially Paid**. If the invoice is still in *Draft*, you can't record a receipt against it. Send it first.
- ✅ You've added the bank account that received the money (**Banking → Accounts → New Account**).

---

## Steps

The receipt form has 4 sections, top to bottom. Fill them in order.

### 1. Select Customer

Search for the customer in the dropdown. Once picked, runQ loads all their open invoices below.

### 2. Select Invoices

You'll see a table of every invoice this customer has that's still owed (status **Sent** or **Partially Paid**). For each row:

- **Invoice #** — runQ's invoice number
- **Due Date** — when it was due
- **Total** — original invoice amount
- **Received** — how much they've already paid against it
- **Balance** — what's still owed
- **Allocate** — how much of the new payment to apply to this invoice

To allocate the payment:

- **Tick the checkbox** next to each invoice the payment covers.
- runQ pre-fills the **Allocate** column with the full balance owed.
- If the customer paid less than the full amount, edit the **Allocate** value down. The remainder stays open.
- If the customer paid more than one invoice's worth, tick multiple invoices. runQ will allocate the full balance of each one.

> 💡 **Most common case:** customer pays the exact balance on one invoice. Just tick the checkbox and move on — runQ does the right thing.

> 💡 **Partial payments:** if a customer pays ₹30,000 on a ₹50,000 invoice, tick the invoice and change the **Allocate** value to `30000`. The invoice stays open with a balance of ₹20,000.

### 3. Receipt Details

| Field | What to enter |
|---|---|
| **Bank Account** | The runQ bank account where the money landed. Picks the account by name, with the last 4 digits of the account number for confirmation. |
| **Reference Number** | The UTR (for NEFT/RTGS/IMPS), the UPI transaction ID, or the cheque number. Optional but **strongly recommended** — this is what reconciliation uses to auto-match. |
| **Receipt Date** | The date the money actually hit your account. Defaults to today. |
| **Notes** | Anything you want to remember — e.g. "Paid via Mr. Sharma's son's UPI". |

### 4. Confirm and save

The **Summary** card at the bottom shows:
- **Total Receipt Amount** — total you've allocated across all selected invoices
- **N invoices selected**

If both look right, click **Record Receipt**.

You'll be taken back to the receipts list. Each invoice you allocated against will have its status updated:
- Fully paid → **Paid** ✅
- Partially paid → **Partially Paid**

---

## How to verify it worked

1. Go to **AR → Invoices**.
2. Find one of the invoices you just paid.
3. Its **Status** should now be **Paid** (or **Partially Paid**).
4. Click into it — the **Payments** section should show your new receipt with the date, amount, and reference number.

---

## What if the customer paid into the wrong account?

No problem. Just pick the correct bank account on the receipt form. The receipt is linked to the bank account — not to a specific transaction — so as long as the bank you pick reflects where the money is, you're fine.

When the bank statement is later imported and reconciled, the auto-reconcile process will match the bank credit to this receipt by amount and reference number. (See [Recipe 09](./09-reconcile-bank.md).)

---

## Common gotchas

- **Forgetting the UTR / reference number:** without it, auto-reconcile has to guess based on amount alone, which is less reliable. Always paste the UTR.
- **Recording a receipt against an unsent invoice:** invoices in *Draft* status don't show up in the receipt form. Send the invoice first (open it, click **Send**).
- **Allocating more than the balance:** runQ caps the **Allocate** field at the invoice balance. You physically cannot over-allocate.

---

## What's next

- [Recipe 09 — Reconcile your bank](./09-reconcile-bank.md) — the next step in the cycle
- [Recipe 10 — View AR aging](./10-view-ar-aging.md) — see who still owes you
