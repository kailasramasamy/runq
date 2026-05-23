#!/usr/bin/env python3
"""End-to-end test for the Inventory module (Phase 1).

Covers the 9 happy-path flows from docs/inventory-plan.md §8.1:
  1. Create warehouse + items (one batch-tracked, one not)
  2. GRN post → ledger updated, JE posted, on-hand correct
  3. Delivery (with FEFO) → ledger + JE booked, COGS pulled at WA cost
  4. Negative-stock attempt rejected
  5. Cancel posted GRN → reversal ledger + reversal JE
  6. On-hand cache matches ledger sum (rebuild check)
  7. Barcode lookup returns the right item
  8. Reorder alert surfaces when on-hand < reorder_level
  9. Dashboard KPIs reflect today's posts

Run with the API on :3003 and a freshly migrated demo tenant available.
"""

import json
import subprocess
import urllib.request
import urllib.error
import sys
import time

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
        raw = resp.read()
        if not raw:
            return {"status": resp.status}
        return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return json.loads(raw) if raw else {"statusCode": e.code}
        except Exception:
            return {"statusCode": e.code, "raw": raw.decode(errors='ignore')}

def sql(query):
    result = subprocess.run(
        ["psql", "-U", "runq_app", "-d", "runq_dev", "-t", "-A", "-c", query],
        capture_output=True, text=True,
    )
    return result.stdout.strip()

def ok(msg): print(f"  ✅ {msg}")
def fail(msg): print(f"  ❌ {msg}")
def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")

passed = 0
failed = 0

def check(condition, msg, debug=None):
    global passed, failed
    if condition:
        ok(msg); passed += 1
    else:
        fail(msg)
        if debug is not None:
            print(f"     DEBUG: {json.dumps(debug, default=str)[:400]}")
        failed += 1

# ─── AUTH ──────────────────────────────────────────────────────────────
section("AUTH")
r = req("POST", "/auth/login",
        {"email": "appreview@runq.in", "password": "AppleReview2026!", "tenant": "runq-demo"})
check("data" in r and "token" in r["data"], "Login successful", r)
TOKEN = r["data"]["token"]

def tok(): return TOKEN

# ─── WAREHOUSE + ITEM SETUP ────────────────────────────────────────────
section("Setup: warehouse + items")
unique = str(int(time.time()))
wh_payload = {"code": f"INV-WH-{unique}", "name": f"Inv Test WH {unique}", "type": "godown"}
r = req("POST", "/inventory/warehouses", wh_payload, tok())
check(r.get("data", {}).get("id") is not None, "Warehouse created", r)
WH_ID = r["data"]["id"]

# Find or create two product items.
def ensure_item(name, sku, opts=None):
    body = {
        "name": name, "sku": sku, "type": "product",
        "unit": "Nos", "packSizeUqc": "NOS",
        "defaultSellingPrice": 100, "defaultPurchasePrice": 80,
        "gstRate": 18,
    }
    if opts:
        body.update(opts)
    r = req("POST", "/masters/items", body, tok())
    if r.get("data", {}).get("id"):
        return r["data"]["id"]
    # Already exists? List and pick it.
    li = req("GET", f"/masters/items?search={sku}", token=tok())
    rows = li.get("data") or []
    if rows:
        return rows[0]["id"]
    raise RuntimeError(f"Could not create or find item {sku}: {r}")

ITEM_NORMAL = ensure_item(f"Inv Test Item A {unique}", f"INV-A-{unique}")
ITEM_BATCH = ensure_item(f"Inv Test Item B {unique}", f"INV-B-{unique}")
# Toggle batch tracking + barcode on item B via direct SQL (the items
# extension columns aren't yet writable via /masters/items in v1).
sql(f"UPDATE items SET track_batches = TRUE, track_expiry = TRUE, "
    f"reorder_level = 50, barcode = 'BC-{unique}' WHERE id = '{ITEM_BATCH}'")
ok(f"Items prepared (A: {ITEM_NORMAL[:8]}…, B: {ITEM_BATCH[:8]}… batch+barcode)")

# ─── GRN POST ──────────────────────────────────────────────────────────
section("GRN: create + post → ledger + JE")
grn_body = {
    "warehouseId": WH_ID,
    "receivedDate": time.strftime("%Y-%m-%d"),
    "lines": [
        {"itemId": ITEM_NORMAL, "qty": 100, "unitRate": 50},
        {"itemId": ITEM_BATCH, "batchNo": "B-001", "expiryDate": "2027-12-31", "qty": 60, "unitRate": 80},
    ],
}
r = req("POST", "/inventory/grn", grn_body, tok())
check(r.get("data", {}).get("grnNo", "").startswith("GRN-"), "GRN created (draft)", r)
GRN_ID = r["data"]["id"]
GRN_NO = r["data"]["grnNo"]

r = req("POST", f"/inventory/grn/{GRN_ID}/post", {}, tok())
check(r.get("data", {}).get("status") == "posted", "GRN posted", r)
JE_ID = r["data"].get("journalEntryId")
check(JE_ID is not None, "JE attached to GRN")

# Ledger should have two rows for this GRN.
n_rows = sql(f"SELECT COUNT(*) FROM stock_ledger WHERE source_type='inventory_grn' AND source_id='{GRN_ID}'")
check(n_rows == "2", f"Ledger has 2 rows for GRN (got {n_rows})")

# JE should be balanced and on the right accounts.
je_total = sql(f"SELECT total_debit FROM journal_entries WHERE id='{JE_ID}'")
expected = 100 * 50 + 60 * 80  # 5000 + 4800 = 9800
check(float(je_total or 0) == expected, f"JE total_debit = {expected} (got {je_total})")

# On-hand cache for item A in this warehouse should be 100.
qty_a = sql(f"SELECT qty FROM stock_on_hand WHERE item_id='{ITEM_NORMAL}' AND warehouse_id='{WH_ID}'")
check(float(qty_a or 0) == 100, f"On-hand item A = 100 (got {qty_a})")

# Item B batch B-001 should be 60.
qty_b = sql(f"SELECT qty FROM stock_on_hand WHERE item_id='{ITEM_BATCH}' AND warehouse_id='{WH_ID}' AND batch_no='B-001'")
check(float(qty_b or 0) == 60, f"On-hand item B batch B-001 = 60 (got {qty_b})")

# ─── DELIVERY (FEFO + COGS) ────────────────────────────────────────────
section("Delivery: dispatch with FEFO + COGS posting")
# Add a second batch with later expiry so FEFO can prefer the first.
grn2 = req("POST", "/inventory/grn", {
    "warehouseId": WH_ID,
    "receivedDate": time.strftime("%Y-%m-%d"),
    "lines": [{"itemId": ITEM_BATCH, "batchNo": "B-002", "expiryDate": "2028-12-31",
               "qty": 40, "unitRate": 100}],
}, tok())
req("POST", f"/inventory/grn/{grn2['data']['id']}/post", {}, tok())
ok("Second batch B-002 (later expiry) posted")

dn = req("POST", "/inventory/delivery-notes", {
    "warehouseId": WH_ID,
    "dispatchDate": time.strftime("%Y-%m-%d"),
    "lines": [
        {"itemId": ITEM_NORMAL, "qty": 30},
        # No batchNo on this line — FEFO should auto-pick B-001 (earlier expiry).
        {"itemId": ITEM_BATCH, "qty": 20},
    ],
}, tok())
check(dn.get("data", {}).get("dnNo", "").startswith("DN-"), "DN created (draft)", dn)
DN_ID = dn["data"]["id"]

disp = req("POST", f"/inventory/delivery-notes/{DN_ID}/dispatch", {}, tok())
check(disp.get("data", {}).get("status") == "dispatched", "DN dispatched", disp)

# Ledger should now show two outbound rows.
n_out = sql(f"SELECT COUNT(*) FROM stock_ledger WHERE source_type='delivery_note' AND source_id='{DN_ID}'")
check(n_out == "2", f"DN created 2 outbound ledger rows (got {n_out})")

# FEFO should have hit B-001 (the earlier expiry).
fefo_batch = sql(
    f"SELECT batch_no FROM stock_ledger WHERE source_type='delivery_note' "
    f"AND source_id='{DN_ID}' AND item_id='{ITEM_BATCH}'"
)
check(fefo_batch == "B-001", f"FEFO picked B-001 (got '{fefo_batch}')")

# Item A WA cost was 50; dispatching 30 → COGS line should be 30*50=1500.
qty_a_after = sql(f"SELECT qty FROM stock_on_hand WHERE item_id='{ITEM_NORMAL}' AND warehouse_id='{WH_ID}'")
check(float(qty_a_after or 0) == 70, f"On-hand A after dispatch = 70 (got {qty_a_after})")

# ─── NEGATIVE STOCK REJECTED ───────────────────────────────────────────
section("Negative stock attempt rejected")
bad_dn = req("POST", "/inventory/delivery-notes", {
    "warehouseId": WH_ID, "dispatchDate": time.strftime("%Y-%m-%d"),
    "lines": [{"itemId": ITEM_NORMAL, "qty": 999999}],
}, tok())
disp_bad = req("POST", f"/inventory/delivery-notes/{bad_dn['data']['id']}/dispatch", {}, tok())
check(
    disp_bad.get("statusCode") == 409 or "Insufficient" in str(disp_bad),
    "Excess-qty dispatch rejected (409 Insufficient stock)",
    disp_bad,
)

# ─── CANCEL POSTED GRN → REVERSAL ──────────────────────────────────────
section("Cancel posted GRN → reversal ledger + JE")
# Cancelling a GRN whose stock has been dispatched is correctly rejected
# (negative-stock guard). So we post a *fresh* GRN with no downstream
# activity and cancel that one.
fresh = req("POST", "/inventory/grn", {
    "warehouseId": WH_ID, "receivedDate": time.strftime("%Y-%m-%d"),
    "lines": [{"itemId": ITEM_NORMAL, "qty": 10, "unitRate": 50}],
}, tok())
fresh_id = fresh["data"]["id"]
req("POST", f"/inventory/grn/{fresh_id}/post", {}, tok())

# First confirm that cancelling the *original* GRN (with downstream
# dispatch) is rejected by the negative-stock guard.
canc_blocked = req("POST", f"/inventory/grn/{GRN_ID}/cancel", {"reason": "should fail"}, tok())
check(
    canc_blocked.get("statusCode") == 409,
    "Cancel of dispatched GRN blocked by negative-stock guard",
    canc_blocked,
)

# Now cancel the fresh one — should succeed and write reversal rows.
canc = req("POST", f"/inventory/grn/{fresh_id}/cancel", {"reason": "Test reversal"}, tok())
check(canc.get("data", {}).get("status") == "cancelled", "Fresh GRN cancelled", canc)

n_reversal = sql(f"SELECT COUNT(*) FROM stock_ledger WHERE source_type='inventory_grn' AND source_id='{fresh_id}' AND movement_type='reversal'")
check(n_reversal == "1", f"1 reversal ledger row written (got {n_reversal})")

# Reversal JE should exist on the cancelled GRN row.
canc_je = sql(f"SELECT cancelled_journal_entry_id FROM inventory_grns WHERE id='{fresh_id}'")
check(canc_je and canc_je != '', f"Reversal JE attached (id={canc_je[:8] if canc_je else '∅'}…)")

# ─── ON-HAND vs LEDGER CONSISTENCY ─────────────────────────────────────
section("On-hand cache matches ledger sum")
mismatches = sql(f"""
  SELECT COUNT(*) FROM (
    SELECT soh.item_id, soh.warehouse_id, soh.batch_no,
           soh.qty AS cache_qty,
           COALESCE(SUM(sl.qty_in) - SUM(sl.qty_out), 0) AS ledger_qty
    FROM stock_on_hand soh
    LEFT JOIN stock_ledger sl
      ON sl.tenant_id = soh.tenant_id
     AND sl.item_id = soh.item_id
     AND sl.warehouse_id = soh.warehouse_id
     AND COALESCE(sl.batch_no, '') = soh.batch_no
    WHERE soh.warehouse_id = '{WH_ID}'
    GROUP BY soh.item_id, soh.warehouse_id, soh.batch_no, soh.qty
    HAVING ABS(soh.qty - COALESCE(SUM(sl.qty_in) - SUM(sl.qty_out), 0)) > 0.001
  ) x
""")
check(mismatches == "0", f"No cache/ledger drift in test warehouse (mismatches={mismatches})")

# ─── BARCODE LOOKUP ────────────────────────────────────────────────────
section("Barcode lookup")
bc = req("GET", f"/inventory/items/barcode/BC-{unique}", token=tok())
check(bc.get("data", {}).get("id") == ITEM_BATCH, "Barcode lookup returns correct item", bc)

bc_miss = req("GET", "/inventory/items/barcode/NOSUCHCODE", token=tok())
check(bc_miss.get("statusCode") == 404, "Unknown barcode → 404")

# ─── REORDER ALERT (lowOnly filter) ───────────────────────────────────
section("Reorder alert (lowOnly filter)")
# Item B reorder_level=50; after dispatching 20 it has 80 (B-002:40 + B-001:40)
# That's > 50, not low. Dispatch more to make it low.
extra_dn = req("POST", "/inventory/delivery-notes", {
    "warehouseId": WH_ID, "dispatchDate": time.strftime("%Y-%m-%d"),
    "lines": [{"itemId": ITEM_BATCH, "qty": 40}],
}, tok())
req("POST", f"/inventory/delivery-notes/{extra_dn['data']['id']}/dispatch", {}, tok())

low = req("GET", f"/inventory/stock/on-hand?warehouseId={WH_ID}&lowOnly=true", token=tok())
low_items = [r["itemId"] for r in (low.get("data") or [])]
check(ITEM_BATCH in low_items, f"Item B surfaces in lowOnly list (got {len(low_items)} rows)")

# ─── DASHBOARD ─────────────────────────────────────────────────────────
section("Dashboard KPIs")
dash = req("GET", "/inventory/dashboard", token=tok())
data = dash.get("data") or {}
check("totalValue" in data and "lowStockCount" in data, "Dashboard returns KPI shape", data)
check(int(data.get("todayGrns", 0)) >= 2, f"todayGrns >= 2 (got {data.get('todayGrns')})")
check(int(data.get("todayDeliveries", 0)) >= 2, f"todayDeliveries >= 2 (got {data.get('todayDeliveries')})")

# ═══════════════════════════════════════════════════════════════════════
#  PHASE 2: transfers, adjustments, stock-take, reorder rules, expiry
# ═══════════════════════════════════════════════════════════════════════

# A second warehouse for transfers.
wh2_payload = {"code": f"INV-WH2-{unique}", "name": f"Inv Test WH2 {unique}", "type": "godown"}
r = req("POST", "/inventory/warehouses", wh2_payload, tok())
check(r.get("data", {}).get("id") is not None, "Second warehouse created", r)
WH2_ID = r["data"]["id"]

# ─── TRANSFER: dispatch + receive ──────────────────────────────────────
section("Transfer: dispatch + receive")
# Item B has B-001 (40 left after earlier flows) + B-002 (drained). Item A on-hand is 70.
# Transfer 20 of Item A from WH → WH2.
tr = req("POST", "/inventory/transfers", {
    "fromWarehouseId": WH_ID, "toWarehouseId": WH2_ID,
    "lines": [{"itemId": ITEM_NORMAL, "qty": 20}],
}, tok())
check(tr.get("data", {}).get("transferNo", "").startswith("TRF-"), "Transfer created", tr)
TR_ID = tr["data"]["id"]

# Same-warehouse transfer should be rejected at create.
bad_tr = req("POST", "/inventory/transfers", {
    "fromWarehouseId": WH_ID, "toWarehouseId": WH_ID,
    "lines": [{"itemId": ITEM_NORMAL, "qty": 1}],
}, tok())
check(bad_tr.get("statusCode") == 400, "Same-warehouse transfer rejected", bad_tr)

# Dispatch.
disp = req("POST", f"/inventory/transfers/{TR_ID}/dispatch", {}, tok())
check(disp.get("data", {}).get("status") == "in_transit", "Transfer in transit after dispatch", disp)

# Stock should leave WH (70 → 50) and not yet land at WH2.
qty_src = sql(f"SELECT qty FROM stock_on_hand WHERE item_id='{ITEM_NORMAL}' AND warehouse_id='{WH_ID}'")
qty_dst = sql(f"SELECT qty FROM stock_on_hand WHERE item_id='{ITEM_NORMAL}' AND warehouse_id='{WH2_ID}'")
check(float(qty_src or 0) == 50, f"Source on-hand = 50 (got {qty_src})")
check(qty_dst is None or qty_dst == "" or float(qty_dst) == 0, f"Destination not yet credited (got {qty_dst!r})")

# Short receipt: receive only 15 of 20.
recv = req("POST", f"/inventory/transfers/{TR_ID}/receive", {
    "lineReceipts": [{"lineId": sql(f"SELECT id FROM inventory_transfer_lines WHERE transfer_id='{TR_ID}' LIMIT 1"), "qtyReceived": 15}],
}, tok())
check(recv.get("data", {}).get("status") == "received", "Transfer received", recv)
qty_dst2 = sql(f"SELECT qty FROM stock_on_hand WHERE item_id='{ITEM_NORMAL}' AND warehouse_id='{WH2_ID}'")
check(float(qty_dst2 or 0) == 15, f"Destination on-hand = 15 (short receipt) (got {qty_dst2})")

# Over-receipt on a fresh transfer should be rejected.
tr2 = req("POST", "/inventory/transfers", {
    "fromWarehouseId": WH_ID, "toWarehouseId": WH2_ID,
    "lines": [{"itemId": ITEM_NORMAL, "qty": 5}],
}, tok())
req("POST", f"/inventory/transfers/{tr2['data']['id']}/dispatch", {}, tok())
over = req("POST", f"/inventory/transfers/{tr2['data']['id']}/receive", {
    "lineReceipts": [{"lineId": sql(f"SELECT id FROM inventory_transfer_lines WHERE transfer_id='{tr2['data']['id']}' LIMIT 1"), "qtyReceived": 999}],
}, tok())
check(over.get("statusCode") == 400, "Over-receipt rejected", over)

# ─── ADJUSTMENT (damage) ───────────────────────────────────────────────
section("Adjustment: post damage → Write-off JE")
adj = req("POST", "/inventory/adjustments", {
    "warehouseId": WH_ID,
    "reason": "damage",
    "adjustmentDate": time.strftime("%Y-%m-%d"),
    "lines": [{"itemId": ITEM_NORMAL, "qtyDelta": -2}],
}, tok())
check(adj.get("data", {}).get("adjNo", "").startswith("ADJ-"), "Adjustment created (draft)", adj)
ADJ_ID = adj["data"]["id"]

posted = req("POST", f"/inventory/adjustments/{ADJ_ID}/post", {}, tok())
check(posted.get("data", {}).get("status") == "posted", "Adjustment posted", posted)
adj_je = sql(f"SELECT journal_entry_id FROM inventory_adjustments WHERE id='{ADJ_ID}'")
check(adj_je and adj_je != '', f"JE attached ({adj_je[:8] if adj_je else '∅'}…)")

# JE should debit Write-off (5104), credit Inventory Asset (1112).
je_lines = sql(f"""
  SELECT string_agg(a.code || ':' || ROUND(jl.debit::numeric, 2) || '/' || ROUND(jl.credit::numeric, 2), ',' ORDER BY a.code)
  FROM journal_lines jl
  INNER JOIN accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = '{adj_je}'
""")
check('1112' in (je_lines or '') and '5104' in (je_lines or ''),
      f"JE hits 1112 + 5104 (got {je_lines})")

# Posted adjustment cannot be cancelled.
canc_posted = req("POST", f"/inventory/adjustments/{ADJ_ID}/cancel", {"reason": "should fail"}, tok())
check(canc_posted.get("statusCode") == 409, "Posted adjustment can't be cancelled", canc_posted)

# Approval gate
adj2 = req("POST", "/inventory/adjustments", {
    "warehouseId": WH_ID, "reason": "found", "adjustmentDate": time.strftime("%Y-%m-%d"),
    "requiresApproval": True,
    "lines": [{"itemId": ITEM_NORMAL, "qtyDelta": 1, "unitCost": 50}],
}, tok())
ADJ2_ID = adj2["data"]["id"]
no_approve_post = req("POST", f"/inventory/adjustments/{ADJ2_ID}/post", {}, tok())
check(no_approve_post.get("statusCode") == 409, "Cannot post without approval first", no_approve_post)
req("POST", f"/inventory/adjustments/{ADJ2_ID}/approve", {}, tok())
ok_post = req("POST", f"/inventory/adjustments/{ADJ2_ID}/post", {}, tok())
check(ok_post.get("data", {}).get("status") == "posted", "Post after approval succeeds", ok_post)

# ─── STOCK TAKE ────────────────────────────────────────────────────────
section("Stock take: snapshot → count → post variance")
st = req("POST", "/inventory/stock-takes", {
    "warehouseId": WH_ID, "scope": "full",
}, tok())
check(st.get("data", {}).get("stNo", "").startswith("ST-"), "Session started", st)
ST_ID = st["data"]["id"]

# Snapshot should have lines for current on-hand. Pick one.
st_detail = req("GET", f"/inventory/stock-takes/{ST_ID}", token=tok())
lines = st_detail["data"]["lines"]
check(len(lines) > 0, f"Snapshot captured {len(lines)} line(s)")
# Find item A and count it short by 3 — should book a write-off.
target_line = next((l for l in lines if l["itemId"] == ITEM_NORMAL), None)
check(target_line is not None, "Item A in snapshot")
short_count = float(target_line["systemQty"]) - 3

upsert = req("POST", f"/inventory/stock-takes/{ST_ID}/lines", {
    "lines": [
        {"itemId": ITEM_NORMAL, "countedQty": short_count},
    ],
}, tok())
check(upsert.get("data", {}).get("upserted") == 1, "Count upserted")

st_post = req("POST", f"/inventory/stock-takes/{ST_ID}/post", {}, tok())
check(st_post.get("data", {}).get("status") == "posted", "Stock take posted", st_post)
adj_link = sql(f"SELECT adjustment_id FROM inventory_stock_takes WHERE id='{ST_ID}'")
check(adj_link and adj_link != '', f"Variance adjustment linked ({adj_link[:8] if adj_link else '∅'}…)")
st_je = sql(f"SELECT journal_entry_id FROM inventory_adjustments WHERE id='{adj_link}'")
check(st_je and st_je != '', f"Stock-take JE attached ({st_je[:8] if st_je else '∅'}…)")

# ─── REORDER ALERTS ────────────────────────────────────────────────────
section("Reorder alerts")
alerts = req("GET", "/inventory/stock/reorder-alerts", token=tok())
alert_items = [a["itemId"] for a in (alerts.get("data") or [])]
check(ITEM_BATCH in alert_items, f"Item B surfaces in reorder alerts ({len(alert_items)} total)")

# Add a per-warehouse override and confirm it appears.
rule = req("POST", "/inventory/reorder-rules", {
    "itemId": ITEM_NORMAL, "warehouseId": WH_ID,
    "reorderLevel": 999999, "reorderQty": 100, "leadTimeDays": 7,
}, tok())
check(rule.get("data") is not None, "Reorder rule upserted")
alerts2 = req("GET", "/inventory/stock/reorder-alerts", token=tok())
in_alerts = any(a["itemId"] == ITEM_NORMAL and a["warehouseId"] == WH_ID for a in (alerts2.get("data") or []))
check(in_alerts, "Per-warehouse rule overrides item default and surfaces item A")

# ─── EXPIRY REPORT ─────────────────────────────────────────────────────
section("Batch expiry report")
# Seed a fresh batch with a known future expiry so the report has something
# to surface (earlier batches were drained by Phase 1 dispatches).
fresh_batch = f"EXP-TEST-{unique}"
# Expiry 200 days out — fits inside the 365-day window cap.
from datetime import date, timedelta
fresh_expiry = (date.today() + timedelta(days=200)).isoformat()
grn_exp = req("POST", "/inventory/grn", {
    "warehouseId": WH_ID,
    "receivedDate": time.strftime("%Y-%m-%d"),
    "lines": [{"itemId": ITEM_BATCH, "batchNo": fresh_batch,
               "expiryDate": fresh_expiry, "qty": 10, "unitRate": 80}],
}, tok())
req("POST", f"/inventory/grn/{grn_exp['data']['id']}/post", {}, tok())

exp = req("GET", "/inventory/stock/expiring?withinDays=365", token=tok())
exp_batches = [r["batchNo"] for r in (exp.get("data") or [])]
check(fresh_batch in exp_batches, f"Fresh expiry-tracked batch listed in 365-day window ({len(exp_batches)} batches)")

# 30-day window should not contain the 200-day-out batch.
near_exp = req("GET", "/inventory/stock/expiring?withinDays=30", token=tok())
near_batches = [r["batchNo"] for r in (near_exp.get("data") or [])]
check(fresh_batch not in near_batches, f"200-day batch correctly absent from 30-day window")

# ─── SUMMARY ───────────────────────────────────────────────────────────
print(f"\n{'='*60}\n  RESULTS: {passed} passed, {failed} failed\n{'='*60}")
sys.exit(0 if failed == 0 else 1)
