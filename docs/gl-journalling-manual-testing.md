# GL & Journalling — Manual Testing Guide

**Scenario:** Vrindavan Milk Products has been running for a quarter. The accountant needs to verify that every business transaction — invoices, payments, receipts — automatically hits the General Ledger. At month-end, they post adjusting entries, check the trial balance, and verify financial reports tie back to the GL.

---

## Pre-requisites

1. API: `http://localhost:3003` | Web: `http://localhost:4003`
2. Login: `admin@demo.com` / `admin123` / `demo-company`
3. Seed data loaded (`pnpm db:seed -- --vrindavan --phase4`)
4. Schema pushed (`pnpm db:push` from `packages/db/`)

---

## Test 1: Sales Invoice Auto-Posts to GL

**Scenario:** You raise a ₹1,05,000 invoice to Fresh Dairy Mart. The GL should automatically record: Dr Accounts Receivable, Cr Sales Revenue.

### Steps

1. Go to **Accounts Receivable → Invoices**
2. Click **New Invoice**
3. Fill in:
   - Customer: **Fresh Dairy Mart**
   - Invoice Date: `2026-04-01`
   - Due Date: `2026-05-01`
   - Add line item:
     - Description: `Toned Milk 500ml x 10,000 pouches`
     - HSN Code: `0401`
     - Qty: `10000`, Unit Price: `₹10`, Amount: `₹1,00,000`
     - Tax Rate: `5%`
   - Subtotal: ₹1,00,000 | Tax: ₹5,000 | Total: ₹1,05,000
4. Click **Create Invoice**
5. Go to **General Ledger → Journal Entries**
6. Look for the latest entry — it should say "Sales invoice to Fresh Dairy Mart"

### What to verify

- [ ] Journal entry created with status `posted`
- [ ] Entry number follows format `JE-2627-NNNN` (FY 2026-27)
- [ ] Click the entry — Line 1: Dr Accounts Receivable (1103) = ₹1,05,000
- [ ] Line 2: Cr Sales Revenue (4001) = ₹1,05,000
- [ ] Description includes the customer name

---

## Test 2: Customer Receipt Auto-Posts to GL (Mark Paid)

**Scenario:** Fresh Dairy Mart pays ₹1,05,000 against the invoice. GL should record: Dr Cash at Bank, Cr Accounts Receivable.

### Steps

1. Go to **Accounts Receivable → Invoices**
2. Click on the invoice created in Test 1
3. Click **Mark as Paid**
4. Fill in:
   - Payment Date: `2026-04-05`
   - Reference Number: `UTR2604001`
5. Confirm payment
6. Go to **General Ledger → Journal Entries**
7. Look for the latest entry — it should say "Receipt from Fresh Dairy Mart"

### What to verify

- [ ] New journal entry created with source type `receipt`
- [ ] Line 1: Dr Cash at Bank (1101) = ₹1,05,000
- [ ] Line 2: Cr Accounts Receivable (1103) = ₹1,05,000
- [ ] Invoice status changed to `paid` on the invoice detail page
- [ ] Receipt appears in the **Receipt History** section on the invoice detail page

---

## Test 3: Partial Receipt via Receipt Form

**Scenario:** Bangalore Dairy Hub pays ₹50,000 against a ₹94,500 invoice (partial). The GL should record the partial amount.

### Steps

1. Go to **Accounts Receivable → Invoices**
2. Find a `sent` or `partially_paid` invoice for Bangalore Dairy Hub — note the Invoice ID
3. Go to **Accounts Receivable → Receipts**
4. Click **Record Receipt**
5. Fill in:
   - Customer: **Bangalore Dairy Hub**
   - Bank Account: **HDFC Current Account**
   - Receipt Date: `2026-04-06`
   - Amount: `₹50,000`
   - Payment Method: `Bank Transfer`
   - Reference: `UTR2604002`
   - Allocate ₹50,000 against the selected invoice
6. Submit
7. Go to **General Ledger → Journal Entries** — check for the new receipt entry

### What to verify

- [ ] Journal entry: Dr Bank (1101) ₹50,000, Cr AR (1103) ₹50,000
- [ ] Go back to the invoice — status changed to `partially_paid`
- [ ] Balance Due reduced by ₹50,000
- [ ] Receipt detail page shows the allocation against the invoice

---

## Test 4: Purchase Invoice Approval Auto-Posts to GL

**Scenario:** Fresh Farms submits a ₹1,20,000 raw milk bill. You approve it — GL records: Dr COGS/Expense, Cr Accounts Payable.

### Steps

1. Go to **Accounts Payable → Bills**
2. Click **New Bill**
3. Fill in:
   - Vendor: **Fresh Farms Raw Milk**
   - Invoice Number: `FF-2026-TEST`
   - Invoice Date: `2026-04-01`
   - Due Date: `2026-04-16`
   - Place of Supply: Maharashtra
   - Add line item:
     - Description: `Raw Milk April Wk1`
     - HSN: `0401`, Qty: `1200`, Unit Price: `₹100`
     - GST Rate: `0%`
   - Total: ₹1,20,000
4. Click **Create** — bill is created as `draft`
5. Go to **General Ledger → Journal Entries** — verify **no new entry** was created (draft bills don't post)
6. Go back to the bill detail page
7. Click **Approve Bill**
8. Go to **General Ledger → Journal Entries** — a new entry should now appear

### What to verify

- [ ] No JE created while bill is in `draft` status
- [ ] JE created only after clicking **Approve Bill**
- [ ] Line 1: Dr Purchase Expenses (5002) = ₹1,20,000
- [ ] Line 2: Cr Accounts Payable (2101) = ₹1,20,000
- [ ] Bill status changed to `approved`

---

## Test 5: Vendor-Specific Expense Account

**Scenario:** Fresh Farms should hit COGS (5001) instead of the default Purchase Expenses (5002). You configure this on the vendor, then approve another bill.

### Steps

1. Go to **Accounts Payable → Vendors**
2. Click on **Fresh Farms Raw Milk**
3. Update the vendor's expense account code to `5001` (via API for now — no UI field yet):

```bash
TOKEN=<your token>
VENDOR_ID=<Fresh Farms vendor UUID>
curl -X PUT "http://localhost:3003/api/v1/ap/vendors/$VENDOR_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expenseAccountCode": "5001"}'
```

4. Create a new bill for Fresh Farms (same as Test 4 but invoice number `FF-2026-TEST2`)
5. Approve the bill
6. Go to **General Ledger → Journal Entries** — check the new entry

### What to verify

- [ ] JE debits account **5001 (Cost of Goods Sold)** — not 5002
- [ ] Other vendors without `expenseAccountCode` still default to 5002

---

## Test 6: Vendor Payment Approval Auto-Posts to GL

**Scenario:** You approve a ₹1,20,000 payment to Fresh Farms. GL records: Dr Accounts Payable, Cr Cash at Bank.

### Steps

1. Go to **Accounts Payable → Payments**
2. Click **New Payment**
3. Fill in:
   - Vendor: **Fresh Farms Raw Milk**
   - Bank Account: **HDFC Current Account**
   - Payment Date: `2026-04-07`
   - Amount: `₹1,20,000`
   - Method: `Bank Transfer`
   - Reference: `UTR2604101`
   - Allocate against the approved bill from Test 4
4. Submit — payment is created as `pending`
5. Go to **General Ledger → Journal Entries** — verify **no new entry** (pending payments don't post)
6. Go back to **Accounts Payable → Payments**
7. Find the pending payment and click **Approve**
8. Go to **General Ledger → Journal Entries** — new entry should appear

### What to verify

- [ ] No JE created while payment is `pending`
- [ ] JE created after approval
- [ ] Line 1: Dr Accounts Payable (2101) = ₹1,20,000
- [ ] Line 2: Cr Cash at Bank (1101) = ₹1,20,000
- [ ] Payment status changed to `completed`

---

## Test 7: Idempotency — No Double-Posting

**Scenario:** Due to a network glitch, the approval is triggered twice. The GL must not create duplicate entries.

### Steps

1. Go to **General Ledger → Journal Entries** — note the total count at the bottom of the page
2. Try to re-approve the same bill from Test 4 by navigating to its detail page
3. The **Approve** button should not be available (bill is already `approved`)
4. Check journal entry count — should be unchanged

### What to verify

- [ ] Cannot re-approve an already approved bill (button disabled or shows error)
- [ ] Journal entry count did not increase
- [ ] Even if the API is called directly, the idempotency guard prevents a duplicate JE

---

## Test 8: Debit Note Issue Auto-Posts to GL

**Scenario:** Fresh Farms sent 50 litres of spoiled milk. You raise a debit note for ₹5,000 and issue it.

### Steps

1. Go to **Accounts Payable → Debit Notes**
2. Click **New Debit Note**
3. Fill in:
   - Vendor: **Fresh Farms Raw Milk**
   - Amount: `₹5,000`
   - Reason: `Spoiled milk — 50L returned`
   - Optionally link to the purchase invoice from Test 4
4. Submit — debit note created as `draft`
5. Go to **General Ledger → Journal Entries** — verify no new entry
6. Go back to the debit note and click **Issue**
7. Go to **General Ledger → Journal Entries** — new entry should appear

### What to verify

- [ ] No JE while debit note is `draft`
- [ ] JE created after issuing: Dr Accounts Payable (2101) ₹5,000, Cr Purchase Expenses (5002) ₹5,000
- [ ] Debit note status changed to `issued`

---

## Test 9: Credit Note Issue Auto-Posts to GL

**Scenario:** You gave Fresh Dairy Mart a ₹3,000 discount after a quality complaint. You raise and issue a credit note.

### Steps

1. Go to **Accounts Receivable → Credit Notes**
2. Click **New Credit Note**
3. Fill in:
   - Customer: **Fresh Dairy Mart**
   - Amount: `₹3,000`
   - Reason: `Quality discount — batch #412`
   - Optionally link to the invoice from Test 1
4. Submit — credit note created as `draft`
5. Go to the credit note detail and click **Issue Credit Note**
6. Go to **General Ledger → Journal Entries** — new entry should appear

### What to verify

- [ ] JE created after issuing: Dr Sales Revenue (4001) ₹3,000, Cr Accounts Receivable (1103) ₹3,000
- [ ] Credit note status changed to `issued`

---

## Test 10: Manual Journal Entry — Accrual Adjustment

**Scenario:** At month-end, the accountant posts an accrual for ₹15,000 electricity bill that hasn't been invoiced yet.

### Steps

> Note: The journal entry UI is currently read-only. Use the API for this test:

```bash
curl -X POST http://localhost:3003/api/v1/gl/journal-entries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-03-31",
    "description": "Accrual: Electricity bill for March 2026 (estimated)",
    "lines": [
      {"accountCode": "5005", "debit": 15000, "credit": 0, "description": "Electricity expense accrual"},
      {"accountCode": "2101", "debit": 0, "credit": 15000, "description": "Payable accrual"}
    ]
  }'
```

Then go to **General Ledger → Journal Entries** to verify.

### What to verify

- [ ] JE created with status `posted`
- [ ] Entry number in sequence (`JE-2526-NNNN` for FY 2025-26)
- [ ] Click the entry — shows two lines: Dr Utilities (5005) and Cr AP (2101), both ₹15,000
- [ ] Total Debit = Total Credit

---

## Test 11: Manual Journal Entry — Validation

**Scenario:** The accountant accidentally creates an unbalanced entry. The system must reject it.

### Steps

> Use API — no create UI exists yet:

1. **Unbalanced entry** (Dr ₹10,000 but Cr ₹9,999):

```bash
curl -X POST http://localhost:3003/api/v1/gl/journal-entries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-31","description":"Bad entry","lines":[{"accountCode":"5005","debit":10000},{"accountCode":"2101","credit":9999}]}'
```

2. **Single-line entry**:

```bash
curl -X POST http://localhost:3003/api/v1/gl/journal-entries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-31","description":"Single line","lines":[{"accountCode":"5005","debit":10000}]}'
```

3. **Non-existent account code**:

```bash
curl -X POST http://localhost:3003/api/v1/gl/journal-entries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-31","description":"Bad account","lines":[{"accountCode":"9999","debit":10000},{"accountCode":"2101","credit":10000}]}'
```

### What to verify

- [ ] Unbalanced entry rejected with error: "not balanced"
- [ ] Single-line entry rejected: "at least 2 lines"
- [ ] Non-existent account rejected: "Account codes not found: 9999"

---

## Test 12: Trial Balance

**Scenario:** At quarter-end, the accountant pulls a trial balance to confirm all debits equal all credits.

### Steps

1. Go to **General Ledger → Trial Balance**
2. Page loads with all accounts that have activity
3. Check the totals row at the bottom

### What to verify

- [ ] Total Debits = Total Credits (shown as green "Balanced" indicator)
- [ ] Asset accounts (1xxx) show debit-normal balances
- [ ] Liability accounts (2xxx) show credit-normal balances
- [ ] Revenue (4xxx) shows credit-normal balance
- [ ] Expense accounts (5xxx) show debit-normal balances
- [ ] Only non-zero accounts are displayed

---

## Test 13: Chart of Accounts

**Scenario:** The accountant checks the chart of accounts and verifies all accounts are in place.

### Steps

1. Go to **General Ledger → Accounts**
2. Browse the account list — accounts are sorted by code
3. Verify hierarchy:
   - **1xxx** — Assets (Cash at Bank, Petty Cash, Accounts Receivable, Advance to Suppliers, Fixed Assets)
   - **2xxx** — Liabilities (Accounts Payable, Advance from Customers, GST Payable, TDS Payable)
   - **3xxx** — Equity (Share Capital, Retained Earnings)
   - **4xxx** — Revenue (Sales Revenue, Other Income)
   - **5xxx** — Expenses (COGS, Purchase Expenses, Salary, Rent, Utilities, Transport, Bank Charges, Petty Cash, Misc)

### What to verify

- [ ] All 29 seeded accounts are listed
- [ ] Each account shows Code, Name, Type badge (color-coded)
- [ ] Accounts sorted by code in ascending order
- [ ] Indentation shows parent-child hierarchy

---

## Test 14: Journal Entry Listing & Detail View

**Scenario:** The accountant wants to review all journal entries and drill into specific ones.

### Steps

1. Go to **General Ledger → Journal Entries**
2. Browse the list — entries show Entry #, Date, Description, Source Type, Debit, Credit, Status
3. Click on any row to expand the detail panel
4. Verify the lines show account codes, names, debit/credit amounts

### What to verify

- [ ] Entries are paginated (check page navigation at the bottom)
- [ ] Each entry shows: entry number, date, description, source type badge, total debit/credit
- [ ] Clicking a row expands to show all debit/credit lines
- [ ] Lines show account code, account name, debit amount, credit amount
- [ ] Source type badges: `sales_invoice`, `purchase_invoice`, `payment`, `receipt`, `manual`
- [ ] Status badge: `posted` (green)

---

## Test 15: P&L Reflects Auto-Posted Entries

**Scenario:** After all the transactions above, the P&L report should show revenue from sales invoices and expenses from purchase invoices, salaries, and bank charges.

### Steps

1. Go to **Reports → P&L**
2. Set date range: From `2025-04-01` To `2026-04-02`
3. Review the report

### What to verify

- [ ] **Revenue** section shows Sales Revenue (4001) with amounts matching total sales invoices
- [ ] **Expenses** section includes:
  - Cost of Goods Sold (5001) — raw milk purchases
  - Purchase Expenses (5002) — packaging, other vendors
  - Salary Expense (5003) — ₹4,50,000 (3 months x ₹1,50,000)
  - Rent Expense (5004) — ₹70,000
  - Transport Expense (5006)
  - Bank Charges (5007) — ₹2,500
- [ ] **Net Profit** = Total Revenue - Total Expenses (green if positive, red if negative)
- [ ] Newly created entries from Tests 1-10 are reflected
- [ ] Changing the date range updates the numbers

---

## Test 16: Balance Sheet Ties to Trial Balance

**Scenario:** The balance sheet as of today should show Assets = Liabilities + Equity.

### Steps

1. Go to **Reports → Balance Sheet**
2. Default shows as-of today
3. Review the three sections

### What to verify

- [ ] **Assets**: Cash at Bank (1101), Accounts Receivable (1103)
- [ ] **Liabilities**: Accounts Payable (2101), GST Payable (2103), TDS Payable (2104)
- [ ] **Equity**: Share Capital (3001), Retained Earnings (3002)
- [ ] Accounting equation holds: Total Assets = Total Liabilities + Total Equity
- [ ] Change the as-of date to `2026-01-31` — numbers change to reflect only Jan data

---

## Test 17: End-to-End Flow — Full Transaction Cycle

**Scenario:** Complete lifecycle: raise invoice → receive payment → check GL → verify reports. This is the "golden path" that proves the system works end-to-end.

### Steps

1. **Create Invoice**: Go to **AR → Invoices → New Invoice**
   - Customer: **Chennai Milk Depot** (inter-state)
   - Date: `2026-04-02`, Due: `2026-05-02`
   - Item: `Full Cream Milk 1L x 5000`, Qty: 5000, Price: ₹10, HSN: 0401, Tax: 5%
   - Total: ₹52,500

2. **Check GL**: Go to **General Ledger → Journal Entries**
   - Confirm new entry: Dr AR (1103) ₹52,500, Cr Revenue (4001) ₹52,500

3. **Mark Paid**: Go back to the invoice detail → Click **Mark as Paid**
   - Payment Date: `2026-04-10`, Reference: `UTR2604010`

4. **Check GL again**: Go to **General Ledger → Journal Entries**
   - Confirm new entry: Dr Bank (1101) ₹52,500, Cr AR (1103) ₹52,500

5. **Check Trial Balance**: Go to **General Ledger → Trial Balance**
   - Confirm total debits still equal total credits

6. **Check P&L**: Go to **Reports → P&L**
   - Confirm revenue increased by the invoice subtotal (₹50,000)

### What to verify

- [ ] Two journal entries created for one business cycle (invoice + receipt)
- [ ] AR account: debited on invoice, credited on receipt — net zero for this paid invoice
- [ ] Bank account: debited on receipt (cash came in)
- [ ] Revenue: credited on invoice creation
- [ ] Trial balance remains balanced throughout
- [ ] P&L revenue figure includes this invoice

---

## Quick Checklist

| # | Test | Feature | Pass? |
|---|------|---------|-------|
| 1 | Sales invoice creates JE automatically | Auto-post: Sales Invoice | |
| 2 | markPaid creates receipt JE | Auto-post: Receipt (markPaid) | |
| 3 | Partial receipt via Receipt form | Auto-post: Receipt (partial) | |
| 4 | Purchase invoice approval creates JE | Auto-post: Purchase Invoice | |
| 5 | Vendor-specific expense account mapping | Expense Account Config | |
| 6 | Payment approval creates JE | Auto-post: Payment | |
| 7 | Re-approval does not duplicate JE | Idempotency Guard | |
| 8 | Debit note issue creates JE | Auto-post: Debit Note | |
| 9 | Credit note issue creates JE | Auto-post: Credit Note | |
| 10 | Manual accrual journal entry | Manual JE Creation | |
| 11 | Unbalanced / invalid entries rejected | JE Validation | |
| 12 | Trial balance debits = credits | Trial Balance | |
| 13 | Chart of accounts list and hierarchy | Chart of Accounts | |
| 14 | JE listing and detail expansion | JE Queries | |
| 15 | P&L reflects all GL entries | Reports ↔ GL | |
| 16 | Balance sheet accounting equation holds | Reports ↔ GL | |
| 17 | Full invoice → payment → GL → reports | End-to-End Flow | |

---

## Known Limitations

- **Manual JE creation**: No UI form yet — must use API (Tests 10-11)
- **Vendor expense account**: No UI field yet — must update via API (Test 5)
- **Fiscal period enforcement**: Journal entries can be posted into locked periods (not yet enforced)
- **No reversal API**: The `reversed` status exists but no endpoint to trigger it
- **GST not split in auto-posted JEs**: Auto-posted entries record the gross amount; GST is not broken into separate Dr/Cr lines for input credit tracking
