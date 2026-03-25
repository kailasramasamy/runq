#!/usr/bin/env python3
"""E2E tests for Phase 1: GST-Aware Invoicing + Quick Wins."""

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
        body = resp.read()
        if not body:
            return {"status": resp.status}
        return json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read()
        if not body:
            return {"statusCode": e.code}
        return json.loads(body)

def sql(query):
    result = subprocess.run(
        ["psql", "-U", "runq_app", "-d", "runq_dev", "-t", "-A", "-c", query],
        capture_output=True, text=True
    )
    return result.stdout.strip().split("\n")[0]

def g(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k, default)
        else:
            return default
    return d

passed = 0
failed = 0

def ok(msg):
    print(f"  ✅ {msg}")

def fail(msg):
    print(f"  ❌ {msg}")

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def check(condition, msg, debug=None):
    global passed, failed
    if condition:
        ok(msg)
        passed += 1
    else:
        fail(msg)
        if debug:
            print(f"     DEBUG: {json.dumps(debug)[:300]}")
        failed += 1


# ═══════════════════════════════════════════════════════════════
section("AUTH")
# ═══════════════════════════════════════════════════════════════

r = req("POST", "/auth/login", {"email": "admin@demo.com", "password": "admin123", "tenant": "demo-company"})
check("data" in r and "token" in r["data"], "Login successful", r)
TOKEN = g(r, "data", "token", default="")


# ═══════════════════════════════════════════════════════════════
section("SUB-PHASE 1A: HSN/SAC Master + Company GST Profile")
# ═══════════════════════════════════════════════════════════════

# Search HSN codes
r = req("GET", "/masters/hsn-sac?q=8471", token=TOKEN)
data = g(r, "data", default=[])
check(len(data) > 0, "HSN search returns results for '8471' (computers)", r)
check(g(data[0], "code") == "8471" if data else False, "HSN code 8471 found", data)
check(g(data[0], "gstRate") == 18 if data else False, "GST rate is 18% for 8471", data)

# Search SAC codes
r = req("GET", "/masters/hsn-sac?q=9983&type=sac", token=TOKEN)
data = g(r, "data", default=[])
check(len(data) > 0, "SAC search returns results for '9983' (IT services)", r)

# Search by description
r = req("GET", "/masters/hsn-sac?q=milk", token=TOKEN)
data = g(r, "data", default=[])
check(len(data) > 0, "HSN search by description 'milk' returns results", r)

# Update company GST profile
r = req("PUT", "/settings/company", {
    "currency": "INR",
    "financialYearStartMonth": 4,
    "defaultPaymentTermsDays": 30,
    "gstin": "27AABCU9603R1ZM",
    "legalName": "Demo Company Pvt Ltd",
    "state": "Maharashtra",
    "stateCode": "27",
    "addressLine1": "123 Business Park",
    "city": "Mumbai",
    "pincode": "400001",
}, token=TOKEN)
check("data" in r, "Company GST profile updated", r)

# Verify GST profile persisted
r = req("GET", "/settings/company", token=TOKEN)
settings = g(r, "data", "settings", default={})
check(settings.get("gstin") == "27AABCU9603R1ZM", "GSTIN persisted in settings", settings)
check(settings.get("stateCode") == "27", "State code persisted", settings)


# ═══════════════════════════════════════════════════════════════
section("SUB-PHASE 1B: GST Tax Calculation + TDS")
# ═══════════════════════════════════════════════════════════════

# Create a customer in same state (Maharashtra) — intra-state
r = req("POST", "/ar/customers", {
    "name": "GST Test Customer - Intra",
    "type": "b2b",
    "email": "gstintra@test.com",
    "gstin": "27AALCM1234F1Z5",
    "state": "Maharashtra",
}, token=TOKEN)
INTRA_CUSTOMER_ID = g(r, "data", "id")
check(INTRA_CUSTOMER_ID is not None, "Intra-state customer created", r)

# Create a customer in different state (Karnataka) — inter-state
r = req("POST", "/ar/customers", {
    "name": "GST Test Customer - Inter",
    "type": "b2b",
    "email": "gstinter@test.com",
    "gstin": "29AALCM5678G1Z3",
    "state": "Karnataka",
}, token=TOKEN)
INTER_CUSTOMER_ID = g(r, "data", "id")
check(INTER_CUSTOMER_ID is not None, "Inter-state customer created", r)

# Create INTRA-STATE invoice (should get CGST + SGST)
r = req("POST", "/ar/invoices", {
    "customerId": INTRA_CUSTOMER_ID,
    "invoiceDate": "2026-03-25",
    "dueDate": "2026-04-25",
    "subtotal": 10000,
    "taxAmount": 1800,
    "totalAmount": 11800,
    "reverseCharge": False,
    "items": [{
        "description": "IT Consulting",
        "quantity": 1,
        "unitPrice": 10000,
        "amount": 10000,
        "hsnSacCode": "998311",
        "taxRate": 18,
        "taxCategory": "taxable",
    }],
}, token=TOKEN)
INTRA_INV_ID = g(r, "data", "id")
check(INTRA_INV_ID is not None, "Intra-state invoice created", r)

# Verify CGST/SGST split
inv = g(r, "data", default={})
check(inv.get("cgstAmount") == 900, f"CGST = 900 (got {inv.get('cgstAmount')})", inv)
check(inv.get("sgstAmount") == 900, f"SGST = 900 (got {inv.get('sgstAmount')})", inv)
check(inv.get("igstAmount") == 0, "IGST = 0 for intra-state", inv)
check(inv.get("isInterState") == False, "isInterState = false", inv)
check(inv.get("placeOfSupply") is not None, "Place of supply set", inv)

# Verify line item GST
items = g(r, "data", "items", default=[])
if items:
    item = items[0]
    check(item.get("hsnSacCode") == "998311", "HSN/SAC code preserved on item", item)
    check(item.get("cgstRate") == 9, f"Item CGST rate = 9% (got {item.get('cgstRate')})", item)
    check(item.get("sgstRate") == 9, f"Item SGST rate = 9% (got {item.get('sgstRate')})", item)
    check(item.get("cgstAmount") == 900, f"Item CGST amount = 900 (got {item.get('cgstAmount')})", item)

# Create INTER-STATE invoice (should get IGST)
r = req("POST", "/ar/invoices", {
    "customerId": INTER_CUSTOMER_ID,
    "invoiceDate": "2026-03-25",
    "dueDate": "2026-04-25",
    "subtotal": 5000,
    "taxAmount": 900,
    "totalAmount": 5900,
    "reverseCharge": False,
    "items": [{
        "description": "Software License",
        "quantity": 1,
        "unitPrice": 5000,
        "amount": 5000,
        "hsnSacCode": "998316",
        "taxRate": 18,
        "taxCategory": "taxable",
    }],
}, token=TOKEN)
INTER_INV_ID = g(r, "data", "id")
check(INTER_INV_ID is not None, "Inter-state invoice created", r)

inv = g(r, "data", default={})
check(inv.get("igstAmount") == 900, f"IGST = 900 (got {inv.get('igstAmount')})", inv)
check(inv.get("cgstAmount") == 0, "CGST = 0 for inter-state", inv)
check(inv.get("sgstAmount") == 0, "SGST = 0 for inter-state", inv)
check(inv.get("isInterState") == True, "isInterState = true", inv)

# Create exempt invoice (no tax)
r = req("POST", "/ar/invoices", {
    "customerId": INTRA_CUSTOMER_ID,
    "invoiceDate": "2026-03-25",
    "dueDate": "2026-04-25",
    "subtotal": 2000,
    "taxAmount": 0,
    "totalAmount": 2000,
    "reverseCharge": False,
    "items": [{
        "description": "Educational Service",
        "quantity": 1,
        "unitPrice": 2000,
        "amount": 2000,
        "hsnSacCode": "999210",
        "taxRate": 0,
        "taxCategory": "exempt",
    }],
}, token=TOKEN)
check("data" in r, "Exempt invoice created (zero tax)", r)
inv = g(r, "data", default={})
check(inv.get("cgstAmount") == 0, "Exempt: CGST = 0", inv)
check(inv.get("igstAmount") == 0, "Exempt: IGST = 0", inv)

# Create vendor for TDS test
r = req("POST", "/ap/vendors", {
    "name": "TDS Test Vendor",
    "gstin": "27AADCS1234F1Z5",
    "state": "Maharashtra",
}, token=TOKEN)
TDS_VENDOR_ID = g(r, "data", "id")
check(TDS_VENDOR_ID is not None, "TDS test vendor created", r)

# Create purchase invoice with TDS
r = req("POST", "/ap/purchase-invoices", {
    "vendorId": TDS_VENDOR_ID,
    "invoiceNumber": "PI-TDS-001",
    "invoiceDate": "2026-03-25",
    "dueDate": "2026-04-25",
    "subtotal": 50000,
    "taxAmount": 9000,
    "totalAmount": 59000,
    "reverseCharge": False,
    "tdsSection": "194J",
    "items": [{
        "itemName": "Professional Services",
        "quantity": 1,
        "unitPrice": 50000,
        "amount": 50000,
        "hsnSacCode": "998231",
        "taxRate": 18,
        "taxCategory": "taxable",
        "tdsSection": "194J",
        "tdsRate": 10,
    }],
}, token=TOKEN)
check("data" in r, "Purchase invoice with TDS created", r)
pi = g(r, "data", default={})
check(pi.get("tdsSection") == "194J", "TDS section = 194J", pi)
check(pi.get("tdsAmount") == 5000, f"TDS amount = 5000 (got {pi.get('tdsAmount')})", pi)
check(pi.get("cgstAmount") == 4500, f"PI CGST = 4500 (got {pi.get('cgstAmount')})", pi)
check(pi.get("sgstAmount") == 4500, f"PI SGST = 4500 (got {pi.get('sgstAmount')})", pi)


# ═══════════════════════════════════════════════════════════════
section("SUB-PHASE 1C: GSTIN Validation")
# ═══════════════════════════════════════════════════════════════

# Valid GSTIN checksum
r = req("POST", "/ar/customers/verify-gstin", {"gstin": "27AABCU9603R1ZM"}, token=TOKEN)
check(g(r, "checksum") == "valid", "Valid GSTIN passes checksum", r)

# Invalid GSTIN (bad format — 99 is not a valid state code)
r = req("POST", "/ar/customers/verify-gstin", {"gstin": "99AABCU9603R1ZM"}, token=TOKEN)
check(g(r, "error") is not None, "Invalid GSTIN state code rejected", r)

# Vendor GSTIN verification also works
r = req("POST", "/ap/vendors/verify-gstin", {"gstin": "29AALCM5678G1Z3"}, token=TOKEN)
check(g(r, "checksum") == "valid", "Vendor GSTIN verification works", r)


# ═══════════════════════════════════════════════════════════════
section("SUB-PHASE 1D: GST Invoice Template")
# ═══════════════════════════════════════════════════════════════

# Get invoice for print (verify it doesn't error)
if INTRA_INV_ID:
    tenant_id = g(req("GET", "/settings/company", token=TOKEN), "data", "id", default="")
    try:
        url = f"{API}/ar/invoices/{INTRA_INV_ID}/print?tenantId={tenant_id}"
        resp = urllib.request.urlopen(url)
        html = resp.read().decode()
        check("<!DOCTYPE html" in html or "<html" in html, "Invoice print returns HTML")
        check("GSTIN" in html or "gstin" in html.lower() or len(html) > 500, "Invoice HTML has content")
    except Exception as e:
        check(False, f"Invoice print endpoint error: {e}")


# ═══════════════════════════════════════════════════════════════
section("SUB-PHASE 1E: Document Attachments")
# ═══════════════════════════════════════════════════════════════

# List attachments (should be empty for new invoice)
if INTRA_INV_ID:
    r = req("GET", f"/common/attachments/sales_invoice/{INTRA_INV_ID}", token=TOKEN)
    data = g(r, "data", default=[])
    check(isinstance(data, list), "Attachments list returns array", r)
    check(len(data) == 0, "New invoice has no attachments", r)


# ═══════════════════════════════════════════════════════════════
section("SUB-PHASE 1F: Recurring Invoices")
# ═══════════════════════════════════════════════════════════════

# Create recurring invoice template
r = req("POST", "/ar/recurring", {
    "customerId": INTRA_CUSTOMER_ID,
    "frequency": "monthly",
    "dayOfMonth": 1,
    "startDate": "2026-04-01",
    "autoSend": False,
    "items": [{
        "description": "Monthly Retainer",
        "quantity": 1,
        "unitPrice": 25000,
        "amount": 25000,
        "hsnSacCode": "998311",
        "taxRate": 18,
        "taxCategory": "taxable",
    }],
}, token=TOKEN)
REC_ID = g(r, "data", "id")
check(REC_ID is not None, "Recurring invoice template created", r)
check(g(r, "data", "frequency") == "monthly", "Frequency = monthly", r)
check(g(r, "data", "status") == "active", "Status = active", r)
check(g(r, "data", "nextRunDate") == "2026-04-01", "Next run = 2026-04-01", r)

# List recurring templates
r = req("GET", "/ar/recurring", token=TOKEN)
data = g(r, "data", default=[])
check(len(data) >= 1, f"Recurring list has {len(data)} templates", r)

# Pause recurring
if REC_ID:
    r = req("POST", f"/ar/recurring/{REC_ID}/pause", token=TOKEN)
    check(g(r, "data", "status") == "paused", "Recurring paused", r)

    # Resume
    r = req("POST", f"/ar/recurring/{REC_ID}/resume", token=TOKEN)
    check(g(r, "data", "status") == "active", "Recurring resumed", r)

# Generate (should not generate — next run is April 1, today is March 25)
r = req("POST", "/ar/recurring/generate", token=TOKEN)
check(g(r, "data", "generated") == 0, "No invoices generated (next run is future)", r)

# Update to past date and generate
if REC_ID:
    r = req("PUT", f"/ar/recurring/{REC_ID}", {
        "startDate": "2026-03-01",
    }, token=TOKEN)

    # Now set nextRunDate to past via direct SQL
    sql(f"UPDATE recurring_invoice_templates SET next_run_date = '2026-03-01' WHERE id = '{REC_ID}'")

    r = req("POST", "/ar/recurring/generate", token=TOKEN)
    gen = g(r, "data", "generated", default=0)
    check(gen == 1, f"1 invoice generated from recurring (got {gen})", r)

    # Verify the template was updated
    r = req("GET", f"/ar/recurring/{REC_ID}", token=TOKEN)
    check(g(r, "data", "totalGenerated") == 1, "totalGenerated = 1", r)
    check(g(r, "data", "lastGeneratedAt") is not None, "lastGeneratedAt set", r)


# ═══════════════════════════════════════════════════════════════
section("SUB-PHASE 1G: WhatsApp (config check)")
# ═══════════════════════════════════════════════════════════════

# WhatsApp is config-dependent (needs Gupshup API key), so we just test
# the send endpoint accepts the channel parameter without error
if INTRA_INV_ID:
    r = req("POST", f"/ar/invoices/{INTRA_INV_ID}/send", {
        "channel": "email",
        "sendEmail": False,
    }, token=TOKEN)
    check("data" in r, "Invoice send with channel=email works", r)

# Test sending via WhatsApp channel on a NEW draft invoice
r = req("POST", "/ar/invoices", {
    "customerId": INTRA_CUSTOMER_ID,
    "invoiceDate": "2026-03-25",
    "dueDate": "2026-04-25",
    "subtotal": 1000,
    "taxAmount": 180,
    "totalAmount": 1180,
    "reverseCharge": False,
    "items": [{
        "description": "WhatsApp test",
        "quantity": 1,
        "unitPrice": 1000,
        "amount": 1000,
        "hsnSacCode": "998311",
        "taxRate": 18,
        "taxCategory": "taxable",
    }],
}, token=TOKEN)
WA_INV_ID = g(r, "data", "id")
if WA_INV_ID:
    r = req("POST", f"/ar/invoices/{WA_INV_ID}/send", {
        "channel": "whatsapp",
        "sendEmail": False,
    }, token=TOKEN)
    check("data" in r, "Invoice send with channel=whatsapp accepted (no Gupshup config = silent no-op)", r)


# ═══════════════════════════════════════════════════════════════
section("TALLY EXPORT: GST Tax Breakdown")
# ═══════════════════════════════════════════════════════════════

try:
    url = f"{API}/tally/export?dateFrom=2026-03-01&dateTo=2026-03-31"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    r2 = urllib.request.Request(url, headers=headers)
    resp = urllib.request.urlopen(r2)
    xml = resp.read().decode()
    check("<?xml" in xml, "Tally export returns XML")
    check("Output CGST" in xml or "Output IGST" in xml, "Tally XML has GST tax ledger entries")
    # Input tax entries only appear for approved purchase invoices (test PI is still draft)
    check("Sales" in xml, "Tally XML has sales vouchers")
except Exception as e:
    check(False, f"Tally export error: {e}")

try:
    url = f"{API}/tally/ledgers"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    r2 = urllib.request.Request(url, headers=headers)
    resp = urllib.request.urlopen(r2)
    xml = resp.read().decode()
    check("<?xml" in xml, "Tally ledgers returns XML")
    check("Output CGST" in xml, "Tally ledger masters include GST ledgers")
    check("TDS Payable" in xml, "Tally ledger masters include TDS Payable")
except Exception as e:
    check(False, f"Tally ledgers error: {e}")


# ═══════════════════════════════════════════════════════════════
section("RESULTS")
# ═══════════════════════════════════════════════════════════════

print(f"\n  Total: {passed + failed}")
print(f"  ✅ Passed: {passed}")
print(f"  ❌ Failed: {failed}")
print()

if failed > 0:
    exit(1)
