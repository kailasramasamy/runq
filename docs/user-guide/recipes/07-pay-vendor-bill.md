# Recipe 07 — Pay a vendor bill

> **Time:** 1–2 minutes · **You'll need:** the vendor name, the bank account you're paying from, the UTR/reference number after the NEFT goes through
> **Do this:** every time you pay a vendor.

In runQ, recording an outgoing payment is called **creating a Payment**. The payment links the cash you sent to one or more bills, so each bill's outstanding balance updates correctly.

---

## Before you start

Make sure:
- ✅ The bill is entered in runQ ([Recipe 06](./06-enter-vendor-bill.md)) and its status is **Approved** or **Partially Paid**
- ✅ The bank account you paid from is added in **Banking → Accounts**
- ✅ You've actually initiated the NEFT/UPI/cheque (this recipe is *recording* the payment in runQ — you still pay through your bank app)

---

## Steps

The payment form has 4 sections, top to bottom.

### 1. Select Vendor

Search and pick the vendor in the dropdown. runQ loads all their open bills below.

### 2. Select Invoices

You'll see a table of every open bill from this vendor:

- **Invoice #** — the vendor's invoice number
- **Total** — original bill amount
- **Paid** — how much you've already paid against it
- **Balance** — what's still owed
- **Allocate** — how much of this payment to apply

To allocate:

- **Tick the checkbox** next to each bill the payment covers.
- runQ pre-fills the **Allocate** column with the full balance owed.
- For partial payments, edit **Allocate** down. The remainder stays open.
- For paying multiple bills at once, tick all of them — runQ allocates each one's full balance.

> 💡 **Most common case:** you're paying off one bill in full. Tick it and move on.

> 💡 **Partial payments are common with cash-strapped weeks.** A vendor wants ₹2,00,000 but you can only send ₹1,00,000 today. Tick the bill and edit Allocate to `100000`. The bill stays open with a balance of ₹1,00,000.

### 3. Payment Details

| Field | What to enter |
|---|---|
| **Bank Account** | The runQ bank account you paid from. |
| **UTR / Reference Number** | The UTR from your bank's NEFT confirmation, or the cheque number, or the UPI ref. ⚠ **Always paste this** — it's how reconciliation auto-matches later. |
| **Payment Date** | The date money left your account. Defaults to today. |
| **Notes** | Anything you want to remember. |

### 4. Confirm and save

The **Summary** at the bottom shows:
- **Total Payment Amount** — total you've allocated
- **N invoices selected**

Click **Record Payment**.

Each bill you allocated against updates:
- Fully paid → **Paid** ✅
- Partially paid → **Partially Paid**

---

## Other ways to pay

The "New Payment" form covers the most common case: paying one or more bills in full or part. There are two specialised flows in **AP → Payments**:

### Bulk payment run

**AP → Payments → Bulk** lets you pay many vendors at once. Useful for end-of-month vendor payment runs.

1. Pick the bank account.
2. runQ shows every vendor with open bills, with their total outstanding.
3. Tick the vendors you want to pay this run.
4. Confirm — runQ creates one payment per vendor, allocates against their bills oldest-first, and exports a single **NEFT batch CSV** that you upload to your bank's net banking portal.

This is the killer feature for businesses that pay 20+ vendors a month.

### Direct payment (no bill)

**AP → Payments → Direct** lets you record a payment that isn't tied to a specific bill — for example, an advance, a refund, or a one-off transfer. Use this sparingly: most of the time, you should enter the bill first and then pay it.

### Advance payment

**AP → Payments → Advance** is for vendor advances. The advance becomes a credit on the vendor's account, and runQ will auto-adjust it against their next bill.

---

## How to verify it worked

1. Go to **AP → Bills**.
2. Find the bill you just paid.
3. Status should be **Paid** or **Partially Paid**.
4. Click into the bill — the **Payments** section shows your new payment.

---

## Common gotchas

- **Recording the payment in runQ but not actually transferring the money** — runQ believes you. Always pay first (in your bank app), then record.
- **Wrong UTR / no UTR** — bank reconciliation can't auto-match. You'll have to manually match later. Always paste the UTR.
- **Paying from the wrong bank account in runQ** — easy to fix: open the payment, click **Edit**, change the bank account, save. But it'll mess up reconciliation in the meantime.
- **Forgetting TDS deduction** — if the bill has TDS on a line item, the cash outflow should be `Total – TDS`, not the full Total. Make sure you actually transferred the right amount through your bank.

---

## What's next

- [Recipe 08 — Import your bank statement →](./08-import-bank-statement.md)
- [Recipe 09 — Reconcile your bank →](./09-reconcile-bank.md)
