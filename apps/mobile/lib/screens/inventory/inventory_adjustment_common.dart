// Shared pieces of the adjustment flow — reason vocabulary, qty formatting
// and the small form widgets. Extracted so the list screen, the line-entry
// screen and the item picker can share them instead of one importing
// another's private state.

import 'package:flutter/material.dart';

import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

const Map<String, String> invReasonLabels = {
  'damage': 'Damage',
  'expiry': 'Expiry',
  'theft': 'Theft',
  'found': 'Found',
  'revaluation': 'Revaluation',
  'correction': 'Correction',
  'opening_balance': 'Opening Balance',
  'free_issue': 'Extra for Damages',
  'other': 'Other',
};

/// The reason whose meaning lives in the note rather than in the label. The
/// sheet demands that note before it will post, and the audit trail prints it
/// in place of the word "other".
const String invOtherReason = 'other';

// 'free_issue' — labelled "Extra for damages": stock handed over without an
// invoice, the spare cases sent along so the receiver can absorb their own
// breakages (trade samples ride here too). Outbound like damage, but the
// goods are intact, so the backend books it to distribution cost (5106) not
// write-off, and GST §17(5)(h) requires the input tax on it to be reversed.
// The stored value stays `free_issue`; only the label speaks plainly.
// 'other' is deliberately absent, like 'correction': both can go either way,
// and this set is what always means stock left. Tinting an inbound "Other"
// red would be a lie the chip tells before anyone reads the number.
const Set<String> invOutboundReasons = {'damage', 'expiry', 'theft', 'free_issue'};

// Reasons split by direction. "correction" / "revaluation" appear on both
// sides because either intent is valid (system over-counted or under-counted).
// 'correction' leads because it is the outbound default — the highlighted chip
// should be the one the eye lands on first.
const List<String> invOutboundReasonOrder = [
  'correction',
  'damage',
  'free_issue',
  'expiry',
  'theft',
  'revaluation',
  'other',
];
const List<String> invInboundReasonOrder = [
  'found',
  'opening_balance',
  'correction',
  'revaluation',
  'other',
];

// Outbound defaults to 'correction', not 'damage': most downward edits are
// fixing a mis-typed count, and a real loss should be a deliberate pick rather
// than something a user posts by accepting a default.
String invDefaultReason(bool isOutbound) => isOutbound ? 'correction' : 'found';

class InvDirectionToggle extends StatelessWidget {
  const InvDirectionToggle({super.key, required this.isOutbound, required this.onChanged});
  final bool isOutbound;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _DirSegment(
            label: 'Add',
            icon: Icons.add,
            color: InvColors.success,
            active: !isOutbound,
            onTap: () => onChanged(false),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _DirSegment(
            label: 'Remove',
            icon: Icons.remove,
            color: InvColors.error,
            active: isOutbound,
            onTap: () => onChanged(true),
          ),
        ),
      ],
    );
  }
}

class _DirSegment extends StatelessWidget {
  const _DirSegment({
    required this.label,
    required this.icon,
    required this.color,
    required this.active,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final Color color;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: active ? color : t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          height: 44,
          decoration: BoxDecoration(
            border: Border.all(color: active ? color : t.hairline),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: active ? Colors.white : color),
              const SizedBox(width: 6),
              Text(
                label,
                style: RunqText.bodyStrong.copyWith(
                  color: active ? Colors.white : t.ink,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Batch code for stock that arrives without one, in the house convention
/// `<PRODUCT>-<YYDDD>`: the item's own SKU, then a Julian lot stamp — two-digit
/// year plus day-of-year, so 21 Aug 2026 is `26233`.
///
/// Julian rather than a plain date because that is what food and FMCG lot
/// codes use: it is fixed-width (no 8-vs-6 digit ambiguity, no DD/MM-vs-MM/DD
/// reading), it survives being stamped on a carton, and it doesn't advertise
/// the exact date to whoever handles the goods downstream. The SKU goes in
/// whole — it is the product code already, and a clipped one
/// ("SUNFLOWER-OIL-BU") names nothing.
///
/// Date-stamped at all because found stock is only ever identified by when it
/// turned up. Stays editable for goods carrying a supplier's own lot code.
String invSuggestBatchNo({String? sku, required String itemName, required DateTime on}) {
  final code = _productCode(sku, itemName);
  final stamp = invJulianStamp(on);
  return code.isEmpty ? 'BATCH-$stamp' : '$code-$stamp';
}

/// Julian lot stamp: two-digit year + zero-padded day-of-year (`26233`).
String invJulianStamp(DateTime on) {
  final dayOfYear = on.difference(DateTime(on.year)).inDays + 1;
  final yy = (on.year % 100).toString().padLeft(2, '0');
  return '$yy${dayOfYear.toString().padLeft(3, '0')}';
}

/// SKU verbatim (upper-cased, punctuation folded to '-'), or a name slug
/// capped at 24 chars on a word boundary when the item has no SKU.
String _productCode(String? sku, String itemName) {
  String slug(String raw) =>
      raw.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]+'), '-').replaceAll(RegExp(r'^-+|-+$'), '');

  final fromSku = slug(sku ?? '');
  if (fromSku.isNotEmpty) return fromSku;

  final fromName = slug(itemName);
  if (fromName.length <= 24) return fromName;
  final cut = fromName.substring(0, 24);
  final lastBreak = cut.lastIndexOf('-');
  return lastBreak > 0 ? cut.substring(0, lastBreak) : cut;
}

// Trim trailing zeros: 5.000 → 5, 5.5 → 5.5, 5.123 → 5.12.
String invFmtQty(num q) {
  if (q == q.truncateToDouble()) return q.toInt().toString();
  return q.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

class InvFieldLabel extends StatelessWidget {
  const InvFieldLabel(this.label, {super.key});
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Text(
      label.toUpperCase(),
      style: RunqText.label.copyWith(color: RT(context).muted, letterSpacing: 0.5),
    ),
  );
}

InputDecoration invInputDecoration(BuildContext context, {String? hint, Widget? suffix}) {
  final t = RT(context);
  return InputDecoration(
    hintText: hint,
    hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
    filled: true,
    fillColor: t.surface,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    suffixIcon: suffix,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
    ),
  );
}
