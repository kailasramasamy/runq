# Recipe 03 — Create a sales invoice

> **Time:** 2–3 minutes · **You'll need:** the customer (must be added first), and what you're selling them
> **Do this:** every time you sell goods or services.

This is the most common task you'll do in runQ. Once you've done it twice, it'll feel second-nature.

---

## Before you start

Make sure:
- ✅ You've [set up your company](./01-setup-company.md) — invoice numbering and tax depend on this
- ✅ The customer is [added](./02-add-customer.md)
- ✅ (Optional but very useful) Your products/services are in **Masters → Items**, so HSN codes and GST rates auto-fill

---

## Steps

### 1. Open the New Invoice page

In the left sidebar, click **AR → Invoices**, then click the **+ New Invoice** button at the top right.

### 2. Fill in Invoice Info

| Field | Notes |
|---|---|
| **Customer** | Type to search. Picks the customer you've already added. |
| **Invoice Number** | Auto-generated when you save — e.g. `PT/25-26/0142`. You can't edit this; the format is set in **Settings → Invoice Numbering**. |
| **Invoice Date** | Today, by default. Change if backdating. |
| **Due Date** | Auto-fills based on the customer's payment terms (Net 30, Net 15, etc.). Change if needed. |

### 3. Add line items

Each row is one product or service. Click **+ Add Row** at the bottom of the line items table to add more.

For each line:

| Column | What to enter | How runQ helps |
|---|---|---|
| **Item** | Search by name or SKU | If you've set up **Masters → Items**, picking an item auto-fills description, HSN, unit price, and GST rate. |
| **Description** | Auto-filled from item, or type freely | What appears on the invoice. |
| **HSN/SAC** | Auto-filled from item, or search | The HSN code is required for goods over ₹5 crore turnover; SAC for services. Searching opens a master with auto GST rate suggestion. |
| **Qty** | e.g. `5` | |
| **Unit Price** | e.g. `1200.00` | Excluding GST. |
| **Amount** | Calculated automatically | Qty × Unit Price |
| **Tax Category** | **Taxable** for normal sales; **Exempt / Nil Rated / Zero Rated** for the rare case | "Zero Rated" = exports. "Nil Rated" = items GST-rated at 0%. |
| **GST Rate** | Auto-filled from HSN, or pick from `0% / 5% / 12% / 18% / 28%` | |

> 💡 **Use the Item Master.** Setting up your products once in **Masters → Items** means HSN, GST rate, and price auto-fill on every future invoice. It eliminates 90% of typing.

### 4. Check the Summary

The **Summary** card on the right shows:

- **Subtotal:** total of all line amounts
- **GST (auto-calculated):** total tax across all lines
- **Total:** what the customer owes

If your customer is in **the same state** as you, GST will split as CGST+SGST on the final invoice. If they're in a **different state**, it'll show as IGST. (You don't see this split here — only on the saved invoice.)

### 5. Add notes (optional)

The **Notes** section is for things you want printed on the invoice — like "Goods once sold cannot be returned" or "Payment due within 15 days".

### 6. Save

Click **Save Invoice** at the bottom right.

You're taken to the **Invoice Detail** page, where you'll see:
- The auto-generated invoice number
- A **PDF Preview** button
- A **WhatsApp** button to send the PDF directly
- A **UPI** link (if you set up UPI in [Recipe 01](./01-setup-company.md))
- A **Record Payment** button (use this when the customer pays — see [Recipe 04](./04-record-customer-payment.md))

---

## Sending the invoice to the customer

You have three options from the Invoice Detail page:

1. **Download PDF** — get the file, send it however you like.
2. **WhatsApp** — opens a dialog to pick the customer's number, sends the PDF + UPI pay link.
3. **Email** — sends the PDF as an attachment to the customer's email.

Most runQ users send by **WhatsApp** for the speed, and by **Email** for formal customers who want it on record.

---

## Common gotchas

- **Forgot to add the item to Masters first** → you have to type description, HSN, and GST manually each time. Slow. Add it once.
- **Wrong tax category** → if you pick "Exempt", no GST is added. Useful for nil-rated goods, but a common mistake when you really wanted "Taxable".
- **Inter-state vs intra-state confusion** → tax type is decided by *your state* (Settings → Company) vs *customer state* (Customer Detail). Both must be correct.
- **Backdated invoice date** → if you backdate to a previous month that's already been GST-filed by your CA, you'll create a mess. Don't backdate across filing periods.

---

## What's next

- [Recipe 04 — Record a customer payment →](./04-record-customer-payment.md)
- [Recipe 11 — Export to Tally](./11-export-to-tally.md) (when your CA needs the data)
