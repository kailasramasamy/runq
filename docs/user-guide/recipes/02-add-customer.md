# Recipe 02 — Add a customer

> **Time:** 2 minutes · **You'll need:** customer name, GSTIN (for B2B), state, contact details
> **Do this:** before raising your first invoice to any new customer.

A "customer" in runQ is anyone you sell to and need to track outstanding balances for. Once added, they appear in dropdowns on invoices, receipts, and reports.

---

## Steps

### 1. Open the New Customer page

In the left sidebar, click **AR → Customers**, then click the **+ New Customer** button at the top right.

### 2. Fill in Basic Info

| Field | Required? | Example | Notes |
|---|---|---|---|
| **Customer Name** | Yes | `Deshmukh Electricals Pvt Ltd` | Use the legal/registered name — it appears on invoices and the Tally export. |
| **Type** | Yes | **B2B** | Pick "B2B" for almost all customers. "Payment Gateway" is only for Razorpay/Cashfree settlement entities. |
| **Contact Person** | No | `Rajesh Deshmukh` | The human you actually deal with. |
| **Email** | No | `rajesh@deshmukhelec.com` | Used for emailed invoices and reminders. |
| **Phone** | No | `+91 98765 43210` | Used for WhatsApp invoice delivery. Include the country code. |

### 3. Fill in Tax Info

| Field | When to fill | Example |
|---|---|---|
| **GSTIN** | If they're GST-registered (most B2B) | `27AAPFU0939F1ZV` |
| **PAN** | If you have it | `AAPFU0939F` |

> 💡 **You don't strictly need a GSTIN to save the customer.** But without one, you can't issue them a GST-compliant invoice — you can only issue a *bill of supply*. For most B2B customers, get the GSTIN.

### 4. Fill in Address

| Field | Example | Notes |
|---|---|---|
| **Address Line 1** | `Plot 14, Sector 5` | |
| **Address Line 2** | `Industrial Area` | Optional |
| **City** | `Mumbai` | |
| **State** | `Maharashtra` | ⚠ **Critical** — this decides inter-state vs intra-state tax. Must match the first 2 digits of their GSTIN. |
| **Pincode** | `400001` | |

> ⚠ **State must match the GSTIN.** A GSTIN starting with `27` is Maharashtra; `29` is Karnataka; `33` is Tamil Nadu, etc. If you enter a Karnataka GSTIN but pick Maharashtra as the state, runQ will charge intra-state tax (CGST+SGST) when it should charge IGST.

### 5. Set Payment Terms

| Field | What to pick | Why |
|---|---|---|
| **Payment Terms** | **Net 30** (or whatever you've agreed) | This auto-fills the due date when you raise an invoice for this customer. |
| **Credit Limit (₹)** | Optional, e.g. `500000` | runQ will warn you when raising an invoice that would push their outstanding above this limit. |

### 6. Save

Click **Save Customer** at the bottom right.

You'll be redirected to the customer list, with your new customer at the top.

---

## How to verify it worked

1. Go to **AR → Invoices → New Invoice**.
2. Click the **Customer** dropdown.
3. Type the first few letters of your new customer's name.
4. They should appear. Pick them.
5. The invoice form should now show their default payment terms (the due date should auto-fill based on Net 30 or whatever you set).

---

## Common gotchas

- **Wrong state vs GSTIN:** the most common mistake. Always double-check.
- **Phone number without country code:** WhatsApp delivery won't work. Always start with `+91`.
- **Forgetting to set credit limit:** if you have customers who routinely max out their dues, set a credit limit to get warned automatically.

---

## What's next

- [Recipe 03 — Create a sales invoice →](./03-create-invoice.md)
