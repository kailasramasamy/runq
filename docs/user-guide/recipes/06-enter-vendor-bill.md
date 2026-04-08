# Recipe 06 — Enter a vendor bill

> **Time:** 1 minute (with AI extraction) or 3–5 minutes (manual) · **You'll need:** the vendor's bill (PDF/photo or paper)
> **Do this:** every time a vendor sends you a bill.

A "bill" in runQ is what you owe a vendor. Until you enter it, runQ has no idea you owe anyone — so your AP dashboard, due-this-week alerts, and Tally export will all be wrong. Make this a habit.

---

## Before you start

Make sure:
- ✅ The vendor is [added](./05-add-vendor.md)
- ✅ You have the bill in front of you (PDF, photo, or paper)

---

## The fastest way: AI extraction

If you have a PDF or a phone photo of the bill, use AI extraction.

### 1. Open the New Bill page

In the left sidebar, click **AP → Bills**, then click **+ New Bill** at the top right.

### 2. Click "Extract from Invoice"

At the top right of the form, click the **✨ Extract from Invoice** button.

### 3. Upload the file

A dialog opens. Drag and drop the PDF or photo, or click to browse. Wait 5–10 seconds while runQ's AI reads it.

### 4. Review the extracted data

runQ pre-fills:
- The vendor (matched against your vendor master)
- Invoice number, invoice date, due date
- Every line item — with description, HSN, quantity, unit price, GST rate
- TDS section, if it can detect one

**Always glance over each field.** AI extraction is good but not perfect — phone photos with shadows, blurry digits, or unusual layouts can produce small errors.

### 5. Save

Once you've verified, click **Save Bill** at the bottom right.

---

## The manual way

If you don't have a digital file (paper bill, or AI extraction failed), enter it by hand. Same form, just no auto-fill.

### 1. Open the New Bill page

**AP → Bills → + New Bill**

### 2. Bill Info

| Field | Example | Notes |
|---|---|---|
| **Vendor** | Search and pick | Must already be added. |
| **Invoice Number** | `CD/2425/8821` | The vendor's invoice number, *not* runQ's. ⚠ Required — and runQ will warn you if a duplicate already exists for this vendor. |
| **Invoice Date** | `2026-04-08` | The date on the vendor's invoice. |
| **Due Date** | `2026-05-08` | Auto-fills based on the vendor's payment terms. Override if their terms differ. |

> ⚠ **Duplicate detection:** runQ checks for duplicate bills (same vendor + same invoice number, or same vendor + similar amount + similar date) and shows a yellow warning. If it's a true duplicate, **don't save it** — find the existing bill instead.

### 3. Line items

Add a row per item on the bill. Click **+ Add Row** to add more.

| Column | What to enter |
|---|---|
| **Item** | Search your item master, or leave blank and type into description |
| **HSN/SAC** | Auto-fills from item, or search the HSN database |
| **SKU** | Optional |
| **Qty** | e.g. `100` |
| **Unit Price** | Excluding GST |
| **Amount** | Calculated automatically |
| **Tax Category** | **Taxable** for normal purchases. Use **Reverse Charge** for RCM. |
| **GST Rate** | Auto-fills from HSN, or pick from the dropdown |
| **TDS Section** | Pick a section if you need to deduct TDS — see below |
| **TDS %** | Auto-fills based on section, but you can override |

#### TDS sections explained (in plain English)

| Section | Use for | Default rate |
|---|---|---|
| **194C — Contractor** | Job work, contracts | 1% (individual) / 2% (company) |
| **194J — Professional/Technical** | CAs, consultants, lawyers, engineers | 10% |
| **194H — Commission** | Sales commissions, brokerage | 5% |
| **194I — Rent** | Office/warehouse rent | 10% |
| **194A — Interest** | Interest on loans (non-bank) | 10% |
| **194Q — Purchase of Goods** | Purchases from a single vendor exceeding ₹50L/year | 0.1% |

> 💡 **Don't deduct TDS on goods bills under section 194Q unless you're sure** the threshold (₹50 lakh in a financial year from one vendor) has been crossed. When in doubt, ask your CA.

### 4. Check the Summary

The **Summary** card shows:
- **Subtotal** — sum of line amounts
- **GST** — auto-calculated
- **TDS deductible** — shown in amber if any line has TDS, with a minus sign
- **Total** — what you owe the vendor (Subtotal + GST). The TDS is what you'll *withhold* when paying — so the actual cash outflow is `Total - TDS`.

### 5. Save

Click **Save Bill** at the bottom right.

The bill goes into your AP queue with status **Approved**. It now appears on:
- The **AP → Bills** list
- The dashboard (under "Money you owe vendors")
- The **Due This Week** filter (if it's due soon)
- The **Reports → Cash Flow Forecast**

---

## Attaching the original bill (recommended)

After saving, on the bill detail page, click **+ Attach Document** to upload the original PDF or photo. This is great for:
- Audits — your CA can pull up the source bill from runQ in seconds
- Disputes — proof of what you actually got billed
- Your own future reference

---

## Common gotchas

- **AI extraction wrong on quantities/amounts:** always glance at line totals against the bill PDF. AI is fast, not infallible.
- **Forgetting the vendor's invoice number:** required. If the vendor didn't put one, ask for one — it's part of GST compliance for them.
- **Wrong TDS section:** picking the wrong section means wrong TDS deducted means a TDS return correction later. When in doubt, leave TDS blank and ask your CA.
- **Bill date in a closed period:** if your CA has already filed GST for the prior month, don't backdate a bill into that month. Talk to them first.

---

## What's next

- [Recipe 07 — Pay a vendor bill →](./07-pay-vendor-bill.md)
