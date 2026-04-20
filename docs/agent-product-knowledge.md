# runq Product Knowledge Base

> This file is the single source of truth for the Finance Agent's product knowledge.
> When you add a new feature to runq, update this file so the agent knows about it.
> The agent reads this file at server startup.

## What is runq?

runq is an operations finance platform for Indian SMEs. It handles daily financial operations — invoicing, bill processing, payments, banking, GST compliance, and reporting. It works alongside Tally (not as a replacement) — runq handles daily ops, Tally handles CA compliance.

---

## Accounts Receivable (AR)

**What it does:** Manage sales invoices, customers, receipts, credit notes, and collections.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Invoices | /finance/ar/invoices | List all sales invoices, filter by status/customer/date |
| New Invoice | /finance/ar/invoices/new | Create a new sales invoice |
| Invoice Detail | /finance/ar/invoices/{id} | View invoice, send to customer, record payment |
| Import Invoices | /finance/ar/invoices/import | Bulk import from CSV/XLSX/PDF |
| PO Inbox | /finance/ar/po-inbox | Receive customer POs, auto-parse into draft invoices |
| Customers | /finance/ar/customers | List all customers |
| New Customer | /finance/ar/customers/new | Create a new customer |
| Customer Detail | /finance/ar/customers/{id} | View customer details, outstanding, history |
| Import Customers | /finance/ar/customers/import | Bulk import customers from CSV |
| Receipts | /finance/ar/receipts | List all payment receipts |
| New Receipt | /finance/ar/receipts/new | Record a customer payment |
| Credit Notes | /finance/ar/credit-notes | List credit notes |
| New Credit Note | /finance/ar/credit-notes/new | Create a credit note (return/adjustment) |
| Collections | /finance/ar/collections | Collections dashboard with aging and follow-up |
| Dunning | /finance/ar/dunning | Automated payment reminder sequences |
| Quotes | /finance/ar/quotes | Pro-forma invoices / quotations |
| Sales Orders | /finance/ar/sales-orders | Sales order management |
| Quick Templates | /finance/ar/quick-templates | Reusable invoice templates for fast invoicing |
| Recurring Invoices | /finance/ar/recurring | Auto-generate recurring invoices on schedule |

### Key Features
- **3 ways to create invoices:** Manual, from customer PO (PO Inbox), or bulk import
- **PO Inbox:** Customers share POs via upload/WhatsApp/email → AI parses them → creates draft invoices → user reviews and approves
- **Invoice Import:** Supports CSV, XLSX, PDF, images. AI extraction for scanned documents. Saves customer/item name aliases for faster future imports.
- **Dunning:** Automated payment reminder sequences via email/WhatsApp with escalating urgency
- **Credit Scoring:** Tracks customer payment history and credit reliability
- **Invoice Statuses:** draft → sent → partially_paid → paid (also: overdue, cancelled)
- **Quick Templates:** Save templates for frequently issued invoices (e.g., monthly milk delivery)

---

## Accounts Payable (AP)

**What it does:** Manage vendor bills, payments, debit notes, and purchase workflows.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Bills | /finance/ap/bills | List all purchase invoices/bills |
| New Bill | /finance/ap/bills/new | Create a bill manually |
| Bill Detail | /finance/ap/bills/{id} | View bill, match to PO/GRN, approve, pay |
| Scan Bill | /finance/ap/bills/{id}/scan | Upload PDF/image, AI extracts bill data |
| Import Bills | /finance/ap/bills/import | Bulk import bills from CSV |
| Vendors | /finance/ap/vendors | List all vendors/suppliers |
| New Vendor | /finance/ap/vendors/new | Create a new vendor |
| Vendor Detail | /finance/ap/vendors/{id} | View vendor details, bills, payments |
| Import Vendors | /finance/ap/vendors/import | Bulk import vendors from CSV |
| Payments | /finance/ap/payments | List all vendor payments |
| New Payment | /finance/ap/payments/new | Pay against bills |
| Advance Payment | /finance/ap/payments/advance | Pay vendor in advance (before bill) |
| Direct Payment | /finance/ap/payments/direct | Pay without a bill reference |
| Bulk Payment | /finance/ap/payments/bulk | Batch payment entry |
| Pay Runs | /finance/ap/pay-runs | Batch payment processing |
| Debit Notes | /finance/ap/debit-notes | Vendor returns and adjustments |

### Key Features
- **AI Bill Extraction:** Upload PDF/image → local OCR first (free) → Claude AI Vision fallback (for complex layouts). Extracts vendor, GSTIN, line items, amounts, TDS.
- **3-Way Matching:** Links Purchase Invoice → PO → GRN. Checks quantity (2% tolerance) and price match. Flags mismatches.
- **Payment Prioritization:** AI suggests which bills to pay first based on due date, vendor relationship, and discount opportunities.
- **Duplicate Detection:** Flags potential duplicate bills by invoice number/vendor/amount.
- **NEFT/RTGS Export:** Generate bank upload files for batch payments.
- **Bill Statuses:** draft → pending_match → matched → approved → partially_paid → paid (also: cancelled)
- **TDS-Aware:** Handles TDS deduction (194C, 194J, etc.) on vendor payments.

---

## Banking

**What it does:** Manage bank accounts, import statements, reconcile transactions.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Bank Accounts | /finance/banking/accounts | List all bank accounts with balances |
| New Account | /finance/banking/accounts/new | Add a bank account |
| Account Detail | /finance/banking/accounts/{id} | View account transactions and balance |
| Import Statement | /finance/banking/transactions/import | Import bank statement (CSV/OFX) |
| Reconciliation | /finance/banking/reconciliation | Match bank transactions to bills/invoices |
| PG Reconciliation | /finance/banking/pg-recon | Reconcile payment gateway settlements |
| Cheques | /finance/banking/cheques | Track post-dated cheques (PDC) |
| Petty Cash | /finance/banking/petty-cash | Petty cash expenses and reimbursement |

### Key Features
- **Two-Path Reconciliation:**
  - With vendor match → auto-creates bill + payment + journal entries
  - Without vendor → direct journal entry (GL categorization)
- **AI Categorization:** Learns from corrections to auto-categorize future transactions
- **Narration Rules:** Pattern-based rules to auto-match vendors from bank narrations
- **Payment Gateway Recon:** Supports Razorpay, PhonePe, Paytm settlement reconciliation
- **Cheque Tracking:** Track issued cheques, PDCs, bounced cheques with status management

---

## General Ledger (GL)

**What it does:** Chart of accounts, journal entries, trial balance, fiscal period management.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Chart of Accounts | /finance/gl/accounts | View and manage all GL accounts |
| Journal Entries | /finance/gl/journal-entries | List all journal entries |
| New Journal Entry | /finance/gl/journal-entries/new | Create a manual journal entry |
| JE Detail | /finance/gl/journal-entries/{id} | View journal entry with lines |
| Trial Balance | /finance/gl/trial-balance | Trial balance with as-of-date filter |

### Key Features
- **Auto-Posting:** Invoices, bills, payments, receipts, bank categorizations all auto-create journal entries
- **Fiscal Periods:** Create, close, and lock periods to prevent backdated entries
- **Account Types:** Asset, Liability, Equity, Revenue, Expense — with debit/credit normal handling

---

## GST

**What it does:** GST-aware invoicing, GSTIN validation, return filing, GSTR-2B reconciliation.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| GST Returns | /finance/gst/returns | List all GSTR-1 and GSTR-3B returns |
| Return Detail | /finance/gst/returns/{id} | View return data, validate, upload, file |
| GSTR-3B Detail | /finance/gst/return-3b-detail/{id} | View GSTR-3B breakdown |
| 2B Reconciliation | /finance/gst/reconciliation | Match GSTR-2B with vendor bills |
| GST Readiness | /finance/gst/readiness | Filing readiness dashboard |

### Key Features
- **GSTR-1 Generation:** Auto-generates GSTR-1 from sales invoices
- **GSTR-3B Generation:** Auto-generates summary return from books
- **GSTR-2B Pull & Reconciliation:** Pulls supplier data from GSTN, auto-matches with vendor bills, flags mismatches
- **GST Login:** Secure OTP-based GST portal login via GSP (White Books)
- **ITC Tracking:** Tracks Input Tax Credit availability and at-risk amounts
- **GSTIN Validation:** Verifies vendor/customer GSTIN against government database

---

## Fixed Assets

**What it does:** Asset register, depreciation schedules, disposal, and transfers.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Assets | /finance/fa/assets | List all fixed assets |
| New Asset | /finance/fa/assets/new | Create a new asset |
| Asset Detail | /finance/fa/assets/{id} | View asset with depreciation history |
| Categories | /finance/fa/categories | Asset categories with depreciation methods |
| Block of Assets | /finance/fa/block-of-assets | Block-wise depreciation schedule |
| Depreciation Run | /finance/fa/depreciation-run | Run depreciation and create JEs |
| Import Assets | /finance/fa/import | Bulk import assets |

### Key Features
- **Depreciation Methods:** SLM (Straight Line) and WDV (Written Down Value)
- **Auto-JE:** Depreciation runs auto-create journal entries
- **Asset Disposal:** Remove fully depreciated or sold assets
- **Asset Transfer:** Move assets between cost centers/locations

---

## Masters

**What it does:** Manage items, price lists, categories, and HSN/SAC codes.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Items | /finance/masters/items | List all products/items |
| New Item | /finance/masters/items/new | Create item with HSN, prices, tax rates |
| Item Detail | /finance/masters/items/{id} | View/edit item |
| Import Items | /finance/masters/items/import | Bulk import items |
| Item Profitability | /finance/masters/items/profitability | Margin analysis by item |
| Item Analysis | /finance/masters/items/analysis | Sales and cost trends |
| Categories | /finance/masters/categories | Item categories |
| Price Lists | /finance/masters/price-lists | Customer/vendor-specific price lists |
| HSN/SAC Codes | /finance/masters/hsn-sac | GST commodity codes |

---

## Reports

**What it does:** Financial statements, analytics, and forecasts.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Profit & Loss | /finance/reports/profit-and-loss | P&L statement (date range filter) |
| Balance Sheet | /finance/reports/balance-sheet | Balance sheet (as-of-date filter) |
| Cash Flow | /finance/reports/cash-flow | Cash flow statement |
| Cash Flow Forecast | /finance/reports/cash-flow-forecast | Predict future cash position |
| Expense Analytics | /finance/reports/expense-analytics | Expense breakdown by category/vendor |
| Revenue Analytics | /finance/reports/revenue-analytics | Revenue breakdown by customer/product |
| Period Comparison | /finance/reports/comparison | YoY, QoQ, MoM comparisons |

### Key Features
- **All reports exportable to CSV**
- **Scheduled Reports:** Auto-email reports to stakeholders on a schedule
- **Comparative Analysis:** Compare any two periods side by side

---

## Workflows & Approvals

**What it does:** Multi-level approval workflows for bills, payments, invoices.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Workflows | /finance/workflows | Configure approval workflows |
| Approvals | /finance/workflows/approvals | Pending approvals inbox |
| Tasks | /finance/workflows/tasks | Task assignment and tracking |

### Key Features
- **Configurable Workflows:** Set up multi-step approval chains
- **Comments & Collaboration:** Add comments to documents in workflow
- **Activity Timeline:** Track all actions on a document

---

## Vendor Management

**What it does:** Advanced vendor relationship management.

### Pages & Navigation

| Page | Path | What it does |
|------|------|-------------|
| Contracts | /finance/vendor-management/contracts | Vendor contract tracking |
| Requisitions | /finance/vendor-management/requisitions | Purchase requisition approval |
| Payment Schedules | /finance/vendor-management/payment-schedules | Plan vendor payment schedules |
| Ratings | /finance/vendor-management/ratings | Vendor performance scorecards |
| Early Discounts | /finance/vendor-management/early-discounts | Early payment discount tracking |

---

## HR & Expenses

| Page | Path | What it does |
|------|------|-------------|
| Expense Claims | /finance/hr/expense-claims | Employee expense reimbursement workflow |

---

## Audit

| Page | Path | What it does |
|------|------|-------------|
| Gap Scan | /finance/audit/gap-scan | Compliance gap analysis |

---

## Settings

| Page | Path | What it does |
|------|------|-------------|
| Company | /finance/settings/company | Company name, GSTIN, address, logo |
| Users | /finance/settings/users | User management (owner, accountant, viewer roles) |
| Invoice Numbering | /finance/settings/invoice-numbering | Customize number formats |
| Email Provider | /finance/settings/email-provider | SMTP configuration |
| Notifications | /finance/settings/notifications | Notification preferences |
| Opening Balances | /finance/settings/opening-balances | Set AR/AP opening balances |
| Item Attributes | /finance/settings/item-attributes | Custom item fields |
| Tally Export | /finance/settings/tally-export | Export data for Tally import |
| Tally Import | /finance/settings/tally-import | Import data from Tally |
| CA Portal | /finance/settings/ca-portal | Generate secure CA access link |
| Webhooks | /finance/settings/webhooks | Configure webhook endpoints |
| Integrations | /finance/settings/integrations | Third-party integrations |
| Scheduled Reports | /finance/settings/scheduled-reports | Auto-email report schedules |
| Setup Wizard | /finance/settings/setup | Initial company setup |

---

## Portals (External Access)

- **CA Portal:** Read-only access for chartered accountants to view P&L, Balance Sheet, Cash Flow, Trial Balance, Sales/Purchase registers. Exports to CSV and Tally XML. Access via secure shareable link.
- **Vendor Portal:** Vendors can view their POs, bills, and payment status. Read-only.
- **Customer Portal:** Customers can view their invoices and payment history.

---

## Integrations

- **Tally ERP:** Bidirectional — import ledgers/vouchers from Tally, export data for Tally
- **WMS (Warehouse Management):** Webhook integration for PO, GRN, invoice events
- **WhatsApp (Gupshup):** Send invoices and payment reminders via WhatsApp
- **Email (SMTP):** Send invoices, receipts, reports, reminders
- **Payment Gateways:** Razorpay, PhonePe, Paytm settlement reconciliation
- **Webhooks:** Custom outbound webhook events (bill.created, invoice.sent, payment.created, etc.)
- **GST Portal (via GSP):** GSTR-1/3B filing, GSTR-2B pull, GSTIN verification

---

## AI Features

- **Bill Extraction:** Upload PDF/image → OCR + AI extracts vendor, items, amounts, tax
- **PO Parsing:** AI parses customer purchase orders into structured data
- **Invoice Import Parsing:** AI extracts invoice data from various file formats
- **Bank Categorization:** AI auto-categorizes bank transactions by learning patterns
- **Payment Prioritization:** AI suggests optimal payment order
- **Duplicate Detection:** AI flags potential duplicate bills
- **Financial Insights:** AI-generated daily financial summary on dashboard
- **Finance Agent:** Chat with AI about your financial data (this agent)

---

## Key Concepts for Indian SMEs

- **GST:** Goods & Services Tax — CGST (central), SGST (state), IGST (inter-state)
- **TDS:** Tax Deducted at Source — sections 194C (contractors), 194J (professionals), etc.
- **HSN/SAC:** Commodity codes for GST classification
- **GSTIN:** 15-digit GST identification number
- **Financial Year:** April to March (e.g., FY 2025-26 = Apr 2025 – Mar 2026)
- **Lakh/Crore:** Indian numbering — 1 lakh = 1,00,000; 1 crore = 1,00,00,000
- **PDC:** Post-Dated Cheque
- **GSTR-1:** Monthly return for outward supplies (sales)
- **GSTR-3B:** Monthly summary return with tax payment
- **GSTR-2B:** Auto-populated return from suppliers (for ITC matching)
- **ITC:** Input Tax Credit — GST paid on purchases, claimable against GST on sales
