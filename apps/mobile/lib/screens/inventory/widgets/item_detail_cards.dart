// Cards for the Inventory Item Detail screen. Split out of
// inventory_item_detail_screen.dart so each surface (identity, stock level,
// pricing, tracking, attributes) stays readable and the screen file stays
// under the size cap.
//
// Every card renders only what the item actually carries — a service SKU
// with no batch tracking shows neither a stock-level bar nor a tracking
// grid, so the page never pads itself with empty rows.

library;

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';
import 'item_detail_primitives.dart';

// The screen builds its own cards from these too, so re-export rather
// than making every call site import both files.
export 'item_detail_primitives.dart';
export 'item_detail_pricing.dart';

// ── Identity ─────────────────────────────────────────────────────────────

/// Avatar + name + the identifiers that tell two similar SKUs apart:
/// class, SKU, unit / pack size, HSN, EAN, and an Inactive flag.
class ItemIdentityCard extends StatelessWidget {
  const ItemIdentityCard({super.key, required this.item, required this.classLabel});
  final InvItemDetail item;
  final String? classLabel;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // The stock UoM is what this item *is* — every quantity in the app is
    // counted in it. Pack size is the GST measure (UQC), normalised for the
    // GSTR-1 HSN summary, and `packSizeValue` is NOT NULL DEFAULT 1: a 500ml
    // pack sits in the master as "1 LTR". Preferring it put that default
    // under the name and contradicted every other screen. Same rule as
    // invoice-form.tsx — unit first, pack only as a fallback, and a pack
    // value of 1 carries no information.
    final unit = item.unit?.trim();
    final packIsMeaningful =
        item.packSizeValue != null && item.packSizeValue != 1;
    final pack = item.packSizeValue != null
        ? '${fmtQty(item.packSizeValue!)} ${item.packSizeUqc ?? unit ?? ''}'.trim()
        : null;
    final uom = (unit != null && unit.isNotEmpty) ? unit : pack;
    return InvCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: InvColors.amberSubtle,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  item.type == 'service'
                      ? Icons.handyman_outlined
                      : Icons.inventory_2_outlined,
                  size: 22,
                  color: InvColors.brand(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name, style: RunqText.h3.copyWith(color: t.ink)),
                    // Pack size (falling back to the stock UoM) sits under the
                    // name — how the item is sold is part of what it is, and it
                    // reads better as a subtitle than as one more grey chip. The
                    // class ("Finished good") takes the freed chip slot.
                    if (uom != null && uom.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        uom,
                        style: RunqText.caption.copyWith(color: t.muted),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              if (!item.isActive)
                ItemBadge(
                  label: 'Inactive',
                  bg: InvColors.errorBg,
                  fg: InvColors.error,
                ),
              if ((item.sku ?? '').isNotEmpty)
                ItemBadge(label: item.sku!, bg: t.bgWarmer, fg: t.muted),
              if ((item.hsnSacCode ?? '').isNotEmpty)
                ItemBadge(
                  label: 'HSN ${item.hsnSacCode}',
                  bg: InvColors.amberSubtle,
                  fg: InvColors.amberDeep,
                ),
              // The GST pack size, beside the other GST identifier — but only
              // when it says something the default doesn't.
              if (packIsMeaningful && pack != null && pack.isNotEmpty)
                ItemBadge(
                  label: 'Pack $pack',
                  bg: InvColors.amberSubtle,
                  fg: InvColors.amberDeep,
                ),
              if (classLabel != null && classLabel!.isNotEmpty)
                ItemBadge(label: classLabel!, bg: t.bgWarmer, fg: t.ink),
              if ((item.ean ?? '').isNotEmpty)
                ItemBadge(label: 'EAN ${item.ean}', bg: t.bgWarmer, fg: t.muted),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Stock level ──────────────────────────────────────────────────────────

/// On-hand vs the item's reorder point. When no threshold is configured the
/// bar renders neutral and says so rather than implying a healthy level.
class ItemStockLevelCard extends StatelessWidget {
  const ItemStockLevelCard({
    super.key,
    required this.qty,
    required this.reorderLevel,
    required this.reorderQty,
    this.onEditThreshold,
  });
  final double qty;
  final double? reorderLevel;
  final double? reorderQty;

  /// Opens the threshold editor. Null hides the affordance (read-only use).
  final VoidCallback? onEditThreshold;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final level = (reorderLevel ?? 0) > 0 ? reorderLevel : null;
    final isOut = qty <= 0;
    // Out of stock reads as low whether or not a threshold exists — an empty
    // shelf must never render in the healthy colour just because nobody set
    // a reorder level.
    final isLow = isOut || (level != null && qty <= level);
    final shortfall = level == null ? 0.0 : (level - qty);
    return InvCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Stock Level',
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                ),
              ),
              Text(
                fmtQty(qty),
                style: RunqText.h4.copyWith(
                  color: isOut
                      ? InvColors.error
                      : isLow
                          ? InvColors.orangeAlert
                          : InvColors.success,
                ),
              ),
              if (onEditThreshold != null)
                IconButton(
                  onPressed: onEditThreshold,
                  icon: Icon(Icons.tune_rounded, size: 17, color: t.muted),
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.only(left: 6),
                  constraints: const BoxConstraints(),
                  tooltip: 'Set low-stock threshold',
                ),
            ],
          ),
          const SizedBox(height: 8),
          InvStockBar(
            qty: qty,
            reorderLevel: level,
            isLow: isLow,
            height: 6,
            // The threshold rides the bar in its own badge, so the row below
            // carries only what the mark can't say (shortfall, order qty).
            markerLabel: level == null ? null : fmtQty(level),
          ),
          const SizedBox(height: 4),
          if (level == null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    'No low-stock threshold set for this item',
                    style: RunqText.caption.copyWith(color: t.muted2),
                  ),
                ),
                if (onEditThreshold != null)
                  TextButton(
                    onPressed: onEditThreshold,
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: const Size(0, 30),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text('Set',
                        style: RunqText.caption.copyWith(
                          color: InvColors.brand(context),
                          fontWeight: FontWeight.w700,
                        )),
                  ),
              ],
            )
          else if (isLow || (reorderQty ?? 0) > 0)
            Row(
              children: [
                Expanded(
                  child: Text(
                    isLow
                        ? 'Below reorder point — short by ${fmtQty(shortfall)}'
                        : '',
                    style: RunqText.caption.copyWith(color: InvColors.orangeAlert),
                  ),
                ),
                if ((reorderQty ?? 0) > 0)
                  Text(
                    'Order ${fmtQty(reorderQty!)}',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

// ── Tracking & classification ────────────────────────────────────────────

/// How the item behaves in the ledger — inventory / batch / expiry / serial
/// flags as on-off chips — plus where it sits in the category tree.
class ItemTrackingCard extends StatelessWidget {
  const ItemTrackingCard({super.key, required this.item});
  final InvItemDetail item;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = <Widget>[
      if ((item.category ?? '').isNotEmpty)
        ItemKvRow(
          label: 'Category',
          value: [item.category, item.subcategory]
              .where((s) => (s ?? '').isNotEmpty)
              .join(' › '),
        ),
      if ((item.batchCodeTemplate ?? '').isNotEmpty)
        ItemKvRow(label: 'Batch code', value: item.batchCodeTemplate!),
    ];
    return InvCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              ItemTrackChip(label: 'Inventory', on: item.trackInventory),
              ItemTrackChip(label: 'Batches', on: item.trackBatches),
              ItemTrackChip(label: 'Expiry', on: item.trackExpiry),
              ItemTrackChip(label: 'Serials', on: item.trackSerials),
            ],
          ),
          if (rows.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(height: 1, color: t.hairlineSoft),
            const SizedBox(height: 4),
            ItemKvList(rows: rows),
          ],
        ],
      ),
    );
  }
}

// ── Catalogue attributes ─────────────────────────────────────────────────

/// Tenant-defined attributes (brand, packing type, size…). Keys come from
/// the tenant's attribute schema, so labels are humanised from the key.
class ItemAttributesCard extends StatelessWidget {
  const ItemAttributesCard({super.key, required this.attributes});
  final Map<String, dynamic> attributes;

  static bool hasData(Map<String, dynamic> a) => entriesOf(a).isNotEmpty;

  /// Non-empty attribute pairs, in schema order.
  static List<MapEntry<String, String>> entriesOf(Map<String, dynamic> a) {
    final out = <MapEntry<String, String>>[];
    for (final e in a.entries) {
      final v = e.value;
      if (v == null) continue;
      final s = v is bool ? (v ? 'Yes' : 'No') : v.toString().trim();
      if (s.isEmpty) continue;
      out.add(MapEntry(humanKey(e.key), s));
    }
    return out;
  }

  /// `packingType` / `packing_type` → `Packing type`.
  static String humanKey(String key) {
    final spaced = key
        .replaceAll('_', ' ')
        .replaceAllMapped(RegExp(r'(?<=[a-z0-9])([A-Z])'), (m) => ' ${m[1]!.toLowerCase()}');
    if (spaced.isEmpty) return key;
    return spaced[0].toUpperCase() + spaced.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    return InvCard(
      child: ItemKvList(
        rows: [
          for (final e in entriesOf(attributes))
            ItemKvRow(label: e.key, value: e.value),
        ],
      ),
    );
  }
}
