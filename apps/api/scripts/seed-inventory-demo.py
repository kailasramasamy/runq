#!/usr/bin/env python3
"""Inventory demo data seeder.

Builds a realistic dataset so all phases of the inventory module have
something to render: warehouses, items (mix of batch / expiry / serial /
none), opening receipts spread across recent dates, a few dispatches and
a transfer to seed movement history, an adjustment, an in-progress stock
take, near-expiry batches, low-stock items, a dead-stock candidate, and
serial-tracked units.

Idempotent: detects the sentinel warehouse 'DEMO-MAIN' and bails if it
already exists (drop it manually to reseed).

Run:
    python3 apps/api/scripts/seed-inventory-demo.py
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

API = "http://localhost:3003/api/v1"


# ─── HTTP helper ───────────────────────────────────────────────────────

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


def must(res, label):
    if "data" not in res:
        print(f"  ❌ {label}: {res}")
        sys.exit(1)
    return res["data"]


def info(msg): print(f"  · {msg}")
def section(t): print(f"\n=== {t} ===")


# ─── Auth ──────────────────────────────────────────────────────────────

section("Auth")
r = req("POST", "/auth/login",
        {"email": "appreview@runq.in", "password": "AppleReview2026!",
         "tenant": "runq-demo"})
TOKEN = must(r, "login")["token"]
info("Logged in as appreview@runq.in @ runq-demo")


# ─── Idempotency gate ──────────────────────────────────────────────────

section("Idempotency check")
existing = sql("SELECT code FROM warehouses WHERE code = 'DEMO-MAIN' LIMIT 1")
if existing == "DEMO-MAIN":
    print("  Demo data already seeded (warehouse DEMO-MAIN exists).")
    print("  To reseed: psql -U runq_app -d runq_dev -c \"DELETE FROM warehouses WHERE code LIKE 'DEMO-%';\"")
    print("  …then drop related ledger/cache rows or rebuild from scratch.")
    sys.exit(0)


# ─── Warehouses ────────────────────────────────────────────────────────

section("Warehouses")
WAREHOUSES = [
    {"code": "DEMO-MAIN", "name": "Main Godown", "type": "main", "isDefault": True,
     "address": "Plot 12, MIDC Phase II, Pune"},
    {"code": "DEMO-MUM", "name": "Mumbai Shop", "type": "shop",
     "address": "Shop 4, Linking Road, Bandra West, Mumbai"},
    {"code": "DEMO-DEL", "name": "Delhi Branch Godown", "type": "godown",
     "address": "Sector 18, Noida"},
    {"code": "DEMO-VAN1", "name": "Delivery Van 01", "type": "vehicle"},
    {"code": "DEMO-RETURNS", "name": "Returns Hold", "type": "virtual"},
]
wh_ids = {}
for w in WAREHOUSES:
    res = req("POST", "/inventory/warehouses", w, TOKEN)
    wh_ids[w["code"]] = must(res, f"warehouse {w['code']}")["id"]
    info(f"Created {w['code']} ({w['name']})")


# ─── Items ─────────────────────────────────────────────────────────────
# Mix: 6 chemicals (batch + expiry), 6 hardware (no batch), 4 perishables
# (batch + expiry, near expiry), 3 electronics (serials), 3 packing.

section("Items")
ITEMS = [
    # Chemicals — batch + expiry
    {"sku": "CHEM-CIT-1KG", "name": "Citric Acid 1kg", "category": "Chemicals",
     "unit": "Kg", "rate": 180, "sale": 240, "gst": 18,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 365,
     "reorder_level": 20, "reorder_qty": 50, "barcode": "8901234500001"},
    {"sku": "CHEM-SOD-5KG", "name": "Sodium Bicarbonate 5kg", "category": "Chemicals",
     "unit": "Kg", "rate": 95, "sale": 140, "gst": 18,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 730,
     "reorder_level": 10, "reorder_qty": 30, "barcode": "8901234500002"},
    {"sku": "CHEM-PERX-500", "name": "Hydrogen Peroxide 500ml", "category": "Chemicals",
     "unit": "Bottle", "rate": 75, "sale": 110, "gst": 18,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 180,
     "reorder_level": 30, "reorder_qty": 60, "barcode": "8901234500003"},
    {"sku": "CHEM-IPA-1L", "name": "Isopropyl Alcohol 1L", "category": "Chemicals",
     "unit": "Bottle", "rate": 240, "sale": 320, "gst": 18,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 1095,
     "reorder_level": 15, "reorder_qty": 40, "barcode": "8901234500004"},
    {"sku": "CHEM-DET-5L", "name": "Industrial Detergent 5L", "category": "Chemicals",
     "unit": "Can", "rate": 320, "sale": 440, "gst": 18,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 730,
     "reorder_level": 8, "reorder_qty": 20, "barcode": "8901234500005"},
    {"sku": "CHEM-ACET-500", "name": "Acetone 500ml", "category": "Chemicals",
     "unit": "Bottle", "rate": 110, "sale": 165, "gst": 18,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 730,
     "reorder_level": 12, "reorder_qty": 30, "barcode": "8901234500006"},

    # Hardware — no batch, no expiry
    {"sku": "HW-BOLT-M8", "name": "M8 Hex Bolt (50mm)", "category": "Hardware",
     "unit": "Piece", "rate": 6, "sale": 10, "gst": 18,
     "reorder_level": 200, "reorder_qty": 500, "barcode": "8901234600001"},
    {"sku": "HW-NUT-M8", "name": "M8 Hex Nut", "category": "Hardware",
     "unit": "Piece", "rate": 2, "sale": 4, "gst": 18,
     "reorder_level": 200, "reorder_qty": 500, "barcode": "8901234600002"},
    {"sku": "HW-WASH-M8", "name": "M8 Flat Washer", "category": "Hardware",
     "unit": "Piece", "rate": 1, "sale": 2, "gst": 18,
     "reorder_level": 300, "reorder_qty": 1000, "barcode": "8901234600003"},
    {"sku": "HW-WIRE-2.5", "name": "PVC Wire 2.5mm² (per metre)", "category": "Hardware",
     "unit": "Metre", "rate": 18, "sale": 26, "gst": 18,
     "reorder_level": 100, "reorder_qty": 500, "barcode": "8901234600004"},
    {"sku": "HW-TAPE-INS", "name": "Insulation Tape 20m", "category": "Hardware",
     "unit": "Roll", "rate": 22, "sale": 35, "gst": 18,
     "reorder_level": 25, "reorder_qty": 100, "barcode": "8901234600005"},
    {"sku": "HW-CABLE-TIE", "name": "Cable Tie 200mm", "category": "Hardware",
     "unit": "Piece", "rate": 1, "sale": 2, "gst": 18,
     "reorder_level": 200, "reorder_qty": 1000, "barcode": "8901234600006"},

    # Perishables — short shelf, used to trigger expiry report
    {"sku": "FOOD-OIL-1L", "name": "Edible Oil 1L", "category": "Food",
     "unit": "Bottle", "rate": 140, "sale": 175, "gst": 5,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 240,
     "reorder_level": 24, "reorder_qty": 60, "barcode": "8901234700001"},
    {"sku": "FOOD-FLOUR-25", "name": "Wheat Flour 25kg", "category": "Food",
     "unit": "Bag", "rate": 850, "sale": 1050, "gst": 5,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 180,
     "reorder_level": 5, "reorder_qty": 15, "barcode": "8901234700002"},
    {"sku": "FOOD-MILK-1L", "name": "Milk Powder 1kg", "category": "Food",
     "unit": "Pack", "rate": 380, "sale": 470, "gst": 5,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 365,
     "reorder_level": 15, "reorder_qty": 40, "barcode": "8901234700003"},
    {"sku": "FOOD-SUGAR-5", "name": "Sugar 5kg", "category": "Food",
     "unit": "Bag", "rate": 230, "sale": 280, "gst": 5,
     "track_batches": True, "track_expiry": True, "shelf_life_days": 720,
     "reorder_level": 10, "reorder_qty": 25, "barcode": "8901234700004"},

    # Electronics — serial tracked
    {"sku": "ELEC-METER-V1", "name": "Digital Multimeter V1", "category": "Electronics",
     "unit": "Piece", "rate": 1250, "sale": 1850, "gst": 18,
     "track_serials": True, "reorder_level": 5, "reorder_qty": 15,
     "barcode": "8901234800001"},
    {"sku": "ELEC-DRILL-12", "name": "12V Cordless Drill", "category": "Electronics",
     "unit": "Piece", "rate": 3200, "sale": 4500, "gst": 18,
     "track_serials": True, "reorder_level": 3, "reorder_qty": 8,
     "barcode": "8901234800002"},
    {"sku": "ELEC-LAMP-LED", "name": "LED Work Lamp 20W", "category": "Electronics",
     "unit": "Piece", "rate": 850, "sale": 1250, "gst": 18,
     "track_serials": True, "reorder_level": 4, "reorder_qty": 10,
     "barcode": "8901234800003"},

    # Packing — no batch, low value
    {"sku": "PACK-BOX-S", "name": "Carton Box (Small)", "category": "Packing",
     "unit": "Piece", "rate": 8, "sale": 14, "gst": 12,
     "reorder_level": 100, "reorder_qty": 300, "barcode": "8901234900001"},
    {"sku": "PACK-BUBBLE", "name": "Bubble Wrap 1m roll", "category": "Packing",
     "unit": "Roll", "rate": 35, "sale": 55, "gst": 12,
     "reorder_level": 30, "reorder_qty": 80, "barcode": "8901234900002"},
    {"sku": "PACK-TAPE-BR", "name": "Brown Packing Tape", "category": "Packing",
     "unit": "Roll", "rate": 22, "sale": 38, "gst": 12,
     "reorder_level": 40, "reorder_qty": 100, "barcode": "8901234900003"},

    # Dead-stock candidate (will receive 1 old GRN and no subsequent movement)
    {"sku": "DEAD-ROPE-OLD", "name": "Nylon Rope 10mm (legacy)", "category": "Hardware",
     "unit": "Metre", "rate": 25, "sale": 40, "gst": 18,
     "reorder_level": 50, "reorder_qty": 100, "barcode": "8901235000001"},
]

item_ids = {}
for it in ITEMS:
    body = {
        "name": it["name"], "sku": it["sku"], "type": "product",
        "unit": it["unit"], "packSizeUqc": "NOS",
        "defaultSellingPrice": it["sale"], "defaultPurchasePrice": it["rate"],
        "gstRate": it["gst"], "category": it.get("category"),
    }
    res = req("POST", "/masters/items", body, TOKEN)
    if "data" not in res:
        # If item already exists, look it up.
        existing_id = sql(
            f"SELECT id FROM items WHERE sku = '{it['sku']}' AND tenant_id = "
            f"(SELECT tenant_id FROM users WHERE email='appreview@runq.in') LIMIT 1"
        )
        if not existing_id:
            print(f"  ❌ Could not create or find item {it['sku']}: {res}")
            sys.exit(1)
        item_ids[it["sku"]] = existing_id
    else:
        item_ids[it["sku"]] = res["data"]["id"]
    # Apply inventory-tracking flags via SQL since the items REST endpoint
    # doesn't yet write them.
    sets = [
        f"track_inventory = TRUE",
        f"track_batches = {'TRUE' if it.get('track_batches') else 'FALSE'}",
        f"track_expiry = {'TRUE' if it.get('track_expiry') else 'FALSE'}",
        f"track_serials = {'TRUE' if it.get('track_serials') else 'FALSE'}",
        f"reorder_level = {it.get('reorder_level', 'NULL')}",
        f"reorder_qty = {it.get('reorder_qty', 'NULL')}",
        f"shelf_life_days = {it.get('shelf_life_days', 'NULL')}",
        f"barcode = '{it['barcode']}'",
    ]
    sql(f"UPDATE items SET {', '.join(sets)} WHERE id = '{item_ids[it['sku']]}'")
info(f"Created {len(ITEMS)} items with tracking flags + barcodes")


# ─── Initial GRNs to build stock ───────────────────────────────────────
# Date back the receipts to spread the movement report across recent weeks.

section("Opening receipts (GRNs)")
today = date.today()

def post_grn(received_date, warehouse_code, lines, label):
    body = {
        "warehouseId": wh_ids[warehouse_code],
        "receivedDate": received_date.isoformat(),
        "lines": lines,
    }
    res = req("POST", "/inventory/grn", body, TOKEN)
    grn_id = must(res, label)["id"]
    res = req("POST", f"/inventory/grn/{grn_id}/post", {}, TOKEN)
    must(res, f"{label} post")
    info(f"  {label} ({received_date.isoformat()})")
    return grn_id

# 25 days ago — bulk opening at main godown
post_grn(today - timedelta(days=25), "DEMO-MAIN", [
    {"itemId": item_ids["CHEM-CIT-1KG"], "batchNo": "CIT-2401",
     "expiryDate": (today + timedelta(days=320)).isoformat(),
     "qty": 80, "unitRate": 180},
    {"itemId": item_ids["CHEM-SOD-5KG"], "batchNo": "SOD-2402",
     "expiryDate": (today + timedelta(days=600)).isoformat(),
     "qty": 40, "unitRate": 95},
    {"itemId": item_ids["CHEM-IPA-1L"], "batchNo": "IPA-2401",
     "expiryDate": (today + timedelta(days=900)).isoformat(),
     "qty": 60, "unitRate": 240},
    {"itemId": item_ids["HW-BOLT-M8"], "qty": 2000, "unitRate": 6},
    {"itemId": item_ids["HW-NUT-M8"], "qty": 2000, "unitRate": 2},
    {"itemId": item_ids["HW-WASH-M8"], "qty": 3000, "unitRate": 1},
    {"itemId": item_ids["PACK-BOX-S"], "qty": 500, "unitRate": 8},
    {"itemId": item_ids["PACK-BUBBLE"], "qty": 120, "unitRate": 35},
], "Opening — bulk")

# 18 days ago — perishables with varied expiries (some short for the expiry report)
post_grn(today - timedelta(days=18), "DEMO-MAIN", [
    {"itemId": item_ids["FOOD-OIL-1L"], "batchNo": "OIL-NEAR",
     "expiryDate": (today + timedelta(days=20)).isoformat(),  # ← near-expiry
     "qty": 30, "unitRate": 140},
    {"itemId": item_ids["FOOD-FLOUR-25"], "batchNo": "FLR-NEAR",
     "expiryDate": (today + timedelta(days=12)).isoformat(),  # ← very near
     "qty": 8, "unitRate": 850},
    {"itemId": item_ids["FOOD-MILK-1L"], "batchNo": "MLK-2401",
     "expiryDate": (today + timedelta(days=200)).isoformat(),
     "qty": 50, "unitRate": 380},
    {"itemId": item_ids["FOOD-SUGAR-5"], "batchNo": "SUG-2401",
     "expiryDate": (today + timedelta(days=500)).isoformat(),
     "qty": 25, "unitRate": 230},
], "Perishables")

# 14 days ago — Mumbai shop + Delhi branch openings
post_grn(today - timedelta(days=14), "DEMO-MUM", [
    {"itemId": item_ids["CHEM-PERX-500"], "batchNo": "PERX-MUM-01",
     "expiryDate": (today + timedelta(days=150)).isoformat(),
     "qty": 60, "unitRate": 75},
    {"itemId": item_ids["HW-TAPE-INS"], "qty": 80, "unitRate": 22},
    {"itemId": item_ids["HW-CABLE-TIE"], "qty": 500, "unitRate": 1},
    {"itemId": item_ids["PACK-TAPE-BR"], "qty": 60, "unitRate": 22},
], "Mumbai opening")

post_grn(today - timedelta(days=12), "DEMO-DEL", [
    {"itemId": item_ids["CHEM-DET-5L"], "batchNo": "DET-DEL-01",
     "expiryDate": (today + timedelta(days=650)).isoformat(),
     "qty": 18, "unitRate": 320},
    {"itemId": item_ids["CHEM-ACET-500"], "batchNo": "ACE-DEL-01",
     "expiryDate": (today + timedelta(days=600)).isoformat(),
     "qty": 25, "unitRate": 110},
    {"itemId": item_ids["HW-WIRE-2.5"], "qty": 400, "unitRate": 18},
], "Delhi opening")

# 7 days ago — fresh batch (newer cost, demonstrates WA shift)
post_grn(today - timedelta(days=7), "DEMO-MAIN", [
    {"itemId": item_ids["CHEM-CIT-1KG"], "batchNo": "CIT-2502",
     "expiryDate": (today + timedelta(days=355)).isoformat(),
     "qty": 50, "unitRate": 195},  # cost rose 180→195
    {"itemId": item_ids["FOOD-MILK-1L"], "batchNo": "MLK-2502",
     "expiryDate": (today + timedelta(days=340)).isoformat(),
     "qty": 30, "unitRate": 395},
], "Top-up receipt (WA cost shifts)")

# 60 days ago — dead-stock seed (no subsequent movement → triggers dead-stock report)
post_grn(today - timedelta(days=120), "DEMO-MAIN", [
    {"itemId": item_ids["DEAD-ROPE-OLD"], "qty": 75, "unitRate": 25},
], "Dead-stock candidate (120 days old)")

# Serial-tracked GRN
section("Serial-tracked receipt")
serial_grn = req("POST", "/inventory/grn", {
    "warehouseId": wh_ids["DEMO-MAIN"],
    "receivedDate": (today - timedelta(days=10)).isoformat(),
    "lines": [
        {
            "itemId": item_ids["ELEC-METER-V1"],
            "qty": 6, "unitRate": 1250,
            "serialNos": [f"MTR-{2025000 + i}" for i in range(6)],
        },
        {
            "itemId": item_ids["ELEC-DRILL-12"],
            "qty": 4, "unitRate": 3200,
            "serialNos": [f"DRL-{8810 + i}" for i in range(4)],
        },
        {
            "itemId": item_ids["ELEC-LAMP-LED"],
            "qty": 5, "unitRate": 850,
            "serialNos": [f"LMP-{3300 + i}" for i in range(5)],
        },
    ],
}, TOKEN)
sg_id = must(serial_grn, "serial GRN")["id"]
req("POST", f"/inventory/grn/{sg_id}/post", {}, TOKEN)
info("15 serials captured (6 meters + 4 drills + 5 lamps)")


# ─── Dispatches (delivery notes) ───────────────────────────────────────

section("Dispatches (delivery notes)")

def post_dn(dispatch_date, warehouse_code, lines, label):
    body = {
        "warehouseId": wh_ids[warehouse_code],
        "dispatchDate": dispatch_date.isoformat(),
        "lines": lines,
    }
    res = req("POST", "/inventory/delivery-notes", body, TOKEN)
    dn_id = must(res, label)["id"]
    res = req("POST", f"/inventory/delivery-notes/{dn_id}/dispatch", {}, TOKEN)
    must(res, f"{label} dispatch")
    info(f"  {label} ({dispatch_date.isoformat()})")
    return dn_id

# Recent dispatches to thin stock + create movement-report rows
post_dn(today - timedelta(days=20), "DEMO-MAIN", [
    {"itemId": item_ids["CHEM-CIT-1KG"], "qty": 12},  # FEFO will pick CIT-2401
    {"itemId": item_ids["HW-BOLT-M8"], "qty": 400},
    {"itemId": item_ids["HW-NUT-M8"], "qty": 400},
], "Dispatch — customer A")

post_dn(today - timedelta(days=15), "DEMO-MAIN", [
    {"itemId": item_ids["CHEM-SOD-5KG"], "qty": 10},
    {"itemId": item_ids["HW-WASH-M8"], "qty": 1000},
    {"itemId": item_ids["PACK-BOX-S"], "qty": 100},
], "Dispatch — customer B")

post_dn(today - timedelta(days=10), "DEMO-MUM", [
    {"itemId": item_ids["CHEM-PERX-500"], "qty": 20},
    {"itemId": item_ids["HW-TAPE-INS"], "qty": 25},
], "Mumbai retail dispatch")

post_dn(today - timedelta(days=5), "DEMO-MAIN", [
    {"itemId": item_ids["CHEM-CIT-1KG"], "qty": 25},  # WA after second receipt
    {"itemId": item_ids["FOOD-MILK-1L"], "qty": 15},
    {"itemId": item_ids["HW-BOLT-M8"], "qty": 800},
], "Dispatch — customer C")

post_dn(today - timedelta(days=2), "DEMO-MAIN", [
    {"itemId": item_ids["CHEM-IPA-1L"], "qty": 8},
    {"itemId": item_ids["PACK-BUBBLE"], "qty": 30},
], "Dispatch — customer D")


# ─── Transfer (in-transit) ─────────────────────────────────────────────

section("Transfer")
t_res = req("POST", "/inventory/transfers", {
    "fromWarehouseId": wh_ids["DEMO-MAIN"],
    "toWarehouseId": wh_ids["DEMO-DEL"],
    "vehicleNo": "MH-12-AB-9988",
    "notes": "Weekly Pune→Delhi top-up",
    "lines": [
        {"itemId": item_ids["CHEM-CIT-1KG"], "batchNo": "CIT-2401", "qty": 10},
        {"itemId": item_ids["HW-BOLT-M8"], "qty": 200},
    ],
}, TOKEN)
t_id = must(t_res, "transfer")["id"]
req("POST", f"/inventory/transfers/{t_id}/dispatch", {}, TOKEN)
info("In-transit transfer DEMO-MAIN → DEMO-DEL (use the row Receive action to complete)")

# Also a completed transfer so the list isn't all in-transit
t2_res = req("POST", "/inventory/transfers", {
    "fromWarehouseId": wh_ids["DEMO-MAIN"],
    "toWarehouseId": wh_ids["DEMO-MUM"],
    "lines": [{"itemId": item_ids["HW-CABLE-TIE"], "qty": 100}],
}, TOKEN)
t2_id = must(t2_res, "transfer 2")["id"]
req("POST", f"/inventory/transfers/{t2_id}/dispatch", {}, TOKEN)
req("POST", f"/inventory/transfers/{t2_id}/receive", {}, TOKEN)
info("Completed transfer DEMO-MAIN → DEMO-MUM")


# ─── Adjustment (damage write-off, posted) ─────────────────────────────

section("Adjustment")
adj_res = req("POST", "/inventory/adjustments", {
    "warehouseId": wh_ids["DEMO-MAIN"],
    "reason": "damage",
    "adjustmentDate": (today - timedelta(days=3)).isoformat(),
    "notes": "Pallet drop — 2 bottles broken",
    "lines": [
        {"itemId": item_ids["CHEM-IPA-1L"], "batchNo": "IPA-2401", "qtyDelta": -2},
    ],
}, TOKEN)
adj_id = must(adj_res, "adjustment")["id"]
req("POST", f"/inventory/adjustments/{adj_id}/post", {}, TOKEN)
info("Posted damage write-off (2 units IPA-1L)")


# ─── Stock take (in-progress, ready to count) ──────────────────────────

section("Stock take")
st_res = req("POST", "/inventory/stock-takes", {
    "warehouseId": wh_ids["DEMO-MUM"], "scope": "full",
    "notes": "Weekly count — Mumbai shop",
}, TOKEN)
st_id = must(st_res, "stock take")["id"]
info(f"Started session at Mumbai (id ends …{st_id[-4:]}) — counted snapshot ready")
info("  → Open on mobile or web and start counting")


# ─── Reorder rule override ─────────────────────────────────────────────

section("Reorder rule")
req("POST", "/inventory/reorder-rules", {
    "itemId": item_ids["FOOD-MILK-1L"],
    "warehouseId": wh_ids["DEMO-MAIN"],
    "reorderLevel": 80,        # higher than item default to trigger alert
    "reorderQty": 100,
    "leadTimeDays": 5,
}, TOKEN)
info("Per-warehouse reorder rule set on FOOD-MILK-1L @ DEMO-MAIN (level=80)")


# ─── Verify reports have data ──────────────────────────────────────────

section("Verify reports")
checks = [
    ("Stock summary", "/inventory/reports/stock-summary"),
    ("Valuation", "/inventory/reports/valuation"),
    ("Ageing", "/inventory/reports/ageing"),
    ("Movement (last 30d)", "/inventory/reports/movement"),
    ("Dead stock (90+d)", "/inventory/reports/dead-stock?daysSinceMovement=90"),
    ("Reorder alerts", "/inventory/stock/reorder-alerts"),
    ("Expiring (30d)", "/inventory/stock/expiring?withinDays=30"),
    ("On-hand", "/inventory/stock/on-hand"),
]
for label, path in checks:
    res = req("GET", path, token=TOKEN)
    data = res.get("data")
    if isinstance(data, list):
        info(f"  {label}: {len(data)} row(s)")
    elif isinstance(data, dict) and "rows" in data:
        info(f"  {label}: {len(data['rows'])} row(s)")
    else:
        info(f"  {label}: ok")


# ─── Summary ───────────────────────────────────────────────────────────

print(f"""
{'═' * 60}
  Done. Seed includes:
    · {len(WAREHOUSES)} warehouses (1 default, 1 shop, 1 godown, 1 vehicle, 1 virtual)
    · {len(ITEMS)} items (batch, expiry, serial, plain mix)
    · 6 GRNs spanning 25 days (one 120-day-old for dead-stock report)
    · 5 delivery dispatches (COGS posted)
    · 1 in-transit transfer + 1 completed transfer
    · 1 posted damage adjustment
    · 1 in-progress stock take at Mumbai (open it to count)
    · 1 per-warehouse reorder rule override
    · 15 captured serials across 3 electronics SKUs
    · 2 near-expiry batches (12 days + 20 days out) for the expiry report

  Open http://localhost:4003/inventory and click through.
{'═' * 60}
""")
