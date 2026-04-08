# Recipe 11 — Export to Tally

> **Time:** 2 minutes in runQ + 5 minutes in Tally · **You'll need:** access to Tally Prime or Tally ERP 9
> **Do this:** monthly, before your CA does GST returns. Or quarterly, if your CA is slower.

This is the bridge between runQ (where you do the daily work) and Tally (where your CA files statutory returns). Your CA doesn't need to log into runQ. They don't need a runQ account. They get a **Tally-compatible XML file**, import it once, and they have everything.

---

## Why this exists

runQ deliberately does *not* try to replace Tally for compliance work. Tally has 25 years of statutory expertise — GST returns, e-invoicing, e-way bills, audit-ready statements — and your CA already knows it inside out.

The deal is:
- **You** use runQ daily for invoicing, bills, payments, banking
- **Your CA** uses Tally monthly for GSTR-1, GSTR-3B, TDS returns, audits
- **Tally Export** is the handoff

---

## What gets exported

The Tally export produces **two XML files**:

### 1. Ledgers XML (the masters)

Contains:
- All your active **customers** as Sundry Debtors
- All your active **vendors** as Sundry Creditors
- All your **bank accounts**

Import this **first** in Tally. It creates the corresponding ledger accounts so the vouchers can post correctly.

### 2. Vouchers XML (the transactions)

Contains, for the date range you pick:
- All **sales invoices** as Sales vouchers
- All **purchase invoices** (vendor bills) as Purchase vouchers
- All **vendor payments** as Payment vouchers
- All **customer receipts** as Receipt vouchers

This is the data your CA actually processes for GST returns.

---

## Steps

### 1. Open the Tally Export page

Sidebar → **Settings → Tally Export**

You'll see two cards: **Export Vouchers** and **Export Ledger Masters**, plus an **Import Instructions** card at the bottom.

### 2. Export the ledgers (do this first)

In the **Export Ledger Masters** card, click **Download Ledgers XML**.

A file like `runq-ledgers-2026-04-08.xml` downloads. Save it where your CA can find it.

> 💡 You only need to re-export ledgers when you've added new customers/vendors. For routine monthly exports, the same ledgers file is reusable for a few months — but it doesn't hurt to re-export every time.

### 3. Pick the date range for vouchers

In the **Export Vouchers** card:
- **From Date** — defaults to the 1st of the current month. Change to the start of the period you want.
- **To Date** — defaults to today.

For monthly exports, pick:
- **From Date** — 1st of the previous month
- **To Date** — last day of the previous month

For quarterly: 1st of Q-1 to last day of Q.

### 4. Click "Download Vouchers XML"

A file like `runq-vouchers-2026-04-01-to-2026-04-30.xml` downloads. Save it next to the ledgers file.

### 5. Hand both files to your CA

Email both XML files to your CA, or drop them in a shared folder. Tell them:
- "Import the **ledgers** file first"
- "Then import the **vouchers** file"

---

## What your CA does in Tally

If your CA isn't already familiar with Tally XML import, send them this:

1. Open **Tally Prime** and load the company file
2. Go to **Gateway of Tally**
3. Pick **Import**
4. Choose the **ledgers XML** file → click Import
5. Tally creates all the customer, vendor, and bank ledgers (skips any that already exist)
6. Go back to **Gateway of Tally → Import**
7. Choose the **vouchers XML** file → click Import
8. Tally creates all the sales, purchase, payment, and receipt vouchers
9. Verify in **Day Book** (`Gateway of Tally → Display More Reports → Day Book`)

That's it. Your CA now has everything to file GSTR-1 and GSTR-3B from Tally as usual.

---

## ⚠ Important rules

These prevent the most common Tally import failures.

### Rule 1: Names must be consistent

The Tally vouchers reference customers and vendors by **name** (not by GSTIN or any ID). So:
- **Don't rename** a customer or vendor in runQ between exports — you'll create a duplicate ledger in Tally
- **Use the legal name** in runQ — it should match what your CA already has in Tally if there's any pre-existing ledger
- If a ledger already exists in Tally with the same name, Tally **skips** it during import — your existing data isn't overwritten

### Rule 2: Don't double-import

Each voucher in the export has runQ's internal ID baked in. If you import the same vouchers file twice, Tally will create duplicate vouchers (it doesn't auto-deduplicate the way runQ does on bank import).

**Only import each export once.** If you re-export overlapping date ranges, your CA needs to delete the old vouchers in Tally before importing the new file.

### Rule 3: GST setup must match in Tally

Your Tally company file should have the **same GSTIN** as runQ's Settings → Company. Otherwise the GST splits on the imported vouchers won't validate.

### Rule 4: Lock your books in runQ before exporting

If you want to be safe, before exporting:
1. Go to **Reports → Fiscal Periods**
2. Click **Lock** for the period you're about to export
3. Locked periods can't be edited — so the data your CA has matches what's in runQ exactly

You can always unlock later if you need to make a correction.

---

## What if your CA doesn't use Tally?

runQ has alternatives:

| Your CA uses | Use this instead |
|---|---|
| **Excel only** | Sidebar → **Reports → [report] → Export CSV** for any report |
| **Zoho Books / Xero** | Use the per-report CSV exports — there's no direct connector yet |
| **A read-only access** | **Settings → CA Portal** — generates a slug-based public link with read-only P&L, Balance Sheet, Trial Balance, journal entries. No login needed. |

The **CA Portal** is great for monthly check-ins. The **Tally Export** is for the actual filing.

---

## Common gotchas

- **Importing vouchers before ledgers** — Tally complains about missing party ledgers. Always import ledgers first.
- **Customer/vendor name mismatch** — if you have *Patil Trading* in runQ but your CA has *Patil Trading Co.* in Tally, two ledgers get created. Stay consistent.
- **Re-exporting an already-imported period** — creates duplicate vouchers in Tally. Either pick non-overlapping date ranges, or delete the old vouchers in Tally first.
- **Timing it wrong** — most CAs file GSTR-1 by the 11th and GSTR-3B by the 20th. Send your monthly export by the 5th to give them buffer.

---

## What's next

You've now done every basic task in runQ. Congratulations.

For more advanced workflows:
- **Recurring invoices** for retainer customers — `AR → Quick Templates`
- **Dunning rules** for automated overdue chasing — `AR → Dunning`
- **Bulk vendor payment runs** — `AP → Payments → Bulk`
- **Cash flow forecasting** — `Reports → Cash Flow Forecast`
- **CA Portal** for read-only access — `Settings → CA Portal`
- **Approval workflows** for large bills — `Workflows → Approvals`

The full list lives in `docs/feature-roadmap.md`.
