# A Day at runQ

> A story about Priya, who runs a 12-person trading business in Pune, and how runQ fits into one of her typical days.

Priya is 38. She runs **Patil Trading Co.**, a wholesale supplier of electrical fittings. Her team is twelve people: two in sales, three in the warehouse, one accountant who comes in two days a week, and the rest in operations and delivery. Until last month she was entering everything into Tally — bills, invoices, payments, the lot — and it was eating two hours of her morning every single day.

This is what her first Wednesday on runQ looks like.

---

## 9:30 AM — Morning coffee, dashboard check

Priya opens her laptop, logs into runQ, and lands on the **Dashboard**.

She sees five things at a glance:

- **Cash on hand:** ₹4,82,300 across her HDFC current account and her petty cash drawer
- **Money customers owe her:** ₹11,40,500 outstanding, with ₹2,15,000 overdue (in red)
- **Money she owes vendors:** ₹6,20,000, with one bill due tomorrow
- **This month so far:** ₹8,90,000 invoiced, ₹6,40,000 collected
- **Top overdue customer:** Sharma Electricals — ₹85,000, 22 days overdue

Two minutes in, she already knows what her day needs to focus on: **chase Sharma, and don't forget to pay the vendor bill due tomorrow.** That used to take her 20 minutes of digging through Tally.

> Why this matters: in Tally, the dashboard shows nothing useful. You have to navigate to four different reports to get this picture, and even then the numbers are only as fresh as your last manual entry. runQ shows you the answer the moment you log in.

---

## 10:00 AM — A new customer walks in

A walk-in customer — Mr. Deshmukh from a new electrical contractor — wants to place an order for ₹38,000 worth of switchgear. He needs a GST invoice on the spot because his accountant is meeting him at 11.

Priya does this in **two minutes flat**:

1. From the sidebar, **AR → Customers → New Customer**.
2. Types in *Deshmukh Electricals*, his GSTIN, his contact number, and Maharashtra as the state. She picks **Net 15** as the payment terms. Saves.
3. From the sidebar, **AR → Invoices → New Invoice**.
4. Picks *Deshmukh Electricals* from the dropdown, sets today's date and the due date.
5. Adds two line items by searching her item master: *MCB 32A* (HSN auto-fills, GST rate auto-fills at 18%), and *Modular Switch — White*. Quantities and prices type themselves from the master.
6. The summary card shows **Subtotal ₹38,000, GST ₹6,840, Total ₹44,840**.
7. Clicks **Save Invoice**. runQ assigns invoice number `PT/25-26/0142` automatically.

The invoice opens. She clicks **WhatsApp** at the top, picks Deshmukh's number, and the PDF goes to him with a **Pay via UPI** button embedded right in the message.

> Why this matters: in Tally, she'd type the customer name as a "ledger", then go to a different screen for sales vouchers, then manually enter the GST splits, then manually generate a PDF, then attach it to a WhatsApp message herself. Twelve clicks become four. The auto-filled HSN and GST rates eliminate the most error-prone fields.

📖 **See the recipes:** [Add a customer](./recipes/02-add-customer.md), [Create an invoice](./recipes/03-create-invoice.md)

---

## 11:00 AM — A vendor bill arrives over WhatsApp

Her supplier, *Crompton Distributors*, sends a PDF bill on WhatsApp for ₹1,12,000 worth of inventory.

Priya goes to **AP → Bills → New Bill**, clicks **Extract from Invoice** (the sparkles button at the top), uploads the PDF, and waits five seconds.

runQ's AI reads the PDF and pre-fills almost everything:
- Vendor: Crompton Distributors (matched from her vendor master)
- Invoice number: `CD/2425/8821`
- Invoice date and due date
- Three line items with descriptions, HSN codes, quantities, prices, and GST rates

She glances over the values, fixes one quantity that the AI got slightly wrong (the PDF was a phone photo and one digit was blurry), then clicks **Save Bill**.

The bill is now in her AP queue, due in 30 days.

> Why this matters: this is the single biggest time sink for most Indian SMEs. Manual data entry from vendor PDFs is error-prone and boring, and most owners just stop doing it — which means they lose visibility into what they actually owe. runQ's AI extraction gets it right enough that Priya only has to *verify*, not *type*.

📖 **See the recipe:** [Enter a vendor bill](./recipes/06-enter-vendor-bill.md)

---

## 12:30 PM — Bank statement upload before lunch

Once a week, Priya downloads the CSV statement from her HDFC net banking and uploads it to runQ. Today is Wednesday — bank day.

1. From the sidebar, **Banking → Transactions → Import**.
2. Picks her HDFC account.
3. Pastes the CSV directly from the file (six columns: Date, Narration, Reference, Debit, Credit, Balance).
4. Clicks **Preview Rows** — sees 47 rows parsed correctly.
5. Clicks **Import 47 Transactions**. Three duplicates are skipped automatically (she already imported up to last Friday). 44 new transactions are in.

Now she goes to **Banking → Reconciliation** and clicks the big **Auto Reconcile** button at the top right.

Five seconds later: **38 of 44 transactions matched automatically**, an 86% match rate. runQ matched the credits to her customer receipts (UTR numbers and amounts both lined up) and the debits to her vendor payments.

The remaining 6 are unmatched. She looks at them: 4 are bank charges, 1 is GST refund interest, and 1 is a UPI receipt from a customer who paid without telling her. She:
- Categorises the bank charges as expenses (one click each)
- Records the GST refund as a journal entry
- Goes to **AR → Receipts → New** for the UPI customer, picks them, allocates the amount to their oldest open invoice, and saves

Bank reconciliation: **done in 6 minutes**. In Tally, this used to take her accountant the better part of an afternoon.

> Why this matters: bank reconciliation is the most boring, most error-prone, and most-skipped task in any small business. runQ's auto-reconciliation does the easy 80% in seconds, and the visual side-by-side view makes the remaining 20% easy.

📖 **See the recipes:** [Import bank statement](./recipes/08-import-bank-statement.md), [Reconcile your bank](./recipes/09-reconcile-bank.md)

---

## 3:00 PM — Sharma calls asking about his outstanding

Right on cue: Sharma Electricals (the overdue customer from this morning) calls. *"Madam, kitna pending hai abhi? Aaj UTR bhej rahe hain."*

Priya types "Sharma" into the global search at the top of runQ. One click into Sharma Electricals, and she sees:

- **Total outstanding:** ₹85,000
- **Across 2 invoices:**
  - `PT/25-26/0098` — ₹50,000 — 22 days overdue
  - `PT/25-26/0117` — ₹35,000 — 8 days overdue
- His payment history for the last 12 months
- His contact details

She tells him the exact figures. He says he'll send ₹85,000 by NEFT in the next hour.

> Why this matters: in Tally, you'd open the customer's ledger, then squint at a long list of vouchers and try to total up the ones that don't have receipts attached. runQ shows you the answer immediately because every invoice tracks its own balance.

---

## 4:30 PM — Pay tomorrow's vendor bill before it's late

Priya remembers the vendor bill due tomorrow. She goes to **AP → Bills**, filters by *Due This Week*, and sees **Bharat Electricals — ₹1,75,000 — due 2026-04-09**.

She clicks the bill, then clicks **Record Payment** at the top right. The payment screen pre-fills the vendor and the bill. She:

1. Picks her HDFC account
2. Types in the UTR number from the NEFT she just initiated on her bank's app
3. Sets today's date
4. Confirms the full amount
5. Clicks **Record Payment**

The bill flips from *Approved* to *Paid*. Done.

> Why this matters: she didn't have to remember the bill existed — runQ surfaced it on the dashboard this morning *and* in the "Due This Week" filter. The "pay all of one bill" workflow is a one-screen flow, not five.

📖 **See the recipe:** [Pay a vendor bill](./recipes/07-pay-vendor-bill.md)

---

## 5:30 PM — Sharma's NEFT comes in

Her bank app pings: ₹85,000 received from Sharma Electricals.

She goes to **AR → Receipts → New Receipt**:
1. Picks Sharma Electricals
2. Both his open invoices show up automatically with their balances
3. She ticks both, runQ auto-allocates ₹50,000 + ₹35,000 = ₹85,000
4. Picks her HDFC account, pastes the UTR, sets today's date
5. Clicks **Record Receipt**

Both invoices flip to *Paid*. Sharma drops out of her overdue list.

📖 **See the recipe:** [Record customer payment](./recipes/04-record-customer-payment.md)

---

## 6:00 PM — End of day, one last glance

Before she closes her laptop, Priya goes to **Reports → Profit & Loss** and sets the date range to *This Month*. She sees:

- **Revenue:** ₹9,73,000 (up ₹83,000 since this morning, thanks to today's invoices)
- **Expenses:** ₹6,15,000
- **Net profit so far this month:** ₹3,58,000

She clicks the *Compare* toggle and adds *Last Month*. Side-by-side, she's running 8% ahead. She closes the laptop.

> Why this matters: in Tally, P&L is a multi-step process and the numbers lag because you have to "post" things first. In runQ, the P&L is *live* — every saved invoice and bill updates it instantly. You don't wait for month-end to know how you're doing.

---

## What changed for Priya

Before runQ:
- 2 hours every morning entering and reconciling in Tally
- Weekly fight with the accountant about which entries are missing
- "How much does X owe me?" took 5 minutes per question
- Bank reconciliation skipped most weeks
- P&L only seen at month-end (and only after accountant adjustments)

After runQ:
- 30 minutes a day across the whole day
- Bank reconciliation is a 6-minute weekly task
- Any "what's the number" question answered in seconds
- P&L visible in real time
- Tally still gets the data — once a month, via Tally Export — for her CA to file returns

Her accountant still comes in two days a week. But now those two days are spent on **reviewing**, not **typing**.

---

## What's next?

- **Brand new to runQ?** Start with [Recipe 01: Set up your company](./recipes/01-setup-company.md), then [Recipe 02: Add your first customer](./recipes/02-add-customer.md).
- **Already set up?** Bookmark the [recipes index](./README.md#recipes) for whenever you need to look something up.
- **Curious about an advanced feature?** The full feature list is in `docs/feature-roadmap.md`.
