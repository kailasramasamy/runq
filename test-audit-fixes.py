#!/usr/bin/env python3
"""Test critical and high audit fixes for runQ Finance module."""

import json
import subprocess
import urllib.request
import urllib.error

API = "http://localhost:3003/api/v1"

def req(method, path, body=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    r = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r)
        body_bytes = resp.read()
        return json.loads(body_bytes) if body_bytes else {"status": resp.status}
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        return json.loads(body_bytes) if body_bytes else {"statusCode": e.code}

def sql(query):
    result = subprocess.run(
        ["psql", "-U", "runq_app", "-d", "runq_dev", "-t", "-A", "-c", query],
        capture_output=True, text=True
    )
    return result.stdout.strip().split("\n")[0]

passed = 0
failed = 0

def check(condition, msg, debug=None):
    global passed, failed
    if condition:
        print(f"  ✅ {msg}")
        passed += 1
    else:
        print(f"  ❌ {msg}")
        if debug:
            print(f"     DEBUG: {json.dumps(debug)[:300]}")
        failed += 1

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# Login
r = req("POST", "/auth/login", {"email": "admin@demo.com", "password": "admin123", "tenant": "demo-company"})
TOKEN = r["data"]["token"]

# ═══════════════════════════════════════════════════════════════
section("CRITICAL #1: Decimal Precision")
# ═══════════════════════════════════════════════════════════════

# Create a vendor for testing
VID = sql("SELECT id FROM vendors LIMIT 1")
BID = sql("SELECT id FROM bank_accounts LIMIT 1")

# Create a bill with tricky decimal amounts
r = req("POST", "/ap/purchase-invoices", {
    "vendorId": VID, "invoiceNumber": "PREC-TEST-001", "invoiceDate": "2026-03-22",
    "dueDate": "2026-04-22",
    "items": [
        {"itemName": "Test Item 1", "sku": "T1", "quantity": 3, "unitPrice": 333.33, "amount": 999.99},
        {"itemName": "Test Item 2", "sku": "T2", "quantity": 1, "unitPrice": 0.01, "amount": 0.01},
    ],
    "subtotal": 1000.00, "taxAmount": 0, "totalAmount": 1000.00
}, TOKEN)
check("data" in r, "Created bill with decimal amounts", r)
INV_ID = r.get("data", {}).get("id", "")

# Approve it (no PO — direct approve)
if INV_ID:
    r = req("POST", f"/ap/purchase-invoices/{INV_ID}/approve", {}, TOKEN)
    check(r.get("data", {}).get("status") == "approved", "Approved precision test bill")

    # Pay 333.33 three times — total should be 999.99, not 1000.00 or 999.98
    for i in range(3):
        r = req("POST", "/ap/payments", {
            "vendorId": VID, "bankAccountId": BID, "paymentMethod": "bank_transfer",
            "referenceNumber": f"PREC-UTR-{i+1}", "paymentDate": "2026-03-22",
            "totalAmount": 333.33, "allocations": [{"invoiceId": INV_ID, "amount": 333.33}]
        }, TOKEN)
        # Approve each payment
        pay_id = r.get("data", {}).get("id", "")
        if pay_id:
            req("POST", f"/ap/payments/{pay_id}/approve", None, TOKEN)

    # Check balance — should be exactly 0.01 (1000.00 - 999.99)
    r = req("GET", f"/ap/purchase-invoices/{INV_ID}", token=TOKEN)
    balance = r.get("data", {}).get("balanceDue", -1)
    check(balance == 0.01, f"Balance after 3×333.33 = 0.01 (got {balance})", r.get("data"))

# ═══════════════════════════════════════════════════════════════
section("CRITICAL #2: Payment Approval Workflow")
# ═══════════════════════════════════════════════════════════════

# Create a direct payment
r = req("POST", "/ap/payments/direct", {
    "vendorId": VID, "bankAccountId": BID, "paymentMethod": "bank_transfer",
    "referenceNumber": "APPROVAL-TEST-001", "paymentDate": "2026-03-22",
    "amount": 5000, "notes": "Test approval workflow"
}, TOKEN)
check("data" in r, "Created direct payment", r)
PAY_ID = r.get("data", {}).get("id", "")
PAY_STATUS = r.get("data", {}).get("status", "")
check(PAY_STATUS == "pending", f"Payment status is 'pending' (got '{PAY_STATUS}')")

# Try to approve
if PAY_ID:
    r = req("POST", f"/ap/payments/{PAY_ID}/approve", None, TOKEN)
    check(r.get("data", {}).get("status") == "completed", "Payment approved → completed")

# Test reject flow
r = req("POST", "/ap/payments/direct", {
    "vendorId": VID, "bankAccountId": BID, "paymentMethod": "bank_transfer",
    "referenceNumber": "REJECT-TEST-001", "paymentDate": "2026-03-22",
    "amount": 3000
}, TOKEN)
PAY_ID2 = r.get("data", {}).get("id", "")
check(r.get("data", {}).get("status") == "pending", "Second payment created as pending")

if PAY_ID2:
    r = req("POST", f"/ap/payments/{PAY_ID2}/reject", {"reason": "Duplicate payment"}, TOKEN)
    check("data" in r, "Payment rejected successfully")

# ═══════════════════════════════════════════════════════════════
section("CRITICAL #3: Audit Trail")
# ═══════════════════════════════════════════════════════════════

r = req("GET", "/settings/audit-log?limit=10", token=TOKEN)
check("data" in r, "Audit log API works", r)
entries = r.get("data", [])
check(len(entries) > 0, f"Audit log has {len(entries)} entries")

# Check that payment approval was logged
has_payment_approved = any(
    e.get("action") == "approved" and e.get("entityType") == "payment"
    for e in entries
)
check(has_payment_approved, "Payment approval logged in audit trail")

has_payment_rejected = any(
    e.get("action") == "rejected" and e.get("entityType") == "payment"
    for e in entries
)
check(has_payment_rejected, "Payment rejection logged in audit trail")

# ═══════════════════════════════════════════════════════════════
section("CRITICAL #4: General Ledger")
# ═══════════════════════════════════════════════════════════════

# Check chart of accounts
r = req("GET", "/gl/accounts", token=TOKEN)
check("data" in r, "Chart of accounts API works", r)
accounts = r.get("data", [])
check(len(accounts) >= 20, f"Chart of accounts has {len(accounts)} accounts (expected 20+)")

# Check account types
types = set(a.get("type") for a in accounts)
check(types == {"asset", "liability", "equity", "revenue", "expense"}, f"All 5 account types present: {types}")

# Create a manual journal entry
r = req("POST", "/gl/journal-entries", {
    "date": "2026-03-22",
    "description": "Test journal entry — office supplies",
    "lines": [
        {"accountCode": "5009", "debit": 500},
        {"accountCode": "1101", "credit": 500}
    ]
}, TOKEN)
check("data" in r, "Manual journal entry created", r)
je_number = r.get("data", {}).get("entryNumber", "")
check(je_number.startswith("JE-"), f"Journal entry numbered: {je_number}")

# Verify balance
total_debit = r.get("data", {}).get("totalDebit", 0)
total_credit = r.get("data", {}).get("totalCredit", 0)
check(total_debit == total_credit, f"Debits ({total_debit}) = Credits ({total_credit})")

# Test unbalanced entry (should fail)
r = req("POST", "/gl/journal-entries", {
    "date": "2026-03-22",
    "description": "Unbalanced entry — should fail",
    "lines": [
        {"accountCode": "5009", "debit": 500},
        {"accountCode": "1101", "credit": 300}
    ]
}, TOKEN)
check(r.get("statusCode") in (400, 422), "Unbalanced journal entry rejected")

# Trial balance
r = req("GET", "/gl/trial-balance", token=TOKEN)
check("data" in r, "Trial balance API works", r)
tb = r.get("data", [])
if tb:
    total_dr = sum(row.get("debit", 0) for row in tb)
    total_cr = sum(row.get("credit", 0) for row in tb)
    check(abs(total_dr - total_cr) < 0.01, f"Trial balance balanced: DR={total_dr} CR={total_cr}")

# ═══════════════════════════════════════════════════════════════
section("HIGH #7: Customer Outstanding")
# ═══════════════════════════════════════════════════════════════

r = req("GET", "/ar/customers", token=TOKEN)
check("data" in r, "Customer list works")
for c in r.get("data", []):
    name = c.get("name", "?")
    outstanding = c.get("outstandingAmount", "?")
    print(f"     {name}: ₹{outstanding}")

# ═══════════════════════════════════════════════════════════════
section("HIGH #8: Invoice Auto-Overdue")
# ═══════════════════════════════════════════════════════════════

r = req("GET", "/ar/invoices", token=TOKEN)
check("data" in r, "Invoice list works")
overdue_found = False
for inv in r.get("data", []):
    if inv.get("status") == "overdue":
        overdue_found = True
        print(f"     {inv['invoiceNumber']}: OVERDUE (due {inv['dueDate']})")
check(overdue_found, "At least one invoice auto-detected as overdue")

# ═══════════════════════════════════════════════════════════════
section("HIGH #9: Reconciliation Period Locking")
# ═══════════════════════════════════════════════════════════════

BID = sql("SELECT id FROM bank_accounts LIMIT 1")

# Close a period
r = req("POST", "/banking/reconciliation/close-period", {
    "bankAccountId": BID,
    "periodEnd": "2026-03-15",
    "bankClosingBalance": 1350000
}, TOKEN)
check("data" in r or r.get("statusCode") == 201, "Period closed successfully", r)

# Check closed periods
r = req("GET", f"/banking/accounts/{BID}/reconciliation/periods", token=TOKEN)
check("data" in r, "Closed periods list works", r)

# ═══════════════════════════════════════════════════════════════
section("HIGH #10: Multi-Invoice DN/CN")
# ═══════════════════════════════════════════════════════════════

# Create a debit note WITHOUT linked invoice (general vendor credit)
r = req("POST", "/ap/debit-notes", {
    "vendorId": VID, "issueDate": "2026-03-22",
    "amount": 1500, "reason": "General quality compensation"
}, TOKEN)
check("data" in r, "Created debit note without invoice link", r)
DN_ID = r.get("data", {}).get("id", "")

if DN_ID:
    # Issue it
    req("POST", f"/ap/debit-notes/{DN_ID}/issue", None, TOKEN)

    # Apply as general credit (no invoice)
    r = req("POST", f"/ap/debit-notes/{DN_ID}/apply", None, TOKEN)
    check(r.get("data", {}).get("status") == "adjusted", "General debit note applied (no invoice)")

# ═══════════════════════════════════════════════════════════════
section("RESULTS")
# ═══════════════════════════════════════════════════════════════
total = passed + failed
print(f"\n  {passed}/{total} tests passed, {failed} failed")
if failed == 0:
    print("  🎉 ALL CRITICAL + HIGH AUDIT FIXES VERIFIED!")
else:
    print(f"  ⚠️  {failed} test(s) need attention")
