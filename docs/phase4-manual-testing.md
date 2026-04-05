# Phase 4 — Manual Testing Guide

**Scenario:** Vrindavan Milk Products is scaling — generating financial statements for their CA, configuring approval workflows, rating vendors, scheduling payments, and connecting external systems.

---

## Pre-requisites

1. API: `http://localhost:3003` | Web: `http://localhost:4004`
2. Login: `admin@demo.com` / `admin123` / `demo-company`
3. Seed data loaded (Vrindavan test data)
4. Schema pushed (`pnpm db:push` from `packages/db/`)
5. Phase 1–3 data exists (invoices, payments, receipts, bank transactions, GL journal entries)

---

## Test 1: Profit & Loss Statement (#36)

**Scenario:** Your CA asks for the P&L for the current financial year.

### Steps
1. Go to **Reports → P&L** in the sidebar
2. Date range should default to current FY (April 1 – today)
3. Should see:
   - **Revenue** section: accounts with type `revenue` (e.g., 4001 Sales Revenue)
   - **Expenses** section: accounts with type `expense` (e.g., 5002 Cost of Goods)
   - **Net Profit** = Total Revenue − Total Expenses

### API
```bash
TOKEN=your_token
curl "http://localhost:3003/api/v1/reports/profit-and-loss?dateFrom=2025-04-01&dateTo=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Revenue and expense accounts listed with amounts
- [ ] Totals computed correctly
- [ ] Net Profit shown in green (positive) or red (negative)
- [ ] Changing date range updates the numbers
- [ ] Accounts with zero balance are excluded

---

## Test 2: Balance Sheet (#56)

**Scenario:** You need a snapshot of the company's financial position as of today.

### Steps
1. Go to **Reports → Balance Sheet**
2. Default shows as-of today
3. Should see three sections:
   - **Assets** (accounts starting with 1xxx)
   - **Liabilities** (accounts starting with 2xxx)
   - **Equity** (accounts starting with 3xxx)
4. Check: Total Assets = Total Liabilities + Total Equity

### API
```bash
curl "http://localhost:3003/api/v1/reports/balance-sheet?asOfDate=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Assets, Liabilities, Equity sections populated
- [ ] Accounting equation balances (or shows "Unbalanced" warning)
- [ ] As-of-date picker works — selecting a past date shows historical balances
- [ ] Only accounts with non-zero balances shown

---

## Test 3: Cash Flow Statement (#37)

**Scenario:** You want to see where cash came from and where it went this quarter.

### Steps
1. Go to **Reports → Cash Flow**
2. Set date range: 2026-01-01 to 2026-03-31
3. Should see:
   - **Operating Activities**: Vendor Payments (outflow), Customer Receipts (inflow)
   - **Investing Activities**: (may be empty)
   - **Financing Activities**: (may be empty)
   - **Opening Balance**, **Net Change**, **Closing Balance**

### API
```bash
curl "http://localhost:3003/api/v1/reports/cash-flow?dateFrom=2026-01-01&dateTo=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Operating activities show vendor payments and customer receipts
- [ ] Net Change = sum of all three activities
- [ ] Closing Balance = Opening Balance + Net Change
- [ ] Amounts match actual cash movement

---

## Test 4: Expense Analytics (#38)

**Scenario:** You want to know where the money is going — which categories, which vendors, which months.

### Steps
1. Go to **Reports → Expenses**
2. Set date range for current FY
3. Three views:
   - **By Category**: horizontal bars showing expense accounts
   - **By Vendor**: table with vendor name, amount, percentage
   - **By Month**: monthly bars showing spending trend

### API
```bash
curl "http://localhost:3003/api/v1/reports/expense-analytics?dateFrom=2025-04-01&dateTo=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Percentages add up to ~100%
- [ ] By Vendor matches purchase invoice totals
- [ ] By Month shows trend across the period
- [ ] Total matches P&L total expenses

---

## Test 5: Revenue Analytics (#39)

**Scenario:** You want to see which customers bring in the most revenue.

### Steps
1. Go to **Reports → Revenue**
2. Set date range for current FY
3. Two views:
   - **By Customer**: table with customer name, amount, percentage
   - **By Month**: monthly revenue bars

### API
```bash
curl "http://localhost:3003/api/v1/reports/revenue-analytics?dateFrom=2025-04-01&dateTo=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Customer breakdown matches sales invoice totals
- [ ] Monthly trend shows revenue pattern
- [ ] Total matches P&L total revenue

---

## Test 6: Comparison Reports (#42)

**Scenario:** You want to compare January vs February vs March performance.

### Steps
1. Go to **Reports → Comparison**
2. Select type: **MoM** (Month-over-Month)
3. Set range: 2026-01-01 to 2026-03-31
4. Should see a table with:
   - Columns: Jan 2026, Feb 2026, Mar 2026
   - Rows: Revenue, Expenses, Net Profit

### API
```bash
curl "http://localhost:3003/api/v1/reports/comparison?type=mom&dateFrom=2026-01-01&dateTo=2026-03-31" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Period columns match the date range
- [ ] Revenue, Expenses, Net Profit rows present
- [ ] Numbers match individual month P&L reports
- [ ] MoM and YoY type selector works

---

## Test 7: Cash Flow Forecast (#12)

**Scenario:** You want to know if you'll have enough cash in 90 days.

### Steps
1. Go to **Reports → Forecast**
2. Default shows 90-day projection
3. Should see:
   - Summary cards: Current Balance, 30d, 60d, 90d projections
   - Projection table: date, projected balance, confidence level

### API
```bash
curl "http://localhost:3003/api/v1/reports/cash-flow-forecast?days=90" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Current balance matches actual bank balances
- [ ] Projections trend logically based on history
- [ ] Confidence decreases for further-out projections
- [ ] Days selector (30/60/90/180/365) changes the projections

---

## Test 8: Fiscal Period Management (#57)

**Scenario:** Quarter ended — you want to lock Q3 so no one posts back-dated entries.

### Steps
1. Go to **General Ledger → Fiscal Periods**
2. Create a period:
   - Name: `Q3 FY2025-26`
   - Start: `2025-10-01`
   - End: `2025-12-31`
3. Close it → status changes to **closed**
4. Lock it → status changes to **locked**
5. Try locking again → should get an error

### API
```bash
# Create
curl -X POST http://localhost:3003/api/v1/gl/fiscal-periods \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Q3 FY2025-26","startDate":"2025-10-01","endDate":"2025-12-31"}'

# Close
PERIOD_ID=uuid_from_response
curl -X PUT "http://localhost:3003/api/v1/gl/fiscal-periods/$PERIOD_ID/close" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"closed"}'

# Lock
curl -X PUT "http://localhost:3003/api/v1/gl/fiscal-periods/$PERIOD_ID/close" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"locked"}'
```

### What to verify
- [ ] Period created with status "open"
- [ ] Close sets status to "closed" with closedBy and closedAt
- [ ] Lock sets status to "locked"
- [ ] Locked periods cannot be re-closed (409 error)
- [ ] Status badges: green=open, yellow=closed, red=locked

---

## Test 9: Configurable Dashboard Widgets (#40)

**Scenario:** You want a custom dashboard — move cash position to the top, hide AI insights.

### Steps
1. Go to **Dashboard**
2. On first load, default 12 widgets should appear
3. Test via API — save a custom layout:

```bash
curl -X PUT http://localhost:3003/api/v1/dashboard/widgets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"widgets":[
    {"widgetType":"cash_position","position":0,"isVisible":true},
    {"widgetType":"stats_overview","position":1,"isVisible":true},
    {"widgetType":"profit_loss_summary","position":2,"isVisible":true},
    {"widgetType":"ai_insights","position":3,"isVisible":false}
  ]}'
```

### What to verify
- [ ] Default widgets load on first visit (12 widgets)
- [ ] Custom layout persists after page reload
- [ ] Hidden widgets (isVisible=false) don't render
- [ ] Widget order matches position values
- [ ] Layout is per-user (different users can have different layouts)

---

## Test 10: Scheduled Report Emails (#41)

**Scenario:** You want a daily cash position email every morning.

### Steps
1. Go to **Settings → Scheduled Reports**
2. Create a new scheduled report:
   - Name: `Daily Cash Position`
   - Report Type: `cash_position`
   - Frequency: `daily`
   - Recipients: `admin@demo.com`
3. Toggle it off, then back on
4. Delete it

### API
```bash
# Create
curl -X POST http://localhost:3003/api/v1/dashboard/scheduled-reports \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Daily Cash Position","reportType":"cash_position","frequency":"daily","recipients":["admin@demo.com"]}'

# List
curl http://localhost:3003/api/v1/dashboard/scheduled-reports \
  -H "Authorization: Bearer $TOKEN"

# Toggle
REPORT_ID=uuid_from_response
curl -X PUT "http://localhost:3003/api/v1/dashboard/scheduled-reports/$REPORT_ID/toggle" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{}'

# Delete
curl -X DELETE "http://localhost:3003/api/v1/dashboard/scheduled-reports/$REPORT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Report created with isActive=true and nextRunAt computed
- [ ] Toggle flips isActive (true→false→true)
- [ ] Delete removes the report
- [ ] Frequency options: daily, weekly, monthly
- [ ] Report type options: profit_and_loss, balance_sheet, cash_flow, expense_analytics, cash_position

---

## Test 11: Approval Workflows (#43, #49)

**Scenario:** Any payment over ₹50,000 needs owner approval. Below that, accountant can approve.

### Steps
1. Go to **Workflows → Approvals**
2. Create a workflow:
   - Name: `Payment Approval`
   - Entity Type: `payment`
   - Rule 1: Step 1, Role: accountant, Min: 0, Max: 50000
   - Rule 2: Step 2, Role: owner, Min: 50000, Max: (empty)

### API
```bash
# Create workflow
curl -X POST http://localhost:3003/api/v1/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Payment Approval","entityType":"payment","rules":[
    {"stepOrder":1,"approverRole":"accountant","minAmount":0,"maxAmount":50000},
    {"stepOrder":2,"approverRole":"owner","minAmount":50000,"maxAmount":null}
  ]}'

# Submit for approval
curl -X POST http://localhost:3003/api/v1/workflows/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entityType":"payment","entityId":"PAYMENT_UUID","amount":75000}'

# Check instance
curl "http://localhost:3003/api/v1/workflows/instance?entityType=payment&entityId=PAYMENT_UUID" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Workflow created with rules
- [ ] Submitting an entity creates approval instance with steps
- [ ] Amount-based routing selects correct rules
- [ ] Approving all steps marks instance as "approved"
- [ ] Rejecting any step marks instance as "rejected", skips remaining

---

## Test 12: Comments & Notes (#45)

**Scenario:** Team discusses a vendor payment directly on the transaction.

### Steps
1. Go to any transaction detail page
2. Add a comment (or via API)

### API
```bash
# Add comment
curl -X POST http://localhost:3003/api/v1/workflows/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entityType":"payment","entityId":"PAYMENT_UUID","content":"Vendor confirmed receipt of payment via email."}'

# List comments
curl "http://localhost:3003/api/v1/workflows/comments?entityType=payment&entityId=PAYMENT_UUID" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Comment created with userId and timestamp
- [ ] Comments listed chronologically for the entity
- [ ] entityType can be: payment, purchase_invoice, sales_invoice, etc.

---

## Test 13: Task Assignments (#46)

**Scenario:** You assign the accountant to follow up with a vendor on invoice #123.

### Steps
1. Go to **Workflows → Tasks**
2. Create a task:
   - Title: `Follow up with Anand Dairy on invoice #PI-001`
   - Entity: payment / PAYMENT_UUID
   - Assigned To: (select user)
   - Due Date: next Friday

### API
```bash
# Create task
USER_ID=uuid_of_admin
curl -X POST http://localhost:3003/api/v1/workflows/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entityType\":\"payment\",\"entityId\":\"$USER_ID\",\"title\":\"Follow up with Anand Dairy\",\"assignedTo\":\"$USER_ID\",\"dueDate\":\"2026-04-04\"}"

# List tasks
curl http://localhost:3003/api/v1/workflows/tasks \
  -H "Authorization: Bearer $TOKEN"

# Update status
TASK_ID=uuid_from_response
curl -X PUT "http://localhost:3003/api/v1/workflows/tasks/$TASK_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

### What to verify
- [ ] Task created with status "open"
- [ ] Status transitions: open → in_progress → completed
- [ ] Tasks filterable by assignedTo, entityType
- [ ] Due date displayed, overdue tasks highlighted

---

## Test 14: Activity Timeline (#47)

**Scenario:** You want to see the full history of actions on a payment.

### API
```bash
curl "http://localhost:3003/api/v1/workflows/activity?entityType=payment&entityId=ENTITY_UUID" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Activities logged for workflow submissions, approvals, comments, task changes
- [ ] Each entry has: action, description, userId, timestamp, metadata
- [ ] Chronological order (newest first or oldest first)

---

## Test 15: Vendor Payment Scheduling (#30)

**Scenario:** Every Friday, you batch-pay all approved vendor bills due that week.

### Steps
1. Go to **Vendor Management → Payment Schedules**
2. Create a schedule:
   - Name: `Friday Payments`
   - Scheduled Date: next Friday
   - Add items: select invoice, vendor, amount

### API
```bash
# Get an invoice to schedule
INVOICE=$(curl -s http://localhost:3003/api/v1/ap/purchase-invoices?page=1&limit=1 \
  -H "Authorization: Bearer $TOKEN")

# Create schedule
curl -X POST http://localhost:3003/api/v1/vendor-management/payment-schedules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Friday Payments","scheduledDate":"2026-04-04","items":[
    {"invoiceId":"INVOICE_UUID","vendorId":"VENDOR_UUID","amount":25000}
  ]}'
```

### What to verify
- [ ] Schedule created with status "draft"
- [ ] Total amount auto-computed from items
- [ ] Can approve schedule (owner only)
- [ ] Schedule lists show date, status, total

---

## Test 16: Early Payment Discounts (#31)

**Scenario:** A vendor offers 2% discount if paid within 10 days. You want to see which discounts are expiring soon.

### API
```bash
curl http://localhost:3003/api/v1/vendor-management/early-payment-discounts \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Lists invoices with discount terms due within 10 days
- [ ] Shows savings amount, days remaining
- [ ] Urgency badges for expiring discounts
- [ ] Empty state if no discounts available

---

## Test 17: Purchase Requisitions → PO (#32)

**Scenario:** The warehouse manager requests office supplies. You approve and convert to a PO.

### Steps
1. Go to **Vendor Management → Requisitions**
2. Create a requisition:
   - Description: `Office supplies for Q2`
   - Items: Printer Paper (100 × ₹250), Ink Cartridges (10 × ₹1,500)
3. Approve it
4. Convert to PO

### API
```bash
# Create
curl -X POST http://localhost:3003/api/v1/vendor-management/requisitions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Office supplies for Q2","items":[
    {"itemName":"Printer Paper A4","quantity":100,"estimatedUnitPrice":250},
    {"itemName":"Ink Cartridges","quantity":10,"estimatedUnitPrice":1500}
  ]}'

# Approve
PR_ID=uuid_from_response
curl -X PUT "http://localhost:3003/api/v1/vendor-management/requisitions/$PR_ID/approve" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'

# Convert to PO
curl -X PUT "http://localhost:3003/api/v1/vendor-management/requisitions/$PR_ID/convert" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```

### What to verify
- [ ] PR created with auto-generated number (PR-0001)
- [ ] Total auto-computed: ₹40,000 (100×250 + 10×1500)
- [ ] Status: draft → approved → converted
- [ ] Items listed with quantities and estimated costs

---

## Test 18: Vendor Rating / Scorecard (#33)

**Scenario:** After a quarter of working with Anand Dairy, you rate their performance.

### Steps
1. Go to **Vendor Management → Ratings**
2. Create a rating:
   - Vendor: Anand Dairy
   - Period: 2026-Q1
   - Delivery: 4/5, Quality: 5/5, Pricing: 3/5
3. Check the scorecard

### API
```bash
VENDOR_ID=uuid_of_vendor
# Create rating
curl -X POST http://localhost:3003/api/v1/vendor-management/ratings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vendorId\":\"$VENDOR_ID\",\"period\":\"2026-Q1\",\"deliveryScore\":4,\"qualityScore\":5,\"pricingScore\":3,\"notes\":\"Good quality, pricing could improve\"}"

# Get scorecard
curl "http://localhost:3003/api/v1/vendor-management/ratings/scorecard/$VENDOR_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### What to verify
- [ ] Rating created with overallScore = 4 (average of 4+5+3 = 4)
- [ ] Scorecard shows average scores across periods
- [ ] Scores are 1–5 scale
- [ ] Unique constraint: one rating per vendor per period

---

## Test 19: Vendor Contracts (#34)

**Scenario:** You sign a yearly supply agreement with Anand Dairy.

### Steps
1. Go to **Vendor Management → Contracts**
2. Create a contract:
   - Vendor: Anand Dairy
   - Contract #: CTR-001
   - Title: Annual Supply Agreement
   - Start: 2026-01-01, End: 2026-12-31
   - Value: ₹5,00,000

### API
```bash
curl -X POST http://localhost:3003/api/v1/vendor-management/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vendorId\":\"$VENDOR_ID\",\"contractNumber\":\"CTR-001\",\"title\":\"Annual Supply Agreement\",\"startDate\":\"2026-01-01\",\"endDate\":\"2026-12-31\",\"value\":500000,\"terms\":\"Net 30 payment terms\"}"
```

### What to verify
- [ ] Contract created with status "draft"
- [ ] Status badges: draft, active, expired, cancelled
- [ ] Value displayed as currency
- [ ] Filterable by vendorId

---

## Test 20: Integrations Setup (#50–55)

**Scenario:** You connect Razorpay for payouts and set up Slack notifications.

### Steps
1. Go to **Settings → Integrations**
2. Add a new integration:
   - Provider: Razorpay
   - Config: `{"apiKey":"test_key","secret":"test_secret"}`
3. Try syncing
4. Check logs

### API
```bash
# Create
curl -X POST http://localhost:3003/api/v1/integrations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"razorpay","config":{"apiKey":"test_key","secret":"test_secret"}}'

# Sync
INT_ID=uuid_from_response
curl -X POST "http://localhost:3003/api/v1/integrations/$INT_ID/sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"fetch_settlements"}'

# Logs
curl "http://localhost:3003/api/v1/integrations/$INT_ID/logs" \
  -H "Authorization: Bearer $TOKEN"

# Deactivate
curl -X PUT "http://localhost:3003/api/v1/integrations/$INT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}'

# Try sync when inactive (should fail)
curl -X POST "http://localhost:3003/api/v1/integrations/$INT_ID/sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"fetch_settlements"}'
```

### What to verify
- [ ] Integration created as active
- [ ] Sync logs recorded with timestamp
- [ ] Deactivation prevents further syncs
- [ ] Available providers: shopify, woocommerce, razorpay, cashfree, tally, google_sheets, slack, teams
- [ ] Unique constraint: one config per provider per tenant

---

## Test 21: CA Portal / Read-Only Access (#55)

**Scenario:** Your CA needs access to reports and exports without a full login.

### What to verify
- [ ] CA can use the Tally Export functionality (existing at Settings → Tally Export)
- [ ] Reports are accessible to `viewer` role (RBAC check)
- [ ] Viewer role cannot create/modify data

---

## Quick Checklist

| # | Test | Feature | Pass? |
|---|------|---------|-------|
| 1 | P&L shows revenue, expenses, net profit | #36 P&L Statement | |
| 2 | Balance sheet with accounting equation check | #56 Balance Sheet | |
| 3 | Cash flow with operating/investing/financing | #37 Cash Flow | |
| 4 | Expense breakdown by category/vendor/month | #38 Expense Analytics | |
| 5 | Revenue breakdown by customer/month | #39 Revenue Analytics | |
| 6 | MoM/YoY comparison table | #42 Comparison Reports | |
| 7 | 30/60/90-day cash flow projection | #12 Cash Flow Forecast | |
| 8 | Fiscal period create/close/lock lifecycle | #57 Accrual Accounting | |
| 9 | Dashboard widgets configurable per user | #40 Widgets | |
| 10 | Scheduled report email CRUD | #41 Scheduled Emails | |
| 11 | Approval workflow with amount-based routing | #43 Approvals + #49 Maker-Checker | |
| 12 | Comments on transactions | #45 Comments | |
| 13 | Task assignment with status transitions | #46 Tasks | |
| 14 | Activity timeline per entity | #47 Activity Timeline | |
| 15 | Batch payment scheduling | #30 Payment Scheduling | |
| 16 | Early payment discount detection | #31 Early Discounts | |
| 17 | Purchase requisition → PO workflow | #32 Requisitions | |
| 18 | Vendor rating with scorecard | #33 Vendor Rating | |
| 19 | Vendor contract management | #34 Contracts | |
| 20 | Integration setup, sync, logs | #50–54 Integrations | |
| 21 | CA read-only access via viewer role | #55 CA Portal | |

> **Note:** #44 (Mobile-Optimized Approval Flow) and #35 (Advance Payment Auto-Adjustment) are enhancements to existing functionality — test via the existing AP advance payments and the approval workflow endpoints on a mobile viewport.
