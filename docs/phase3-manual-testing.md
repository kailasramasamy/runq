# Phase 3 — Manual Testing Guide

**Scenario:** Vrindavan Milk Products runs daily banking operations — syncing bank statements, paying vendors, collecting from customers, managing cheques, and chasing overdue payments.

---

## Pre-requisites

1. API: `http://localhost:3003` | Web: `http://localhost:4003`
2. Login: `admin@demo.com` / `admin123` / `demo-company`
3. Seed data loaded (`pnpm db:seed -- --vrindavan`)
4. Schema pushed (`pnpm db:push` from `packages/db/`)

---

## Test 1: Live Bank Feed Sync (#16)

**Scenario:** Instead of downloading CSV from net banking, runq auto-fetches transactions from the bank.

### Steps
1. Go to **Banking → Transactions**
2. Select **HDFC Current Account**
3. Note the current transaction count
4. Click **"Sync"** button (or test via API):
```bash
TOKEN=your_token
HDFC_ID=ef0a8369-a83e-4d2d-8873-b15122e2e889
curl -X POST http://localhost:3003/api/v1/banking/accounts/$HDFC_ID/sync \
  -H "Authorization: Bearer $TOKEN"
```
5. 5-10 new transactions should appear with realistic narrations (NEFT, IMPS, UPI patterns)

### What to verify
- [ ] New transactions imported with dates, narrations, amounts
- [ ] No duplicates on re-sync (deduplication works)
- [ ] Account balance updated
- [ ] Transactions show as "unreconciled"

---

## Test 2: Payment Initiation (#17)

**Scenario:** After approving a vendor bill, instead of logging into net banking, you initiate payment directly from runq.

### Steps
1. Go to **AP → Bills** → find an **approved** bill
2. If none approved, approve one: open a draft bill → Approve
3. Go to **AP → Payments** → find the payment for that bill
4. Test via API:
```bash
PAYMENT_ID=uuid_of_payment
curl -X POST http://localhost:3003/api/v1/ap/payments/$PAYMENT_ID/initiate \
  -H "Authorization: Bearer $TOKEN"
```
5. Response should include a mock UTR number: `MOCK-UTR-...`

### What to verify
- [ ] Payment gets a UTR number assigned
- [ ] Status remains "completed" (mock succeeds instantly)
- [ ] UTR visible in payment detail

---

## Test 3: Multi-Bank Cash Position (#19)

**Scenario:** As a business owner, you want to see all bank balances in one glance.

### Steps
1. Go to **Dashboard**
2. Look for the **"Cash Position"** widget
3. Should show all active bank accounts:

| Account | Bank | Type | Balance |
|---------|------|------|---------|
| HDFC Current Account | HDFC Bank | Current | ₹X,XX,XXX |
| ICICI Savings Account | ICICI Bank | Savings | ₹X,XX,XXX |
| Petty Cash | Cash | Current | ₹X,XXX |
| **Total** | | | **₹XX,XX,XXX** |

### What to verify
- [ ] All active bank accounts listed
- [ ] Balances match actual account balances
- [ ] Total row at the bottom
- [ ] Account types shown correctly

---

## Test 4: Bank Charge Summary (#22)

**Scenario:** At month-end, you want to know how much the bank charged you.

### Steps
```bash
curl http://localhost:3003/api/v1/banking/accounts/$HDFC_ID/charges-summary \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Monthly breakdown of bank charges
- [ ] Interest income shown separately
- [ ] Totals per month
- [ ] Only transactions categorized as Bank Charges (GL 5007) or Interest (GL 4002)

---

## Test 5: UPI Collection Links (#18)

**Scenario:** You send an invoice to Fresh Dairy Mart. Instead of waiting for NEFT, you send them a UPI payment link.

### Pre-requisite
Set UPI ID in company settings:
1. Go to **Settings → Company**
2. Add UPI ID: `vrindavan@hdfcbank` (in GST Profile section — you may need to add it via API first)

Or via API:
```bash
curl -X PUT http://localhost:3003/api/v1/settings/company \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currency":"INR","financialYearStartMonth":4,"defaultPaymentTermsDays":30,"upiId":"vrindavan@hdfcbank"}'
```

### Steps
1. Go to **AR → Invoices** → open any invoice with balance due
2. Look for the **"UPI Payment Link"** button in the header
3. Click it — copies the UPI deep link to clipboard
4. The link format: `upi://pay?pa=vrindavan@hdfcbank&pn=Vrindavan...&am=45780&cu=INR&tn=Payment for VMP-2526-0022`

### What to verify
- [ ] UPI button visible on invoices with balance > 0
- [ ] Clicking copies link to clipboard
- [ ] "Copied!" feedback shown
- [ ] Link format is valid UPI deep link
- [ ] If no UPI ID configured: button doesn't appear (no error)

---

## Test 6: Customer Payment Portal (#23)

**Scenario:** Fresh Dairy Mart wants to see their outstanding invoices and pay. You send them a portal link — no login needed.

### Steps
1. Generate a portal token:
```bash
CUSTOMER_ID=uuid_of_fresh_dairy_mart
curl -X POST http://localhost:3003/api/v1/ar/customers/$CUSTOMER_ID/portal-token \
  -H "Authorization: Bearer $TOKEN"
```
2. Copy the token from the response
3. Open in browser: `http://localhost:4004/portal?token=PASTE_TOKEN_HERE`
4. You should see (as the customer, no login):
   - Company name at top
   - **Outstanding invoices** table: invoice#, date, due date, amount, balance, UPI link
   - **Payment history** table: date, invoice#, amount, method

### What to verify
- [ ] Portal loads without login
- [ ] Correct company name shown
- [ ] Only this customer's invoices shown (not other customers')
- [ ] Outstanding invoices with balance > 0 listed
- [ ] Payment history shows past receipts
- [ ] Expired token (after 7 days) shows error
- [ ] Invalid token shows error

---

## Test 7: Advanced Dunning (#25)

**Scenario:** Fresh Dairy Mart hasn't paid for 15 days. Dunning escalation fires: email first, then WhatsApp, then flag to stop supply.

### Steps
1. Go to **Settings → Notifications** (or wherever dunning rules are configured)
2. Create escalation rules:
   - Level 1: 7 days overdue → send_reminder (email)
   - Level 2: 15 days overdue → send_reminder (WhatsApp)
   - Level 3: 30 days overdue → stop_supply

Or via API:
```bash
# Level 1
curl -X POST http://localhost:3003/api/v1/ar/dunning/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"daysAfterDue":7,"channel":"email","subject":"Payment Reminder","body":"Dear customer, your invoice is overdue.","isActive":true,"escalationLevel":1,"action":"send_reminder"}'

# Level 2
curl -X POST http://localhost:3003/api/v1/ar/dunning/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"daysAfterDue":15,"channel":"whatsapp","subject":"Urgent Payment","body":"Payment overdue 15+ days.","isActive":true,"escalationLevel":2,"action":"send_reminder"}'

# Level 3
curl -X POST http://localhost:3003/api/v1/ar/dunning/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"daysAfterDue":30,"channel":"email","subject":"Supply Hold Notice","body":"Supply will be stopped.","isActive":true,"escalationLevel":3,"action":"stop_supply"}'
```

3. Trigger auto-dunning:
```bash
curl -X POST http://localhost:3003/api/v1/ar/dunning/auto-send \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Level 1 fires for invoices overdue 7+ days
- [ ] Level 2 fires only if Level 1 was already sent
- [ ] Level 3 fires only after Level 2
- [ ] Dunning log records each action with timestamp
- [ ] No duplicate sends for same invoice+level

---

## Test 8: Customer Credit Score (#26)

**Scenario:** Before extending credit to Fresh Dairy Mart, you check their payment track record.

### Steps
1. Go to **AR → Customers** → click **Fresh Dairy Mart**
2. Look for the **credit score badge** in the header
3. Or via API:
```bash
CUSTOMER_ID=uuid_of_fresh_dairy_mart
curl http://localhost:3003/api/v1/ar/customers/$CUSTOMER_ID/credit-score \
  -H "Authorization: Bearer $TOKEN"
```

### Expected response
```json
{
  "data": {
    "score": 75,
    "risk": "low",
    "factors": [
      "+5: 3 invoices paid on time",
      "-10: 1 invoice paid 18 days late",
      "-5: 1 currently overdue invoice"
    ]
  }
}
```

### What to verify
- [ ] Score between 0-100
- [ ] Risk level: "high" (<40), "medium" (40-70), "low" (>70)
- [ ] Badge color: red/amber/green matching risk
- [ ] Factors explain the score breakdown
- [ ] Score reflects actual payment history

---

## Test 9: Interest on Overdue (#28)

**Scenario:** Fresh Dairy Mart's invoice is 20 days overdue. You want to know the interest accrued.

### Pre-requisite
Set interest rate on the customer:
```bash
CUSTOMER_ID=uuid_of_fresh_dairy_mart
curl -X PUT http://localhost:3003/api/v1/ar/customers/$CUSTOMER_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"overdueInterestRate": 18}'
```

### Steps
1. Find an **overdue** invoice for Fresh Dairy Mart
2. Open the invoice detail page
3. Look for the **"Interest Accrued"** card
4. Or via API:
```bash
INVOICE_ID=uuid_of_overdue_invoice
curl http://localhost:3003/api/v1/ar/invoices/$INVOICE_ID/interest \
  -H "Authorization: Bearer $TOKEN"
```

### Expected
```json
{
  "data": {
    "principal": 45780,
    "rate": 18,
    "daysOverdue": 20,
    "interestAmount": 451.23
  }
}
```
Formula: `45780 × 18/100 × 20/365 = ₹451.23`

### What to verify
- [ ] Interest card shown only for overdue invoices
- [ ] Calculation matches the formula
- [ ] If no interest rate configured: no card shown
- [ ] Rate, days, principal, and amount all displayed

---

## Test 10: Collection Agent Assignment (#29)

**Scenario:** You assign the overdue Fresh Dairy Mart account to your collections person for follow-up.

### Steps
```bash
# Get user list for assignee
curl http://localhost:3003/api/v1/settings/users -H "Authorization: Bearer $TOKEN"

# Assign collection
INVOICE_ID=uuid_of_overdue_invoice
USER_ID=uuid_of_user
curl -X POST http://localhost:3003/api/v1/ar/collections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"invoiceId\":\"$INVOICE_ID\",\"assignedTo\":\"$USER_ID\",\"notes\":\"Call customer, they promised payment by Friday\",\"followUpDate\":\"2026-03-28\"}"

# List collections
curl http://localhost:3003/api/v1/ar/collections -H "Authorization: Bearer $TOKEN"

# Update status
COLLECTION_ID=uuid_from_response
curl -X PUT http://localhost:3003/api/v1/ar/collections/$COLLECTION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"contacted","notes":"Spoke to accounts team, payment by EOD Friday"}'
```

### What to verify
- [ ] Assignment created with status "open"
- [ ] List shows invoice#, customer, amount, assignee, follow-up date
- [ ] Status can be updated: open → contacted → promised → resolved
- [ ] Notes preserved per update

---

## Test 11: Cheque & PDC Management (#21)

**Scenario:** Fresh Dairy Mart gives you 3 post-dated cheques for monthly payments.

### Steps
1. Go to **Banking → Cheques**
2. Create a new cheque:

| Field | Value |
|-------|-------|
| Cheque Number | 456789 |
| Type | Received |
| Party Type | Customer |
| Party | Fresh Dairy Mart |
| Amount | 50,000 |
| Cheque Date | 2026-04-01 (post-dated) |
| Bank Account | HDFC Current Account |

3. Create 2 more with dates: 2026-05-01 and 2026-06-01
4. Check the **PDC Calendar** widget on the Dashboard
5. Life cycle test:
   - Deposit cheque #456789 → status: deposited
   - Clear it → status: cleared
   - Create another cheque → deposit → bounce with reason "Insufficient funds"

### What to verify
- [ ] Cheque created with status "pending"
- [ ] Status tabs filter correctly (all/pending/deposited/cleared/bounced)
- [ ] Deposit: pending → deposited (requires deposit date)
- [ ] Clear: deposited → cleared
- [ ] Bounce: deposited → bounced (requires reason)
- [ ] Cancel: pending → cancelled
- [ ] PDC Calendar widget shows upcoming cheques with dates and amounts
- [ ] Cannot clear a pending cheque (must deposit first)
- [ ] Cannot bounce a pending cheque (must deposit first)

---

## Test 12: TDS-Aware Reconciliation (#20)

**Scenario:** Delhi Dairy Distributors pays ₹94,500 for a ₹1,05,000 invoice — they deducted 10% TDS (₹10,500).

### Steps
1. Create a bank transaction for ₹94,500 credit from Delhi Dairy:
```bash
# Insert a bank transaction that doesn't exactly match any receipt
psql -U runq_app -d runq_dev -c "INSERT INTO bank_transactions (tenant_id, bank_account_id, transaction_date, type, amount, narration, recon_status)
VALUES ('$TENANT_ID', '$HDFC_ID', '2026-03-25', 'credit', '94500', 'NEFT/DELHI DAIRY DIST/TDS-DEDUCTED', 'unreconciled');"
```

2. Create a receipt for ₹1,05,000:
```bash
DELHI_ID=uuid_of_delhi_customer
psql -U runq_app -d runq_dev -c "INSERT INTO payment_receipts (tenant_id, customer_id, bank_account_id, receipt_date, amount, payment_method)
VALUES ('$TENANT_ID', '$DELHI_ID', '$HDFC_ID', '2026-03-25', '105000', 'bank_transfer');"
```

3. Go to **Banking → Reconciliation** → select HDFC Current Account
4. Look for the ₹94,500 transaction — it should show a suggestion:
   > "TDS deduction @10% (₹10,500 deducted from ₹1,05,000)" — 85% confidence

### What to verify
- [ ] TDS match detected with correct rate (10%)
- [ ] Confidence shown as 85%
- [ ] Match reason explains the TDS deduction
- [ ] Can accept the match manually

---

## Quick Checklist

| # | Test | Feature | Pass? |
|---|------|---------|-------|
| 1 | Bank feed sync imports transactions | #16 Bank Feeds | |
| 2 | Payment initiation returns UTR | #17 Payment Initiate | |
| 3 | Multi-bank balances on dashboard | #19 Cash Position | |
| 4 | Bank charges monthly summary | #22 Bank Charges | |
| 5 | UPI link on invoice, copies to clipboard | #18 UPI Links | |
| 6 | Customer portal shows invoices (no login) | #23 Portal | |
| 7 | Dunning escalation levels fire in order | #25 Dunning | |
| 8 | Credit score with risk badge | #26 Credit Score | |
| 9 | Interest calculated on overdue | #28 Interest | |
| 10 | Collection assignment CRUD | #29 Collections | |
| 11 | Cheque lifecycle + PDC calendar | #21 Cheques | |
| 12 | TDS deduction matched in reconciliation | #20 TDS Recon | |
