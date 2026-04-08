# Recipe 10 — View AR aging (who owes you money)

> **Time:** 30 seconds · **You'll need:** nothing
> **Do this:** weekly. The number-one question every business owner asks: "who owes me money?"

The **AR aging** report (also called the *receivables aging report*) shows everyone who owes you money, broken down by how overdue they are. This is the single most useful report for cash collection.

---

## Where to find it

There are three places to see who owes you money — pick whichever fits the moment.

### Option A: The dashboard (the 5-second check)

Sidebar → **Dashboard**

The **Money customers owe me** card shows:
- Total outstanding (₹)
- Total overdue (₹) — in red
- Number of overdue invoices
- Top 5 overdue customers, sorted by amount

This is what you glance at every morning over coffee. If "Overdue" is creeping up, it's time to chase.

### Option B: The Collections page (the chase list)

Sidebar → **AR → Collections**

This is the dedicated chase-down screen. It shows:

- Every customer with at least one overdue invoice
- For each, the **total overdue**, the **oldest overdue date**, and **days overdue**
- A **Send Reminder** button next to each customer (sends a WhatsApp + email with all their overdue invoices)
- Filters: by aging bucket (1–30 / 31–60 / 61–90 / 90+ days), by customer, by amount

This is the screen you sit on for 15 minutes once a week and chase customers. Open it on Monday morning.

> 💡 **Send Reminder is the killer feature.** runQ generates a polite WhatsApp message + email with all the overdue invoice numbers, amounts, and a UPI link. Most overdue customers pay within 48 hours of getting it — they just forgot.

### Option C: The full aging report (for analysis)

Sidebar → **AR → Customers → [Customer Name] → Statement** for one customer.

Or go to **Reports → Revenue Analytics** for the analytical view across all customers and time periods.

---

## Reading the aging buckets

The standard aging breakdown is:

| Bucket | What it means | When to worry |
|---|---|---|
| **Current** (not yet due) | Within payment terms | Healthy |
| **1–30 days overdue** | Slightly late | Soft reminder |
| **31–60 days** | Concerning | Phone call + WhatsApp |
| **61–90 days** | Bad | Demand letter, stop further supply |
| **90+ days** | Very bad | Escalate / write-off / legal |

The **Top 3 numbers to watch:**
1. **% of total AR that's overdue** — should ideally be under 20%
2. **% of total AR over 60 days** — should ideally be under 5%
3. **Days Sales Outstanding (DSO)** — how many days of sales your AR represents. Show this in **Reports → Revenue Analytics**.

---

## Looking up a single customer

If you just want to know "what does this one customer owe me", you don't need a report:

1. Use the **global search** at the top of runQ (or `Cmd/Ctrl + K`)
2. Type the customer's name
3. Click them
4. The customer detail page shows their total outstanding, every open invoice with balance, and full payment history

---

## Sending reminders (one-click chase)

From the **Collections** page or any customer detail page, click **Send Reminder**. runQ:

1. Composes a WhatsApp message with the list of overdue invoices, amounts, and a UPI link
2. Composes an email with the same content + a PDF statement attached
3. Sends both
4. Logs the reminder in the customer's timeline ("Reminder sent on 2026-04-08 by Priya")

For automated escalating reminders (1st reminder → 2nd reminder → demand letter), set up **Dunning Rules** in **AR → Dunning**.

---

## Common gotchas

- **"Outstanding" includes draft invoices** — if you have draft invoices that you never sent, they may inflate the number. Filter to status = `sent` / `partially_paid` for the true picture.
- **Customer paid but you forgot to record the receipt** — the customer keeps showing up overdue in runQ even though they actually paid. Always reconcile your bank weekly so this doesn't happen.
- **Credit notes not yet applied** — if you issued a credit note but didn't link it to an invoice, the AR overstates. Open the customer, find the credit note, click "Apply to Invoice".

---

## What's next

- [Recipe 11 — Export to Tally →](./11-export-to-tally.md)
- The full feature set for collections (dunning rules, credit scoring, collection agents, interest on overdues) is documented in `docs/feature-roadmap.md` Phase 3.
