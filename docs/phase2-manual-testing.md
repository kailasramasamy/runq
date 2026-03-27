# Phase 2 — Manual Testing Guide

**Scenario:** You run Vrindavan Milk Products. Your accountant uses runq daily for vendor bills, customer invoices, bank reconciliation, and payments. These AI features save hours of manual work.

---

## Pre-requisites

1. API running: `http://localhost:3003`
2. Web app running: `http://localhost:4004`
3. Login: `admin@demo.com` / `admin123` / tenant: `demo-company`
4. Seed data loaded: `pnpm db:seed -- --vrindavan` (run from `packages/db/`)
5. `ANTHROPIC_API_KEY` set in `.env` (required for AI features #8, #9, #13)

---

## Test 1: AI Invoice Extraction (#8)

**Scenario:** Your accountant receives a paper invoice from a vendor. Instead of typing 10+ fields manually, they snap a photo or get a PDF and let AI extract everything.

### Steps

1. Go to **AP → Bills → New Bill**
2. Click the **"Extract from Invoice"** button (sparkles icon, top of form)
3. A dialog opens with a drag-and-drop zone
4. Drop a vendor invoice PDF or photo (any Indian tax invoice will work)
   - If you don't have one, search "Indian GST tax invoice sample PDF" and download one
5. Wait for "Analyzing invoice with AI..." spinner (takes 3-5 seconds)
6. **Preview screen** shows:
   - Vendor name + GSTIN
   - Invoice number, date, due date
   - Line items table (description, HSN, qty, rate, amount, tax)
   - Totals
   - Confidence score (green badge if >80%)
   - Vendor match status ("Matched to: Sharma & Associates" or "No match found")
7. Click **"Use This Data"**
8. The bill form auto-fills with all extracted data
9. Review — correct any errors — save

### What to verify
- [ ] Extract dialog opens and accepts PDF/JPG/PNG
- [ ] AI returns structured data within 5 seconds
- [ ] Vendor matched by GSTIN if it exists in the system
- [ ] Form auto-fills: vendor, invoice number, dates, line items, tax
- [ ] HSN/SAC codes extracted from the invoice
- [ ] Tax rates correctly identified
- [ ] User can edit any field before saving

### Edge cases
- Upload a blurry photo → should still extract (lower confidence)
- Upload a non-invoice PDF → should return low confidence or error
- No ANTHROPIC_API_KEY → shows "AI features require ANTHROPIC_API_KEY" message

---

## Test 2: Duplicate Invoice Detection (#15)

**Scenario:** A vendor accidentally sends the same invoice twice. The system catches it before the accountant double-pays.

### Steps — Exact Duplicate

1. Go to **AP → Bills → New Bill**
2. Select vendor: **Fresh Farms Raw Milk**
3. Enter invoice number: **FF-2026-001** (this already exists from seed data)
4. A **red error banner** should appear immediately:
   > "Duplicate: Invoice FF-2026-001 already exists for this vendor"
   - Shows the existing invoice with date, amount, status
   - "View Invoice" link opens the existing bill
5. The **Save Bill** button is **disabled** — you cannot submit

### Steps — Fuzzy Match

1. Same vendor: **Fresh Farms Raw Milk**
2. Enter a NEW invoice number: **FF-2026-099**
3. Enter invoice date: **2026-01-16** (close to existing FF-2026-001 dated 2026-01-15)
4. Add a line item with amount close to the existing bill (e.g., ₹75,000 vs existing ₹75,000)
5. An **amber warning banner** should appear:
   > "Possible duplicate: Similar amount and date to invoice FF-2026-001"
6. User can click **"I understand, continue"** to dismiss and save anyway

### What to verify
- [ ] Exact invoice number match → red error, submit blocked
- [ ] Fuzzy match (similar amount + date) → amber warning, submit allowed
- [ ] "View Invoice" link works
- [ ] Warning auto-triggers after 500ms of typing (debounced)
- [ ] Changing vendor clears previous warnings

---

## Test 3: Smart Payment Prioritization (#14)

**Scenario:** It's the end of the month. You have ₹5 lakh in the bank and ₹8 lakh in approved bills. Which vendors should you pay first?

### Steps

1. Go to **Dashboard** (home page)
2. Find the **"Payment Priority"** card
3. You should see:
   - **Summary bar** at top: "₹X overdue | ₹X due this week | ₹X total approved"
   - **Ranked list** of vendor bills, ordered by urgency:
     - Red dot = overdue (pay immediately)
     - Amber dot = due within 7 days (pay soon)
     - Green dot = upcoming (can wait)
   - Each row: vendor name, invoice number, amount, due date, reason
   - **"Pay"** button per row

### What to verify
- [ ] Overdue bills appear at the top (sorted by urgency score)
- [ ] Raw material suppliers (Fresh Farms) ranked higher than service providers
- [ ] Reason text makes sense: "Overdue by 15 days — raw material supplier"
- [ ] "Pay" button navigates to payment creation
- [ ] Summary totals match the data
- [ ] If no approved bills: shows "All caught up!" message

---

## Test 4: AI Bank Transaction Categorization (#9)

**Scenario:** You imported 50 bank transactions from HDFC bank statement. Each needs to be tagged to a GL account for bookkeeping. Instead of doing it manually, AI categorizes them in seconds.

### Steps

1. Go to **Banking → Transactions** (select HDFC Current Account)
2. You should see 50 transactions with a **"Category"** column
3. If not yet categorized, each shows "Uncategorized" in grey
4. Click **"Auto-Categorize"** button (sparkles icon in header)
5. Wait 5-10 seconds (rules run instantly, AI processes remaining in batches)
6. Result notification: "Categorized 50 transactions (23 by rules, 27 by AI)"
7. Each transaction now shows a **category badge**:
   - "5007 Bank Charges" (for bank charge debits)
   - "5003 Salary Expense" (for salary transfers)
   - "5004 Rent Expense" (for rent payments)
   - "1103 Accounts Receivable" (for customer NEFT credits)
   - "2101 Accounts Payable" (for vendor payments)
   - Confidence shown by color: green (≥90%), blue (≥70%), amber (<70%)

### Steps — Manual Override

1. Find a transaction that was categorized incorrectly
2. Click on the category badge
3. Change to a different GL account from the dropdown
4. Confidence resets to 100% (manual = trusted)

### What to verify
- [ ] Auto-categorize processes all uncategorized transactions
- [ ] Rule-based matches are instant (bank charges, salary, rent, known vendor/customer names)
- [ ] AI fallback handles ambiguous narrations
- [ ] Category badge shows account code + name
- [ ] Confidence color-coding works (green/blue/amber)
- [ ] Manual override works

### Categorization rules to validate

| Narration pattern | Expected category |
|---|---|
| "BANK CHARGES-JAN26" | 5007 Bank Charges |
| "SALARY-JAN26" | 5003 Salary Expense |
| "NEFT/REALTY TRUST/RENT-JAN26" | 5004 Rent Expense |
| "NEFT/FRESH DAIRY MART/UTR..." | 1103 Accounts Receivable |
| "NEFT/FRESH FARMS/UTR..." | 2101 Accounts Payable |
| "INTEREST CREDIT-FEB26" | 4002 Other Income |
| "UPI/MISC/STATIONERY" | 5009 Miscellaneous Expense (AI) |

---

## Test 5: Smart Reconciliation Suggestions (#10)

**Scenario:** You've imported bank transactions and want to match them against payments/receipts in runq. The system suggests matches with confidence scores.

### Steps

1. Go to **Banking → Reconciliation** (select HDFC Current Account)
2. The reconciliation view shows:
   - **Left panel:** Unreconciled bank transactions
   - **Right panel:** Unmatched payments and receipts
3. Each unreconciled transaction now has **suggested matches** with confidence:
   - **100%** (green) — UTR reference exact match
   - **90%** (green) — Amount + date match (±1 day)
   - **70%** (amber) — Narration contains vendor/customer name + amount matches
   - **50%** (grey) — Name found in narration but amount doesn't match
4. Click a suggestion to accept the match

### What to verify
- [ ] UTR-based matches show 100% confidence
- [ ] Narration-based matches identify vendor/customer names
- [ ] Confidence scores are color-coded
- [ ] Accepting a suggestion creates the reconciliation match
- [ ] After matching, the transaction moves to "Matched" status

### Example matches to look for

| Bank narration | Should match to | Confidence |
|---|---|---|
| "NEFT/FRESH DAIRY MART/UTR2601001" | Receipt from Fresh Dairy Mart | 100% (UTR) |
| "NEFT/FRESH FARMS/UTR2601101" | Payment to Fresh Farms | 100% (UTR) |
| "IMPS/BANGALORE DAIRY/UTR2601002" | Receipt from Bangalore Dairy Hub | 70-100% |

---

## Test 6: Anomaly Detection (#11)

**Scenario:** Your system flags unusual expenses automatically — protecting against fraud, data entry errors, and vendor overbilling.

### Steps

1. Go to **Dashboard**
2. Find the **"Expense Alerts"** card (with count badge)
3. You should see flagged anomalies:

### Expected anomalies from seed data

| Vendor | Invoice | Anomaly | Severity |
|---|---|---|---|
| Fresh Farms Raw Milk | FF-2026-005 | ₹5,00,000 is 3x the average (₹1,66,600) | High (red) |
| Fresh Farms Raw Milk | FF-2026-003, 004, 005 | 3 bills in 5 days (frequency spike) | Medium (amber) |

4. Each anomaly shows:
   - Warning icon (red for high, amber for medium)
   - Vendor name, invoice number, amount
   - Reason explaining why it's flagged
   - "View" link to open the invoice

### What to verify
- [ ] Amount outliers detected (>2x vendor average)
- [ ] Frequency spikes detected (3+ bills in 7 days)
- [ ] New vendor with large amount detected
- [ ] Severity color-coding (red = high, amber = medium)
- [ ] "View" link opens the correct invoice
- [ ] No false positives on normal bills

---

## Test 7: AI Financial Summary (#13)

**Scenario:** You're the business owner. You open the dashboard and get a 30-second digest of your financial health — no digging through reports.

### Steps

1. Go to **Dashboard**
2. The **"AI Insights"** card is at the very top (sparkles icon)
3. You should see 4-6 bullet points like:
   - "Your cash position is ₹17L, but you have ₹7.67L overdue to suppliers..."
   - "₹1.43L overdue from 3 customers — follow up today..."
   - "You paid ₹X to vendors this week, collected ₹Y from customers..."
4. Click **"Refresh"** to regenerate with latest data
5. The summary is cached for 1 hour (subsequent loads are instant)

### What to verify
- [ ] Summary appears on dashboard load
- [ ] Content is relevant to actual data (amounts match reality)
- [ ] Actionable insights (tells you what to DO, not just what happened)
- [ ] Refresh button works (shows loading, then new content)
- [ ] If no API key: shows "Configure ANTHROPIC_API_KEY..." message
- [ ] Second load is instant (Redis cached)

---

## Quick Checklist

| # | Test | Feature | Pass? |
|---|------|---------|-------|
| 1 | AI extracts invoice from PDF/photo | #8 Invoice Extraction | |
| 2a | Exact duplicate → blocked | #15 Duplicate Detection | |
| 2b | Fuzzy duplicate → warning | #15 Duplicate Detection | |
| 3 | Priority list with urgency scoring | #14 Payment Prioritization | |
| 4a | Auto-categorize by rules | #9 Bank Categorization | |
| 4b | Auto-categorize by AI | #9 Bank Categorization | |
| 4c | Manual category override | #9 Bank Categorization | |
| 5 | Recon suggestions with confidence | #10 Smart Reconciliation | |
| 6 | Anomaly alerts on dashboard | #11 Anomaly Detection | |
| 7 | AI summary on dashboard | #13 Financial Summary | |
