#!/usr/bin/env python3
"""Test medium audit fixes for runQ Finance module."""

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
TID = sql("SELECT id FROM tenants LIMIT 1")
VID = sql("SELECT id FROM vendors LIMIT 1")
BID = sql("SELECT id FROM bank_accounts LIMIT 1")

# ═══════════════════════════════════════════════════════════════
section("#11: 3-Way Match Tolerance")
# ═══════════════════════════════════════════════════════════════

# Create PO with 100 qty, GRN with 98 accepted (2% variance), invoice with 98
POID = sql(f"INSERT INTO purchase_orders (id,tenant_id,po_number,vendor_id,order_date,status,total_amount) VALUES (gen_random_uuid(),'{TID}','PO-TOL-TEST','{VID}','2026-03-22','confirmed',10000) RETURNING id")
POI = sql(f"INSERT INTO purchase_order_items (id,tenant_id,po_id,item_name,sku,quantity,unit_price,amount) VALUES (gen_random_uuid(),'{TID}','{POID}','Test Widget','WDG-001',100,100,10000) RETURNING id")
GRNID = sql(f"INSERT INTO goods_receipt_notes (id,tenant_id,grn_number,po_id,received_date,status) VALUES (gen_random_uuid(),'{TID}','GRN-TOL-TEST','{POID}','2026-03-22','confirmed') RETURNING id")
sql(f"INSERT INTO grn_items (id,tenant_id,grn_id,po_item_id,item_name,sku,ordered_quantity,received_quantity,accepted_quantity,rejected_quantity) VALUES (gen_random_uuid(),'{TID}','{GRNID}','{POI}','Test Widget','WDG-001',100,100,98,2)")

# Invoice with 98 qty (matches GRN, within 2% of PO)
r = req("POST", "/ap/purchase-invoices", {
    "vendorId": VID, "invoiceNumber": "TOL-TEST-001", "invoiceDate": "2026-03-22",
    "dueDate": "2026-04-22", "poId": POID,
    "items": [{"itemName": "Test Widget", "sku": "WDG-001", "quantity": 98, "unitPrice": 100, "amount": 9800}],
    "subtotal": 9800, "taxAmount": 0, "totalAmount": 9800
}, TOKEN)
INV_ID = r.get("data", {}).get("id", "")
check("data" in r, "Created invoice for tolerance test")

if INV_ID:
    r = req("POST", f"/ap/purchase-invoices/{INV_ID}/match", {"poId": POID, "grnId": GRNID}, TOKEN)
    match_status = r.get("data", {}).get("status", "")
    check(match_status == "matched", f"2% qty variance → MATCHED (got '{match_status}')", r.get("data"))

    # Check if tolerance note exists
    lines = r.get("data", {}).get("lines", [])
    has_tolerance_note = any("tolerance" in (l.get("message") or "").lower() or "variance" in (l.get("message") or "").lower() for l in lines)
    check(has_tolerance_note, "Tolerance note present in match result")

# ═══════════════════════════════════════════════════════════════
section("#13: Dunning Automation")
# ═══════════════════════════════════════════════════════════════

r = req("POST", "/ar/dunning/auto-run", None, TOKEN)
check("data" in r, "Auto-dunning executed", r)
d = r.get("data", {})
print(f"     Sent: {d.get('sent', '?')}, Skipped: {d.get('skipped', '?')}")

# ═══════════════════════════════════════════════════════════════
section("#14: markPaid Validation")
# ═══════════════════════════════════════════════════════════════

# Try to mark an already-paid invoice as paid again
CID = sql("SELECT id FROM customers LIMIT 1")
paid_inv = sql("SELECT id FROM sales_invoices WHERE status='paid' LIMIT 1")
if paid_inv:
    r = req("POST", f"/ar/invoices/{paid_inv}/mark-paid", {"paymentDate": "2026-03-22"}, TOKEN)
    check(r.get("statusCode") == 409, "markPaid on fully paid invoice → rejected (409)", r)

# ═══════════════════════════════════════════════════════════════
section("#15: Customer Credit Limit")
# ═══════════════════════════════════════════════════════════════

# Create a customer with low credit limit
r = req("POST", "/ar/customers", {
    "name": "Credit Limit Test Customer", "type": "b2b",
    "paymentTermsDays": 30, "creditLimit": 5000
}, TOKEN)
check("data" in r, "Created customer with ₹5,000 credit limit")
CLID = r.get("data", {}).get("id", "")

if CLID:
    # Create invoice within limit
    r = req("POST", "/ar/invoices", {
        "customerId": CLID, "invoiceDate": "2026-03-22", "dueDate": "2026-04-22",
        "items": [{"description": "Small order", "quantity": 1, "unitPrice": 3000, "amount": 3000}],
        "subtotal": 3000, "taxAmount": 0, "totalAmount": 3000
    }, TOKEN)
    check("data" in r, "Invoice ₹3,000 within ₹5,000 limit → created")

    # Try to create invoice that exceeds limit
    r = req("POST", "/ar/invoices", {
        "customerId": CLID, "invoiceDate": "2026-03-22", "dueDate": "2026-04-22",
        "items": [{"description": "Big order", "quantity": 1, "unitPrice": 4000, "amount": 4000}],
        "subtotal": 4000, "taxAmount": 0, "totalAmount": 4000
    }, TOKEN)
    check(r.get("statusCode") == 409, "Invoice ₹4,000 exceeds limit (outstanding ₹3,000 + ₹4,000 > ₹5,000) → rejected", r)

# ═══════════════════════════════════════════════════════════════
section("#16: CSV Dedup Fix")
# ═══════════════════════════════════════════════════════════════

# Import two transactions with same amount+date but different UTRs
csv1 = "Date,Description,Ref No,Debit,Credit,Balance\n22/03/2026,Payment to Vendor A,UTR-DEDUP-001,5000,,995000"
r1 = req("POST", f"/banking/accounts/{BID}/import", {"csvData": csv1}, TOKEN)
check(r1.get("data", {}).get("imported", 0) == 1, "First UTR imported")

csv2 = "Date,Description,Ref No,Debit,Credit,Balance\n22/03/2026,Payment to Vendor B,UTR-DEDUP-002,5000,,990000"
r2 = req("POST", f"/banking/accounts/{BID}/import", {"csvData": csv2}, TOKEN)
imported = r2.get("data", {}).get("imported", 0)
check(imported == 1, f"Same amount+date different UTR → imported (not deduped) — got {imported}")

# Re-import same UTR → should be deduped
csv3 = "Date,Description,Ref No,Debit,Credit,Balance\n22/03/2026,Payment to Vendor A,UTR-DEDUP-001,5000,,995000"
r3 = req("POST", f"/banking/accounts/{BID}/import", {"csvData": csv3}, TOKEN)
skipped = r3.get("data", {}).get("duplicatesSkipped", 0)
check(skipped == 1, f"Same UTR re-imported → skipped (deduped) — got {skipped}")

# ═══════════════════════════════════════════════════════════════
section("#18: Vendor Matching (Payment Instructions)")
# ═══════════════════════════════════════════════════════════════

# Test fuzzy matching — partial name
r = req("POST", "/ap/payment-queue", {
    "batchId": "MATCH-TEST-001",
    "source": "test",
    "instructions": [
        {"vendorName": "Gopal Sharma", "amount": 1000},
        {"vendorName": "Mathura Dairy", "amount": 2000},
        {"vendorName": "Totally Unknown XYZ Corp", "amount": 500}
    ]
}, TOKEN)
check("data" in r, "Payment batch created for match test", r)
instructions = r.get("data", {}).get("instructions", [])

gopal_matched = any(i.get("vendorId") is not None for i in instructions if "Gopal" in i.get("vendorName", ""))
check(gopal_matched, "Partial name 'Gopal Sharma' → matched vendor")

mathura_matched = any(i.get("vendorId") is not None for i in instructions if "Mathura" in i.get("vendorName", ""))
check(mathura_matched, "Partial name 'Mathura Dairy' → matched vendor")

unknown_unmatched = any(i.get("vendorId") is None for i in instructions if "Unknown" in i.get("vendorName", ""))
check(unknown_unmatched, "'Totally Unknown XYZ Corp' → unmatched")

# ═══════════════════════════════════════════════════════════════
section("#19: Amount Validation")
# ═══════════════════════════════════════════════════════════════

# Try zero amount invoice
r = req("POST", "/ap/purchase-invoices", {
    "vendorId": VID, "invoiceNumber": "ZERO-TEST", "invoiceDate": "2026-03-22",
    "dueDate": "2026-04-22",
    "items": [{"itemName": "Free item", "sku": "FREE", "quantity": 1, "unitPrice": 0, "amount": 0}],
    "subtotal": 0, "taxAmount": 0, "totalAmount": 0
}, TOKEN)
check(r.get("statusCode") == 400, "Zero amount invoice → rejected (400)", r)

# Try negative amount
r = req("POST", "/ap/purchase-invoices", {
    "vendorId": VID, "invoiceNumber": "NEG-TEST", "invoiceDate": "2026-03-22",
    "dueDate": "2026-04-22",
    "items": [{"itemName": "Bad item", "sku": "BAD", "quantity": 1, "unitPrice": -100, "amount": -100}],
    "subtotal": -100, "taxAmount": 0, "totalAmount": -100
}, TOKEN)
check(r.get("statusCode") == 400, "Negative amount invoice → rejected (400)", r)

# ═══════════════════════════════════════════════════════════════
section("RESULTS")
# ═══════════════════════════════════════════════════════════════
total = passed + failed
print(f"\n  {passed}/{total} tests passed, {failed} failed")
if failed == 0:
    print("  🎉 ALL MEDIUM AUDIT FIXES VERIFIED!")
else:
    print(f"  ⚠️  {failed} test(s) need attention")
