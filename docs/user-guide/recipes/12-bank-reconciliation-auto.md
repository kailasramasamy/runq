# Recipe 12 — Auto Reconciliation (Smart Flow)

> **Time:** 2 minutes · **Frequency:** Weekly after importing bank statement
> runQ auto-creates bills, payments, and journal entries for you.

---

## The Big Picture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Sync / Import   │────▶│  Auto-Categorize │────▶│    Reconciled    │
│  Bank Statement  │     │   (one click)    │     │   (all done)     │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

One click does everything:
- Matches payments to vendors
- Creates bills and journal entries
- Tags customers on receipts
- Learns patterns for next time

---

## What happens to each transaction

| Bank transaction | System detects | What it creates | Status |
|---|---|---|---|
| Debit → known vendor | Vendor name in narration | Bill + Payment + 2 JEs | Matched |
| Debit → unknown name | AI guesses GL category | 1 JE (expense) | Matched |
| Debit → bank charges | "CHG" / "CHARGES" pattern | 1 JE (bank charges) | Matched |
| Credit → known customer | Customer name in narration | 1 JE (receipt) | Matched |
| Credit → unknown | AI guesses GL category | 1 JE | Matched |

---

## Real Example: Paying a Vendor

> Vrindavan Dairy paid ₹25,300.50 to Farmtaste Dairy via NEFT

### Step by step

```
 1. Bank debit appears
    ┌───────────────────────────────────────────────────────┐
    │ INB/NEFT/AXODH.../Farmtaste Dairy (OPC)/IDFC...       │
    │ Amount: ₹25,300.50  Type: Debit  Status: Unreconciled │
    └───────────────────────────────────────────────────────┘
                          │
                          ▼
 2. Auto-Categorize detects vendor
    ┌─────────────────────────────────────────────────────┐
    │ "Farmtaste Dairy" found in narration                │
    │ → Matched to vendor: Farmtaste Dairy (OPC)          │
    │ → Expense account: 5001 Raw Materials               │
    └─────────────────────────────────────────────────────┘
                          │
                          ▼
 3. System auto-creates (all automatic)
    ┌─────────────────────────────────────────────────────┐
    │                                                     │
    │  📄 Bill created          💳 Payment created        │
    │  BILL-FD-2604-XXXX       Against the bill           │
    │  ₹25,300.50              ₹25,300.50                 │
    │  Status: Paid            Status: Completed          │
    │                                                     │
    └─────────────────────────────────────────────────────┘
                          │
                          ▼
 4. Two journal entries posted

    JE #1 — Bill (expense recorded)
    ┌─────────────────────────┬──────────┬──────────┐
    │ Account                 │  Debit   │  Credit  │
    ├─────────────────────────┼──────────┼──────────┤
    │ 5001 Raw Materials      │ 25,300.50│          │
    │ 2101 Accounts Payable   │          │ 25,300.50│
    └─────────────────────────┴──────────┴──────────┘

    JE #2 — Payment (bank reduced)
    ┌─────────────────────────┬──────────┬──────────┐
    │ Account                 │  Debit   │  Credit  │
    ├─────────────────────────┼──────────┼──────────┤
    │ 2101 Accounts Payable   │ 25,300.50│          │
    │ 1101 Cash at Bank       │          │ 25,300.50│
    └─────────────────────────┴──────────┴──────────┘

 5. Bank transaction → Matched
    ┌─────────────────────────────────────────────────────┐
    │ Status: Matched                                     │
    │ Vendor: Farmtaste Dairy (OPC)                       │
    │ Linked to: Bill + Payment + 2 JEs                   │
    └─────────────────────────────────────────────────────┘
```

### Net effect on your books

| Account | Debit | Credit |
|---|---|---|
| 5001 Raw Materials (P&L) | ₹25,300.50 | |
| 1101 Cash at Bank (Balance Sheet) | | ₹25,300.50 |

Your expense goes up, your bank balance goes down. That's it.

---

## Real Example: Receiving Payment from a Customer

> Razorpay settled ₹75,483.58 into ICICI account

```
 1. Bank credit appears
    Amount: ₹75,483.58  Type: Credit  Status: Unreconciled

 2. System detects "RAZORPAY PAYMENTS" in narration
    → Matched to customer: Razorpay Pvt Ltd

 3. Journal entry posted
    ┌─────────────────────────┬──────────┬──────────┐
    │ Account                 │  Debit   │  Credit  │
    ├─────────────────────────┼──────────┼──────────┤
    │ 1101 Cash at Bank       │ 75,483.58│          │
    │ 1103 Accounts Receivable│          │ 75,483.58│
    └─────────────────────────┴──────────┴──────────┘

 4. Bank transaction → Matched
    Customer: Razorpay Pvt Ltd
```

---

## First Time vs Repeat

### First time (new vendor/customer alias)

```
 Transaction narration: "VENDOROILSOS"
                │
                ▼
 No match found → status stays Unreconciled
                │
                ▼
 Accountant clicks "Assign Vendor" in the Vendor column
                │
                ▼
 Picks "Prabhakaran SOS Oils" from dropdown
 (or creates new vendor inline)
                │
                ▼
 System does 3 things:
 ┌────────────────────────────────────────────────┐
 │ 1. Creates bill + payment + JEs                │
 │ 2. Learns: "VENDOROILSOS" = Prabhakaran        │
 │ 3. Auto-applies to all similar transactions    │
 └────────────────────────────────────────────────┘
```

### Every time after

```
 Transaction narration: "VENDOROILSOS"
                │
                ▼
 Pattern matched → auto-bill-pay → Matched
 (fully automatic, no manual work)
```

---

## Your Weekly Workflow

```
 Monday morning (5 minutes)
 ┌──────────────────────────────────────────────┐
 │                                              │
 │  1. Open Banking → Transactions              │
 │                                              │
 │  2. Click "Sync" (pulls latest from bank)    │
 │                                              │
 │  3. Click "Auto-Categorize"                  │
 │     → Most transactions auto-matched         │
 │                                              │
 │  4. Review remaining unmatched:              │
 │     • Known vendor? → Assign Vendor          │
 │     • New vendor? → Create & Assign          │
 │     • Bank charges? → Already categorized    │
 │                                              │
 │  5. Check totals bar → verify numbers        │
 │                                              │
 │  Done.                                       │
 │                                              │
 └──────────────────────────────────────────────┘
```

---

## Duplicate Prevention

The system never creates duplicate entries. Three safety checks:

| Check | When | What happens |
|---|---|---|
| Existing payment found | Same vendor + amount + date ±5 days | Links to existing payment, no new bill |
| Existing bill found | Same vendor + amount + date ±30 days | Creates payment only, links to bill |
| JE already posted | sourceType + sourceId match | Skips JE creation |

If the accountant created the bill manually before syncing, the system detects it and links — no duplicates.

---

## For GST Vendors (extra step)

The auto-created bill is a lump sum (1 line item, no GST breakup). For GST-registered vendors where you need input credit:

```
 After auto-reconciliation:
 ┌──────────────────────────────────────────────┐
 │                                              │
 │  1. Go to AP → Bills → find the auto-bill    │
 │                                              │
 │  2. Attach the vendor's invoice (PDF/photo)  │
 │                                              │
 │  3. Edit line items:                         │
 │     • Add actual items, quantities           │
 │     • Add HSN codes and GST rates            │
 │                                              │
 │  4. Save                                     │
 │     Total stays the same.                    │
 │     JEs don't change.                        │
 │     GST input credit is now trackable.       │
 │                                              │
 └──────────────────────────────────────────────┘
```

For non-GST vendors, the lump-sum bill is perfectly valid. No extra steps needed.

---

## Quick Reference

| I want to... | Do this |
|---|---|
| Sync latest transactions | Click **Sync** button |
| Auto-match everything | Click **Auto-Categorize** button |
| Assign a vendor to a debit | Click **Assign Vendor** in Vendor column |
| Assign a customer to a credit | Click **Assign Customer** in Vendor column |
| Create a new vendor on the fly | Assign Vendor → scroll down → **Create new vendor** |
| Search for a transaction | Type in the search box (searches narration, reference, vendor, customer) |
| Filter by status | Use the **Recon Status** dropdown |
| See debit/credit totals | Check the summary bar below the table |

---

## What's next

- [Recipe 10 — View AR aging →](./10-view-ar-aging.md)
- [Recipe 11 — Export to Tally →](./11-export-to-tally.md)
