# Recipe 05 — Add a vendor

> **Time:** 2–3 minutes · **You'll need:** vendor name, GSTIN, bank details (for paying them), category
> **Do this:** before entering your first bill from any new vendor.

A "vendor" in runQ is anyone you buy from and pay — suppliers, service providers, utilities, landlord, etc. Once added, they appear in dropdowns on bills, payments, and reports.

---

## Steps

### 1. Open the New Vendor page

In the left sidebar, click **AP → Vendors**, then click **+ New Vendor** at the top right.

### 2. Fill in Basic Info

| Field | Required? | Example | Notes |
|---|---|---|---|
| **Vendor Name** | Yes | `Crompton Distributors Pvt Ltd` | Legal/trading name. Appears on bills and the Tally export. |
| **Email** | No | `accounts@crompton.com` | Used for sending PO confirmations. |
| **Phone** | No | `+91 98765 43210` | Include country code. |
| **Category** | Recommended | **Raw Material** | Picks the type of vendor — see table below. |
| **Expense Account** | Auto-suggested | `5001 — Raw Material Purchases` | The GL account that bills from this vendor will be posted to. |

#### Category options

| Category | Use for | Default expense account |
|---|---|---|
| **Raw Material** | Goods you buy to resell or process | 5001 — Raw Material Purchases |
| **Service Provider** | CAs, consultants, agencies | 5401 — Professional Charges |
| **Logistics** | Couriers, transport | 5701 — Freight & Forwarding |
| **Utilities** | Electricity, water, internet | 5302 — Utilities |
| **Equipment** | Computers, machinery (capex) | 5305 — Equipment |
| **Other** | Anything else | (no default — you pick) |

> 💡 **Why category matters:** when you enter a bill from this vendor later, runQ pre-selects the right expense account automatically. Less typing, fewer mistakes, cleaner books.

### 3. Tax & Compliance

| Field | When to fill | Example |
|---|---|---|
| **GSTIN** | If they're GST-registered | `27AAPFU0939F1ZV` |
| **PAN** | If you'll deduct TDS on payments to them | `AAPFU0939F` |

> ⚠ **PAN is mandatory for TDS deduction.** If you don't have their PAN, you must deduct TDS at the higher rate (20%). Always ask vendors for their PAN.

### 4. Address

| Field | Example | Notes |
|---|---|---|
| **Address Line 1** | `Building 4, Industrial Estate` | |
| **Address Line 2** | `MIDC Phase 2` | Optional |
| **City** | `Pune` | |
| **State** | `Maharashtra` | Decides inter-state vs intra-state tax on their bills. Must match GSTIN. |
| **Pincode** | `411019` | |

### 5. Bank Details (for paying them)

| Field | Example | Why |
|---|---|---|
| **Account Name** | `Crompton Distributors Pvt Ltd` | Beneficiary name as on their bank account. |
| **Account Number** | `01234567890123` | |
| **IFSC Code** | `HDFC0001234` | Auto-uppercases. |
| **Bank Name** | `HDFC Bank` | |

> 💡 You don't *need* bank details to save the vendor. But you can't use the **NEFT batch export** ([Recipe 07](./07-pay-vendor-bill.md)) to pay them in bulk without these. Add them upfront and save yourself hassle later.

### 6. Payment Terms

| Field | Example | Notes |
|---|---|---|
| **Payment Terms** | **Net 30** | Auto-fills the due date when you enter a bill from this vendor. |
| **Early Payment Discount %** | `2` (optional) | If they offer "2/10 Net 30" — i.e. 2% off for paying within 10 days. |
| **Discount If Paid Within (days)** | `10` | The window for the early payment discount. |

> 💡 **Early payment discounts are free money.** A 2% discount for paying 20 days early is equivalent to a ~36% annualised return. runQ surfaces these on the **Vendor Management → Early Discounts** dashboard. Always set them up if your vendor offers them.

### 7. Save

Click **Save Vendor** at the bottom right.

---

## How to verify it worked

1. Go to **AP → Bills → New Bill**.
2. Click the **Vendor** dropdown.
3. Type the first few letters of your new vendor's name.
4. They should appear. Pick them.

---

## Common gotchas

- **No bank details:** you can pay them one-off, but you can't use bulk NEFT batch payments. Always add bank details if you'll pay them more than once.
- **No PAN:** you'll have to deduct TDS at 20% instead of the lower section-specific rate. Always ask for the PAN.
- **Wrong category:** if you set them as "Service Provider" but they're actually selling you raw materials, the expense will post to the wrong GL account. Easy to fix later — just edit the vendor — but cleaner to get right the first time.

---

## What's next

- [Recipe 06 — Enter a vendor bill →](./06-enter-vendor-bill.md)
