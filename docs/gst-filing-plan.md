# GST Filing Module — Implementation Plan

## Overview

Add GSTR-1 and GSTR-3B filing capabilities to runq, eliminating the need for a separate CA firm fee for monthly GST filing. The module integrates with GSTN via a licensed GSP (GST Suvidha Provider) and automates classification, aggregation, reconciliation, and filing.

## Current State

The codebase is ~90% ready. Already built:
- GST calculator with CGST/SGST/IGST/Cess (`apps/api/src/utils/gst-calculator.ts`)
- HSN/SAC master with codes seeded (`packages/db/src/schema/masters/hsn-sac.ts`)
- Place of supply determination (inter/intra state)
- GSTIN validation + API lookup (`apps/api/src/utils/gstin-lookup.ts`)
- All tax fields on sales invoices, purchase invoices, credit/debit notes
- IRN/QR code placeholder fields on invoices (`irnNumber`, `irnDate`)
- Reverse charge flag, tax categories (taxable, exempt, nil_rated, zero_rated, reverse_charge)
- GST types defined (`packages/types/src/common/gst.ts`)

**Missing:** Filing pipeline — classification engine, GSP integration, return generation, filing UI.

---

## Architecture Decision: GSP Partner

GSTN does not expose APIs directly. All access goes through licensed GSPs.

| Option | Pros | Cons |
|--------|------|------|
| **Masters India** | Developer-friendly, sandbox available, cheaper (Rs 2-8K/GSTIN/yr), good REST APIs | Smaller market share |
| **ClearTax (Clear)** | Largest market share, most docs, reliable | More expensive (Rs 5-15K/GSTIN/yr), enterprise-oriented |

**Decision: Masters India** for MVP — cheaper, startup-friendly. Add ClearTax later as second option.

### Authentication Model
1. Register with GSP as ASP partner → get API credentials (client ID, secret)
2. Each tenant provides GSTIN + authenticates via OTP (sent to their registered mobile by GSTN)
3. Exchange OTP for auth token (valid 6-24 hours)
4. Filing requires EVC (OTP) or DSC (Digital Signature Certificate). SMEs use EVC.

---

## Phase 1: GSTR-1 Generation & Filing (~2-3 weeks)

### 1.1 DB Schema

New tables:

```sql
-- GST return tracking
gst_returns:
  id UUID PK
  tenant_id UUID FK
  gstin VARCHAR(15)
  return_type ENUM('GSTR1', 'GSTR3B')
  period VARCHAR(6)          -- MMYYYY format
  filing_frequency ENUM('monthly', 'quarterly')
  status ENUM('draft', 'generated', 'validated', 'uploaded', 'filed', 'error')
  data JSONB                 -- full return payload (all sections)
  error_details JSONB        -- validation/upload errors
  filed_at TIMESTAMPTZ
  filed_by UUID FK
  arn VARCHAR(50)            -- acknowledgement reference number from GSTN
  created_at, updated_at

-- Linking invoices to returns
gst_return_invoices:
  id UUID PK
  gst_return_id UUID FK
  invoice_id UUID            -- sales_invoice or credit_note id
  invoice_type ENUM('sales_invoice', 'credit_note', 'debit_note')
  section ENUM('B2B', 'B2CS', 'B2CL', 'EXP', 'CDN', 'NIL')
  included BOOLEAN DEFAULT true
  amendment_of UUID          -- points to original return if this is an amendment

-- GSP auth tokens (cached per tenant)
gsp_auth_tokens:
  id UUID PK
  tenant_id UUID FK
  gstin VARCHAR(15)
  gsp_provider VARCHAR(50)
  access_token TEXT (encrypted)
  expires_at TIMESTAMPTZ
  created_at
```

### 1.2 Invoice Classification Engine

Auto-classify every sales invoice into GSTR-1 sections:

| Condition | Section | Table |
|-----------|---------|-------|
| Buyer has GSTIN | **B2B** | 4A |
| No GSTIN + inter-state + value > Rs 2.5L | **B2CL** | 5A |
| No GSTIN + (intra-state OR value ≤ Rs 2.5L) | **B2CS** | 7 |
| Export invoice | **EXP** | 6A |
| Credit/debit note to registered dealer | **CDN** | 9B |
| Nil-rated / exempt supplies | **NIL** | 8 |

All data points needed already exist on `sales_invoices` + `sales_invoice_items`.

### 1.3 GSTR-1 Section Data Formats

**B2B (Table 4A)** — per invoice:
- Buyer GSTIN, invoice number (max 16 chars), invoice date (DD-MM-YYYY)
- Invoice value (total incl. tax), place of supply (2-digit state code)
- Reverse charge (Y/N), invoice type (Regular/SEZ/Deemed Export)
- Items: taxable_value, IGST/CGST/SGST/Cess amounts, GST rate

**B2CS (Table 7)** — aggregated per rate per place of supply:
- Place of supply, supply type (INTRA/INTER), GST rate
- Taxable value, IGST/CGST/SGST/Cess amounts

**B2CL (Table 5A)** — per invoice (inter-state > Rs 2.5L to unregistered):
- Invoice number, date, value, place of supply, rate, taxable value, IGST

**CDN (Table 9B)** — credit/debit notes:
- Original invoice ref, note number, date, value, buyer GSTIN, tax amounts

**EXP (Table 6A)** — exports:
- Invoice number, date, value, port code, shipping bill, with/without payment

**HSN Summary (Table 12)** — aggregated from line items:
- HSN code (min 4 digits), description, UQC, quantity, taxable value, tax amounts

**Document Summary (Table 13)** — from invoice sequences:
- Document type, from/to serial, total issued, cancelled, net issued

### 1.4 GSP Client Interface

Abstract behind an interface for provider-swappability:

```typescript
interface GspClient {
  // Auth
  authenticate(gstin: string, username: string): Promise<OtpChallenge>
  verifyOtp(gstin: string, otp: string): Promise<AuthToken>
  refreshToken(token: AuthToken): Promise<AuthToken>

  // GSTR-1
  uploadGSTR1(token: AuthToken, period: string, sections: GSTR1Sections): Promise<UploadResult>
  getGSTR1Summary(token: AuthToken, period: string): Promise<GSTR1Summary>
  fileGSTR1(token: AuthToken, period: string, evc: string): Promise<FilingResult>

  // GSTR-3B
  getAutoPopulated3B(token: AuthToken, period: string): Promise<GSTR3BData>
  saveGSTR3B(token: AuthToken, period: string, data: GSTR3BData): Promise<SaveResult>
  fileGSTR3B(token: AuthToken, period: string, evc: string): Promise<FilingResult>

  // GSTR-2B
  getGSTR2B(token: AuthToken, period: string): Promise<GSTR2BData>
}
```

Implement `MastersIndiaGspClient` first, `ClearTaxGspClient` later.

### 1.5 API Endpoints

```
POST   /api/v1/gst/returns/generate          -- generate draft from invoices
GET    /api/v1/gst/returns/:id                -- get return with all sections
GET    /api/v1/gst/returns/:id/section/:name  -- get specific section detail
PUT    /api/v1/gst/returns/:id                -- update/edit return data
POST   /api/v1/gst/returns/:id/validate       -- pre-flight validation
POST   /api/v1/gst/auth/request-otp          -- initiate GSP auth
POST   /api/v1/gst/auth/verify-otp           -- exchange OTP for token
POST   /api/v1/gst/returns/:id/upload         -- upload to GSTN via GSP
GET    /api/v1/gst/returns/:id/summary        -- pull summary from GSTN
POST   /api/v1/gst/returns/:id/file           -- file with EVC
GET    /api/v1/gst/returns                    -- list returns (with filters)
```

### 1.6 Frontend — GSTR-1 Filing Wizard

New route: `/gst/returns`

**Step-by-step flow:**
1. **Select period** (month/quarter) → system generates draft from invoices
2. **Review by section** — tabbed view: B2B | B2CS | B2CL | CDN | EXP | HSN | Docs
   - Each tab shows invoice-level detail with amounts
   - Highlight issues (missing GSTIN, missing HSN, rate mismatches)
   - Allow exclude/include toggle per invoice
3. **Validate** — pre-flight checks, show errors/warnings
4. **Authenticate** — GSTIN + OTP modal (cache token for session)
5. **Upload** — section-by-section progress indicator
6. **Review summary** — side-by-side: your data vs GSTN summary
7. **File** — EVC (OTP) → show ARN on success

### 1.7 Validation Rules (Pre-flight)

- Every B2B invoice must have valid buyer GSTIN
- Every line item must have HSN/SAC code (min 4 digits)
- Invoice numbers: max 16 chars, alphanumeric + `-` `/`
- Tax rates must be valid: 0, 0.25, 3, 5, 12, 18, 28
- Place of supply must be set on every invoice
- No future-dated invoices beyond the return period
- Reverse charge invoices must have correct tax treatment
- Total taxable value + tax must equal invoice value

---

## Phase 2: GSTR-3B Generation & Filing (~1 week)

### 2.1 Auto-generate from GSTR-1 + Purchase Data

| 3B Table | Source | Description |
|----------|--------|-------------|
| 3.1 | GSTR-1 data | Outward supplies: inter-state, intra-state, zero-rated, nil/exempt |
| 3.2 | B2CS/B2CL data | Inter-state supplies to unregistered (by place of supply) |
| 4 | GSTR-2B + purchase_invoices | ITC: imports, reverse charge, ISD, all other. Reversed + net. |
| 5 | Purchase invoices (exempt) | Exempt, nil, non-GST inward supplies |
| 5.1 | Computed | Interest (if late) and late fee |
| 6.1 | Computed | Tax payable, ITC utilization order, cash to pay |

### 2.2 ITC Utilization Order (Rule 88A)

Mandatory order for IGST credit utilization:
1. IGST credit → IGST liability
2. IGST credit → CGST liability
3. IGST credit → SGST liability
4. CGST credit → CGST liability
5. CGST credit → IGST liability
6. SGST credit → SGST liability
7. SGST credit → IGST liability

System auto-computes optimal utilization.

### 2.3 AI-Assisted Features

- Flag ITC in books but NOT in GSTR-2B (supplier hasn't filed — generate follow-up list)
- Identify potential ITC reversals needed (Rule 42/43 for mixed-use)
- Natural language explanation of each 3B line item for non-CA accountants
- Smart suggestions for reverse charge entries that might be missed

### 2.4 Frontend — GSTR-3B Workflow

Simpler than GSTR-1 (6 summary tables):
1. **Generate** — auto-compute from GSTR-1 + 2B + purchase register
2. **Review** — form-based, each table editable, auto-populated values shown
3. **Compare** — side-by-side with GSTN auto-populated values (highlight diffs)
4. **Compute liability** — show tax payable, ITC used, cash balance needed
5. **File** — EVC (OTP) → ARN

---

## Phase 3: GSTR-2B Reconciliation (~1 week)

### 3.1 Pull & Store GSTR-2B

- Fetch via GSP API monthly (available 14th of following month)
- Store in `gst_2b_data` table (JSONB) for historical comparison
- Auto-trigger pull via scheduler or manual

### 3.2 Matching Engine

Match `purchase_invoices` against GSTR-2B entries:

**Match keys:** Supplier GSTIN + invoice number + invoice date + taxable value (±Rs 2 tolerance)

**Match statuses:**
| Status | Meaning | Action |
|--------|---------|--------|
| Matched | Perfect match | Claim ITC |
| Mismatched | Values differ | Investigate, show diff |
| In 2B, not in books | Supplier reported, you haven't booked | Check if legitimate purchase |
| In books, not in 2B | You booked, supplier hasn't reported | Follow up with supplier |

### 3.3 AI-Assisted Reconciliation

- Fuzzy match invoice numbers (INV-001 vs INV/001 vs 001)
- Suggest which "not in books" entries might correspond to unbooked purchases
- Generate follow-up emails/messages to vendors whose invoices aren't in 2B
- Summarize reconciliation status in plain language

### 3.4 Frontend — Reconciliation Dashboard

- Summary cards: matched count/value, mismatched, missing from 2B, missing from books
- Filterable table with match status
- Side-by-side diff view for mismatches
- Bulk actions: mark as matched, create purchase invoice from 2B entry
- Export reconciliation report (CSV/PDF)

---

## Phase 4: E-Invoicing (Optional, ~1 week)

For customers with turnover > Rs 5 crore (mandatory threshold).

### 4.1 E-Invoice Generation

- Push invoice JSON to IRP (Invoice Registration Portal) via GSP
- Get back IRN (Invoice Reference Number) + signed QR code
- Store on invoice: `irnNumber`, `irnDate`, `irnStatus`, `signedQrCode`
- Print IRN + QR on invoice PDF

### 4.2 E-Invoice Cancellation

- Cancel within 24 hours of generation (GSTN rule)
- API call to IRP for cancellation
- Update invoice status

### 4.3 GSTR-1 Auto-Population Benefit

- E-invoiced B2B invoices auto-populate GSTR-1 — skip upload for these
- Only upload non-e-invoiced data (B2CS, nil/exempt, HSN summary, doc summary)
- Classification engine detects which invoices have IRN and excludes from B2B upload

### 4.4 Frontend

- Toggle in company settings: "Enable E-Invoicing" (with turnover threshold check)
- Auto-generate IRN on invoice finalization (or bulk generate)
- IRN status indicator on invoice list
- QR code display on invoice detail/PDF

---

## Key Gotchas

1. **OTP Relay UX** — GSTN sends OTP to taxpayer's registered mobile. UI needs smooth OTP input modal. Cache tokens (6-24hr validity).
2. **Amendment Handling** — Invoices amended after filing go into amendment tables (11A/11B) in next period's GSTR-1. Track original return linkage.
3. **QRMP Scheme** — Quarterly filers need IFF (Invoice Furnishing Facility) for months 1 & 2 of quarter. Detect from filing frequency setting.
4. **Advances** — Advance receipts and adjustments need separate handling. Build when needed.
5. **Multi-GSTIN** — Some businesses have multiple GSTINs (one per state). Support at tenant settings level.
6. **Rate Limits** — GSTN: ~50-100 requests/min per GSTIN. GSPs add their own. Batch uploads (500-1000 invoices/request).
7. **HSN Digit Requirements** — Min 4 digits for turnover ≤ Rs 5 crore, 6 digits for > Rs 5 crore (from Apr 2025).

---

## Effort Summary

| Phase | Scope | Effort | Value |
|-------|-------|--------|-------|
| 1 | GSTR-1 generation + filing | 2-3 weeks | Highest — monthly filing need |
| 2 | GSTR-3B generation + filing | 1 week | High — depends on Phase 1 |
| 3 | GSTR-2B reconciliation | 1 week | Medium — saves hours of manual matching |
| 4 | E-invoicing | 1 week | Low for now (only if customers need it) |

**Total: ~5-6 weeks for the complete GST filing module.**
