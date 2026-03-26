# Phase 1 — Manual Testing Guide

**Scenario:** You run a dairy distribution company (Vrindavan Milk Products) registered in Maharashtra. You sell to retailers across India and buy packaging materials, logistics, and professional services from vendors.

---

## Pre-requisites

1. API running: `http://localhost:3003`
2. Web app running: `http://localhost:5173`
3. Login: `admin@demo.com` / `admin123` / tenant: `demo-company`

---

## Test 1: Company GST Profile

**Go to:** Settings → Company

**Fill in:**
| Field | Value |
|-------|-------|
| GSTIN | 27AABCV1234F1ZM |
| Legal Name | Vrindavan Milk Products Pvt Ltd |
| State | Maharashtra (27) |
| Address Line 1 | Plot 42, MIDC Industrial Area |
| Address Line 2 | Andheri East |
| City | Mumbai |
| Pincode | 400093 |

**Click** Save Changes.

**Verify:**
- Refresh the page — all fields should persist
- The state dropdown should show "Maharashtra" selected

---

## Test 2: HSN/SAC Code Search

**Go to:** AR → Invoices → New Invoice

In the line items table, click the **HSN/SAC** search field.

**Try these searches:**

| Type | Search | Expected Result |
|------|--------|-----------------|
| By code | `0401` | "Milk and cream, not concentrated" — 0% GST |
| By code | `8471` | "Computers and processing units" — 18% GST |
| By description | `milk` | Shows milk-related HSN codes |
| By description | `consulting` | Shows IT consulting SAC code (998311) — 18% |
| By code | `9963` | Shows restaurant/hotel SAC codes |

**Verify:**
- Selecting a code auto-fills the GST Rate dropdown
- Selecting "0401" (milk) should set rate to 0%
- Selecting "998311" (IT consulting) should set rate to 18%

---

## Test 3: Intra-State Invoice (CGST + SGST)

**Scenario:** You're selling milk products to a retailer in Maharashtra (same state as you).

### Step 3a: Create customer

**Go to:** AR → Customers → New Customer

| Field | Value |
|-------|-------|
| Name | Fresh Dairy Mart |
| Type | B2B |
| Email | accounts@freshdairy.com |
| Phone | 9876543210 |
| GSTIN | 27AALCF5678G1Z3 |
| State | Maharashtra |
| City | Pune |
| Pincode | 411001 |
| Payment Terms | Net 30 days |

### Step 3b: Create invoice

**Go to:** AR → Invoices → New Invoice

| Field | Value |
|-------|-------|
| Customer | Fresh Dairy Mart |
| Invoice Date | Today |
| Due Date | 30 days from today |

**Line Items:**

| Description | HSN/SAC | Qty | Unit Price | Tax Category | GST Rate |
|-------------|---------|-----|------------|--------------|----------|
| Full Cream Milk (500ml x 24) | 0402 | 100 | 250.00 | Taxable | 5% |
| Curd (200g x 12) | 0406 | 50 | 180.00 | Taxable | 12% |
| Paneer (200g x 6) | 0406 | 30 | 320.00 | Taxable | 12% |

**Verify the summary (auto-calculated):**
- Subtotal: ₹43,600.00 (25,000 + 9,000 + 9,600)
- GST: ₹3,402.00 (1,250 + 1,080 + 1,152 = 3,482... calculate exact)
- Total: Subtotal + GST

**After saving, verify the invoice detail shows:**
- Place of Supply: Maharashtra (27)
- isInterState: false (not shown in UI, but in API response)
- CGST amount = half of total GST
- SGST amount = half of total GST
- IGST = 0

### Step 3c: Print the invoice

**Click** the Print button on the invoice detail page.

**Verify the printed invoice shows:**
- Your company GSTIN prominently at the top
- HSN/SAC column in line items
- Tax Rate column (5%, 12%)
- Tax Amount column per line
- Subtotal → CGST → SGST → Total breakdown (not single "Tax" line)
- HSN summary table at the bottom (groups by HSN code with tax totals)
- "Supply Type: Intra-State"
- "Reverse Charge: No"

---

## Test 4: Inter-State Invoice (IGST)

**Scenario:** You're selling to a distributor in Karnataka (different state).

### Step 4a: Create customer

| Field | Value |
|-------|-------|
| Name | Bangalore Dairy Hub |
| Type | B2B |
| GSTIN | 29AADCB9876H1Z5 |
| State | Karnataka |
| City | Bangalore |

### Step 4b: Create invoice

| Description | HSN/SAC | Qty | Unit Price | Tax Category | GST Rate |
|-------------|---------|-----|------------|--------------|----------|
| Full Cream Milk (500ml x 24) | 0402 | 200 | 250.00 | Taxable | 5% |
| Butter (100g x 20) | 0405 | 100 | 150.00 | Taxable | 12% |

**Verify:**
- IGST = total GST (full rate, not split)
- CGST = 0, SGST = 0
- Place of Supply: Karnataka (29)
- Printed invoice shows IGST column instead of CGST/SGST

---

## Test 5: Exempt / Nil-Rated Invoice

**Scenario:** You're selling raw milk (unpackaged) which is GST exempt.

Create an invoice for Fresh Dairy Mart with:

| Description | HSN/SAC | Qty | Unit Price | Tax Category | GST Rate |
|-------------|---------|-----|------------|--------------|----------|
| Raw Milk (bulk, per litre) | 0401 | 500 | 45.00 | Exempt | 0% |

**Verify:**
- All tax amounts = 0
- Total = Subtotal (₹22,500)
- GST rate dropdown should be disabled when "Exempt" is selected

---

## Test 6: Purchase Invoice with TDS

**Scenario:** You hire a CA firm for GST audit. TDS u/s 194J applies at 10%.

### Step 6a: Create vendor

**Go to:** AP → Vendors → New Vendor

| Field | Value |
|-------|-------|
| Name | Sharma & Associates (CA Firm) |
| GSTIN | 27AADCS4567F1Z9 |
| State | Maharashtra |
| Category | Service Provider |

### Step 6b: Create bill

**Go to:** AP → Bills → New Bill

| Field | Value |
|-------|-------|
| Vendor | Sharma & Associates |
| Invoice Number | SA/2026/0042 |
| Invoice Date | Today |
| Due Date | 15 days from today |

**Line Items:**

| Item Name | HSN/SAC | Qty | Unit Price | Tax Category | GST Rate | TDS Section | TDS % |
|-----------|---------|-----|------------|--------------|----------|-------------|-------|
| GST Audit FY 2025-26 | 998221 | 1 | 75,000 | Taxable | 18% | 194J | 10 |
| Monthly Bookkeeping (3 months) | 998222 | 3 | 15,000 | Taxable | 18% | 194J | 10 |

**Verify:**
- Subtotal: ₹1,20,000 (75,000 + 45,000)
- GST: ₹21,600 (13,500 + 8,100)
- Total: ₹1,41,600
- TDS deductible shown: ₹12,000 (10% of 1,20,000)
- CGST = ₹10,800, SGST = ₹10,800 (intra-state)
- TDS section = 194J on the bill

---

## Test 7: Mixed Tax Categories in One Invoice

**Scenario:** Invoice with taxable + exempt items in the same invoice.

Create an invoice for Fresh Dairy Mart:

| Description | HSN/SAC | Qty | Unit Price | Tax Category | GST Rate |
|-------------|---------|-----|------------|--------------|----------|
| Raw Milk (bulk) | 0401 | 200 | 45.00 | Exempt | 0% |
| Flavoured Milk (200ml x 12) | 2202 | 50 | 120.00 | Taxable | 28% |
| Curd (200g x 12) | 0406 | 30 | 180.00 | Taxable | 12% |

**Verify:**
- Raw milk line: zero tax
- Flavoured milk line: 28% tax calculated
- Curd line: 12% tax calculated
- Summary shows correct total GST (only from taxable items)
- Printed invoice HSN summary table groups all 3 codes separately

---

## Test 8: GSTIN Verification

**Test via API** (use browser console or curl):

```bash
# Valid GSTIN
curl -X POST http://localhost:3003/api/v1/ar/customers/verify-gstin \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gstin": "27AABCV1234F1ZM"}'

# Invalid format
curl -X POST http://localhost:3003/api/v1/ar/customers/verify-gstin \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gstin": "99INVALID0000X"}'
```

**Verify:**
- Valid GSTIN returns `checksum: "valid"`
- Invalid returns an error message
- If `GSTIN_API_KEY` env is set, valid GSTIN also returns `legalName`, `tradeName`, `status`

---

## Test 9: Document Attachments

**Test via API** (file upload requires multipart, not available in standard forms yet):

```bash
# Upload a file to an invoice
curl -X POST http://localhost:3003/api/v1/common/attachments/sales_invoice/INVOICE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/sample-invoice.pdf"

# List attachments
curl http://localhost:3003/api/v1/common/attachments/sales_invoice/INVOICE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Download
curl http://localhost:3003/api/v1/common/attachments/ATTACHMENT_ID/download \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o downloaded.pdf
```

**Verify:**
- Upload accepts PDF, PNG, JPG, XLSX, CSV (max 10MB)
- List returns the uploaded file with fileName, fileSize, mimeType
- Download returns the actual file
- Delete removes the file

---

## Test 10: Recurring Invoices

**Scenario:** Fresh Dairy Mart has a monthly standing order for milk supply.

**Test via API:**

```bash
# Create recurring template
curl -X POST http://localhost:3003/api/v1/ar/recurring \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "FRESH_DAIRY_CUSTOMER_ID",
    "frequency": "monthly",
    "dayOfMonth": 1,
    "startDate": "2026-04-01",
    "autoSend": false,
    "items": [
      {
        "description": "Monthly Milk Supply (Full Cream 500ml x 24)",
        "quantity": 200,
        "unitPrice": 250,
        "amount": 50000,
        "hsnSacCode": "0402",
        "taxRate": 5,
        "taxCategory": "taxable"
      },
      {
        "description": "Monthly Curd Supply (200g x 12)",
        "quantity": 100,
        "unitPrice": 180,
        "amount": 18000,
        "hsnSacCode": "0406",
        "taxRate": 12,
        "taxCategory": "taxable"
      }
    ]
  }'
```

**Verify:**
- Template created with status "active", nextRunDate = "2026-04-01"
- `POST /ar/recurring/generate` — should return `generated: 0` (next run is in the future)
- Pause: `POST /ar/recurring/{id}/pause` → status changes to "paused"
- Resume: `POST /ar/recurring/{id}/resume` → status changes to "active"
- List: `GET /ar/recurring` → shows your template with customerName

---

## Test 11: WhatsApp Channel

**Scenario:** Send an invoice via WhatsApp instead of email.

This requires Gupshup config (env vars). Without it, the feature silently no-ops.

**To test the channel selector:**

```bash
# Send via email (default)
curl -X POST http://localhost:3003/api/v1/ar/invoices/INVOICE_ID/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "email", "sendEmail": true}'

# Send via WhatsApp (needs GUPSHUP_API_KEY)
curl -X POST http://localhost:3003/api/v1/ar/invoices/INVOICE_ID/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "whatsapp"}'
```

**Verify:**
- Both channels accepted without error
- Invoice status changes to "sent"
- Email: check inbox if SMTP is configured
- WhatsApp: works only with Gupshup env vars set

**To enable WhatsApp in production, add to `.env`:**
```
WHATSAPP_PROVIDER=gupshup
GUPSHUP_API_KEY=your_key
GUPSHUP_APP_NAME=your_app
GUPSHUP_SOURCE_NUMBER=your_registered_number
```

---

## Test 12: Tally Export with GST

**Scenario:** Export March 2026 data to Tally with proper GST breakdown.

```bash
# Export vouchers
curl http://localhost:3003/api/v1/tally/export?dateFrom=2026-03-01&dateTo=2026-03-31 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o march-vouchers.xml

# Export ledger masters
curl http://localhost:3003/api/v1/tally/ledgers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o ledger-masters.xml
```

**Open `march-vouchers.xml` and verify:**
- Sales vouchers show separate ledger entries for:
  - Customer (debit)
  - Sales Account (credit — subtotal only)
  - Output CGST (credit) — for intra-state invoices
  - Output SGST (credit) — for intra-state invoices
  - Output IGST (credit) — for inter-state invoices
- Purchase vouchers (if any approved) show:
  - Purchase Account (debit — subtotal)
  - Input CGST / Input SGST / Input IGST (debit)
  - TDS Payable (credit) — if TDS applies
  - Vendor (credit — total)

**Open `ledger-masters.xml` and verify:**
- Includes GST ledgers: Output CGST, Output SGST, Output IGST, Input CGST, Input SGST, Input IGST
- Includes TDS Payable under "Duties & Taxes"
- Customer and vendor ledgers present

**Import into Tally Prime:**
1. Open Tally Prime → Import Data
2. Select the XML file
3. Verify vouchers appear with correct tax breakdown

---

## Quick Checklist

| # | Test | Pass? |
|---|------|-------|
| 1 | Company GST profile saves and persists | |
| 2 | HSN/SAC search works (by code + description) | |
| 3 | Intra-state invoice → CGST + SGST split | |
| 4 | Inter-state invoice → IGST only | |
| 5 | Exempt item → zero tax | |
| 6 | Purchase invoice with TDS deduction | |
| 7 | Mixed tax categories in one invoice | |
| 8 | GSTIN format validation | |
| 9 | Document attachment upload/download/delete | |
| 10 | Recurring invoice create/pause/resume/generate | |
| 11 | WhatsApp channel accepted in send | |
| 12 | Tally export has GST ledger entries | |
