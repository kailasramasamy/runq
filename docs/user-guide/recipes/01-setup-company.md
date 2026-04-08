# Recipe 01 — Set up your company

> **Time:** 5 minutes · **You'll need:** your GSTIN, company address, UPI ID (optional)
> **Do this:** once, on day 1, before raising any invoices.

This is the first thing you do in runQ. Your company details flow into every invoice, every Tally export, and every report — so it's worth getting right once.

---

## Why this matters

- Your **GSTIN** and **state** decide whether tax on each invoice is split as CGST+SGST (intra-state) or charged as IGST (inter-state). Wrong state = wrong tax = unhappy CA.
- Your **financial year start month** decides how invoice numbers reset (most Indian businesses use April).
- Your **UPI ID** appears as a "Pay Now" link on every invoice you send — customers love this.

---

## Steps

### 1. Open the Company Settings page

In the left sidebar, click **Settings → Company**.

You'll see three sections, top to bottom:

- **Company basics** — name, currency, financial year, default payment terms
- **GST Profile** — GSTIN, legal name, state, address
- **UPI Collection** — your business UPI ID

### 2. Confirm the basics

The **Company Name** and **Currency** are locked (currency is always INR).

Set:

| Field | What to pick | Why |
|---|---|---|
| **Financial Year Start Month** | **April** | Standard for India. Don't change unless you have a non-standard FY. |
| **Default Payment Terms** | **Net 30 days** | The terms applied to new invoices and bills by default. You can override per customer or per invoice. |

Click **Save Changes**.

### 3. Fill in your GST Profile

This is the section that affects your invoices the most.

| Field | Example | Notes |
|---|---|---|
| **GSTIN** | `27AABCU9603R1ZM` | Your 15-character GST registration number. Auto-uppercases as you type. |
| **Legal / Trade Name** | `Patil Trading Company` | The name your CA uses on filings. May or may not match the trading name. |
| **State** | `Maharashtra` | Pick from the dropdown. ⚠ **Critical** — this controls inter-state vs intra-state tax. |
| **Address Line 1** | `Shop 12, Ground Floor, Laxmi Plaza` | Building / street. |
| **Address Line 2** | `Near FC Road, Shivajinagar` | Area / landmark. |
| **City** | `Pune` | |
| **Pincode** | `411005` | 6 digits. |

Click **Save Changes**.

> ⚠ **Pincode and GSTIN matter.** If you enter a Maharashtra GSTIN but pick a Tamil Nadu state, runQ will calculate IGST on a sale to a Maharashtra customer instead of CGST+SGST. Get this right.

### 4. Add your UPI ID (optional but recommended)

In the **UPI Collection** section, type your business UPI ID — for example `patiltrading@hdfcbank` or `patilco@okicici`.

Click **Save Changes**.

From now on, every invoice you send will include a **Pay via UPI** link. Customers tap, the UPI app opens with the amount pre-filled, and they pay in two taps. You'll see most B2B customers prefer this over filling in NEFT details manually.

---

## How to verify it worked

1. Go to **AR → Invoices → New Invoice**.
2. Pick any customer in Maharashtra.
3. Add a line item.
4. Look at the tax in the summary — it should split as **CGST + SGST**, not IGST.
5. Now pick a customer in any other state. The tax should switch to **IGST**.

If the tax type is wrong, double-check your state in **Settings → Company**.

---

## What's next

- [Recipe 02 — Add your first customer →](./02-add-customer.md)
