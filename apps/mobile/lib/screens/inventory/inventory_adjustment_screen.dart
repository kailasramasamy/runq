// Adjustments — list + stock-take-style create screen. Tap "+" opens a
// full screen: pick warehouse + reason at top, the warehouse's on-hand
// rows render below, tap any row to enter a delta in a bottom sheet.
// POST lives in the AppBar (amber pill). "Add other product" footer
// handles inbound found-stock items not currently on hand.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';

const Map<String, String> _reasonLabels = {
  'damage': 'Damage', 'expiry': 'Expiry', 'theft': 'Theft', 'found': 'Found',
  'revaluation': 'Revaluation', 'correction': 'Correction',
  'opening_balance': 'Opening Balance', 'free_issue': 'Free Issue',
};

// 'free_issue' — stock handed over without an invoice (extra cases to the
// logistics team to cover their breakages). Outbound like damage, but the
// goods are intact, so the backend books it to distribution cost not write-off.
const Set<String> _outboundReasons = {'damage', 'expiry', 'theft', 'free_issue'};

class InventoryAdjustmentScreen extends ConsumerWidget {
  const InventoryAdjustmentScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invAdjustmentListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Adjustments',
        onBack: () => context.pop(),
        trailing: _AddBtn(onTap: () => _openSheet(context, ref)),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invAdjustmentListProvider(null));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Failed to load: $e',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center),
            ),
          ),
          data: (list) {
            if (list.isEmpty) {
              return InvEmptyState(
                icon: Icons.tune_rounded,
                title: 'No adjustments yet',
                subtitle: 'Record damage, found stock, or corrections',
                actionLabel: '+ New Adjustment',
                onAction: () => _openSheet(context, ref),
              );
            }
            return ListView.builder(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
              // +1 leading summary row, then tiles with 8px gap separators.
              itemCount: list.length + 1,
              itemBuilder: (_, idx) {
                if (idx == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _SummaryStrip(list: list),
                  );
                }
                final i = idx - 1;
                return Padding(
                  padding: EdgeInsets.only(top: i == 0 ? 0 : 8),
                  child: _AdjTile(
                    adj: list[i],
                    onTap: () => _openDetail(context, list[i]),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _openDetail(BuildContext context, InvAdjustment adj) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AdjDetailSheet(adj: adj),
    );
  }

  void _openSheet(BuildContext context, WidgetRef ref) async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const _NewAdjustmentScreen()),
    );
    if (created == true) {
      ref.invalidate(invAdjustmentListProvider(null));
      invalidateStockViews(ref);
    }
  }
}

class _AddBtn extends StatelessWidget {
  const _AddBtn({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: InvColors.brand(context),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: const SizedBox(
            width: 32, height: 32,
            child: Icon(Icons.add, color: Colors.white, size: 18),
          ),
        ),
      ),
    );
  }
}

// ── Summary KPIs ─────────────────────────────────────────────────────────

// Two-card strip above the list. Count is rows in the visible window;
// net value is the signed sum of value deltas (red if net stock loss,
// green if net gain, muted for break-even).
class _SummaryStrip extends StatelessWidget {
  const _SummaryStrip({required this.list});
  final List<InvAdjustment> list;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final count = list.length;
    final net = list.fold<double>(0, (s, a) => s + a.totalValueDelta);
    final outbound = list.where((a) => _outboundReasons.contains(a.reason)).length;
    final inbound = count - outbound;

    final netText = net == 0 ? '—' : '${net > 0 ? '+' : '−'}${compactINR(net.abs())}';
    final netTint = net < 0
        ? InvColors.error.withValues(alpha: 0.08)
        : net > 0
            ? InvColors.success.withValues(alpha: 0.08)
            : null;
    final netBorder = net < 0
        ? InvColors.error.withValues(alpha: 0.30)
        : net > 0
            ? InvColors.success.withValues(alpha: 0.30)
            : null;
    final netValueColor = net < 0
        ? InvColors.error
        : net > 0
            ? InvColors.success
            : t.muted;

    return Row(
      children: [
        Expanded(
          child: InvKpiCard(
            label: 'Adjustments',
            value: count.toString(),
            sub: '$outbound out · $inbound in',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _ValueKpiCard(
            label: 'Net Value',
            value: netText,
            sub: net == 0 ? 'no impact' : (net < 0 ? 'stock written down' : 'stock added'),
            tint: netTint,
            borderTint: netBorder,
            valueColor: netValueColor,
          ),
        ),
      ],
    );
  }
}

// `InvKpiCard` always renders its value in brand/ink — we need red/green
// for the net value card, so this tiny variant mirrors the layout but
// lets the caller pass a value colour.
class _ValueKpiCard extends StatelessWidget {
  const _ValueKpiCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.valueColor,
    this.tint,
    this.borderTint,
  });
  final String label;
  final String value;
  final String sub;
  final Color valueColor;
  final Color? tint;
  final Color? borderTint;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: tint ?? t.surface,
        border: Border.all(color: borderTint ?? t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 4),
          Text(
            value,
            style: RunqText.numberLg
                .copyWith(color: valueColor, fontSize: 20, height: 1.15),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

// ── Tile ─────────────────────────────────────────────────────────────────

class _AdjTile extends StatelessWidget {
  const _AdjTile({required this.adj, this.onTap});
  final InvAdjustment adj;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final delta = adj.totalValueDelta;
    final isOutbound = _outboundReasons.contains(adj.reason);
    final reasonColor = isOutbound ? InvColors.error : InvColors.success;
    final reasonBg = isOutbound
        ? InvColors.error.withValues(alpha: 0.10)
        : InvColors.success.withValues(alpha: 0.10);
    final reasonLabel = _reasonLabels[adj.reason] ?? _humanize(adj.reason);
    final deltaText = delta == 0
        ? '—'
        : '${delta > 0 ? '+' : '-'}${compactINR(delta.abs())}';
    final deltaColor = delta < 0
        ? InvColors.error
        : delta > 0
            ? InvColors.success
            : t.muted;

    return InvCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _DateBlock(iso: adj.adjustmentDate),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        adj.adjNo,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    InvStatusPill(status: adj.status),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  adj.warehouseName,
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
                if (_itemsPreview != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _itemsPreview!,
                    style: RunqText.caption.copyWith(color: t.ink2),
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 8),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: reasonBg,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        reasonLabel,
                        style: RunqText.micro.copyWith(color: reasonColor, letterSpacing: 0.3),
                      ),
                    ),
                    if (adj.lineCount > 0) ...[
                      const SizedBox(width: 6),
                      Text(
                        '${adj.lineCount} item${adj.lineCount == 1 ? '' : 's'}',
                        style: RunqText.micro.copyWith(color: t.muted),
                      ),
                    ],
                    const Spacer(),
                    Text(
                      deltaText,
                      style: RunqText.bodyStrong.copyWith(color: deltaColor, fontSize: 14),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// "Buffalo Curd, Farm Fresh Curd +2 more" — the API caps the names at three,
  /// so anything beyond what it sent is counted from `lineCount` rather than
  /// assumed to be the whole set.
  String? get _itemsPreview {
    if (adj.itemNames.isEmpty) return null;
    final shown = adj.itemNames.take(2).toList();
    final remaining = adj.lineCount - shown.length;
    final joined = shown.join(', ');
    return remaining > 0 ? '$joined  +$remaining more' : joined;
  }

  static String _humanize(String s) => s.isEmpty
      ? s
      : s.split('_').map((p) => p.isEmpty ? p : '${p[0].toUpperCase()}${p.substring(1)}').join(' ');
}

/// Leading date block — same shape and rules as `MfgDateBlock` on the work-order
/// list (tinted 42pt box, bold day, brand month, year only when it isn't the
/// current one), rendered in the inventory amber rather than the mfg rose so
/// each module keeps its own palette.
class _DateBlock extends StatelessWidget {
  const _DateBlock({required this.iso});
  final String iso;

  static const _months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    final dt = DateTime.tryParse(iso);
    return Container(
      width: 42,
      padding: const EdgeInsets.symmetric(vertical: 5),
      decoration: BoxDecoration(
        color: InvColors.amberSubtle,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: InvColors.amberHairline),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: dt == null
            ? [
                Text(
                  iso,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: brand),
                ),
              ]
            : [
                Text(
                  '${dt.day}',
                  style: RunqText.bodyStrong.copyWith(
                    color: t.ink,
                    fontWeight: FontWeight.w800,
                    height: 1.1,
                  ),
                ),
                Text(
                  _months[dt.month - 1],
                  style: RunqText.micro.copyWith(
                    color: brand,
                    fontWeight: FontWeight.w700,
                    height: 1.2,
                  ),
                ),
                if (dt.year != DateTime.now().year)
                  Text(
                    "'${dt.year % 100}",
                    style: RunqText.micro.copyWith(color: t.muted2, height: 1.2),
                  ),
              ],
      ),
    );
  }
}

// ── New adjustment screen — list on-hand, tap to enter delta ─────────────

// One draft row keyed by (itemId, batchNo). availSnapshot is frozen at
// the time the draft was created so the on-hand hint in the sheet stays
// stable even if the underlying list refreshes mid-flow. Each draft now
// owns its own direction + reason — the submit groups them by reason
// before posting (backend = one adjustment per reason).
class _AdjDraft {
  const _AdjDraft({
    required this.itemId,
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    this.batchNo,
    required this.availSnapshot,
    required this.unsignedQty,
    required this.isOutbound,
    required this.reason,
  });
  final String itemId;
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String? batchNo;
  final double availSnapshot;
  final double unsignedQty;
  final bool isOutbound;
  final String reason;
}

String _draftKey(String itemId, String? batchNo) => '$itemId|${batchNo ?? ''}';

class _NewAdjustmentScreen extends ConsumerStatefulWidget {
  const _NewAdjustmentScreen();
  @override
  ConsumerState<_NewAdjustmentScreen> createState() => _NewAdjustmentScreenState();
}

class _NewAdjustmentScreenState extends ConsumerState<_NewAdjustmentScreen> {
  String? warehouseId;
  bool submitting = false;
  // Toggles between "all on-hand items" and "only ones I've adjusted".
  bool _adjustedOnly = false;
  // Search + class filter. A plant carrying a few hundred SKUs makes an
  // unfiltered alphabetical list unusable — you scroll past the thing you
  // came to write off.
  final _searchCtl = TextEditingController();
  String _query = '';
  // Defaults to finished goods — damage and free issues are overwhelmingly
  // packed product, not raw material. Held as a *preference* until the user
  // touches the strip: `resolveDefaultClassGroup` downgrades it to whatever
  // the tenant actually stocks, so a plant with no finished goods still opens
  // on a populated list instead of an empty one.
  String _classGroup = classGroupFinished;
  bool _classGroupTouched = false;
  // Keyed by `${itemId}|${batchNo ?? ''}` so two batches of the same item
  // are independent drafts.
  final Map<String, _AdjDraft> _drafts = {};

  @override
  void initState() {
    super.initState();
    _applyDefaultWarehouse();
  }

  @override
  void dispose() {
    _searchCtl.dispose();
    super.dispose();
  }

  /// Most plants run one warehouse, so picking it every time is a tap that can
  /// only be got wrong — and until it's set the on-hand list has nothing to
  /// show. Falls back to the sole warehouse when none is flagged default.
  /// Mirrors record_production_screen / wo_create_screen.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || warehouseId != null || whs.isEmpty) return;
    final pick = whs.firstWhere((w) => w.isDefault, orElse: () => whs.first);
    setState(() => warehouseId = pick.id);
  }

  Future<void> _openLineSheet({
    required String itemId,
    required String itemName,
    String? itemSku,
    String? itemUnit,
    String? batchNo,
    required double availSnapshot,
  }) async {
    final key = _draftKey(itemId, batchNo);
    final existing = _drafts[key];
    final result = await showModalBottomSheet<_AdjLineSheetResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AdjLineSheet(
        itemName: itemName,
        itemSku: itemSku,
        itemUnit: itemUnit,
        batchNo: batchNo,
        availSnapshot: availSnapshot,
        // Default direction: Remove if there's on-hand to take from,
        // otherwise Add (matches the most common intent on each row).
        initialIsOutbound: existing?.isOutbound ?? (availSnapshot > 0),
        initialReason: existing?.reason,
        initialQty: existing?.unsignedQty,
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      if (result.cleared) {
        _drafts.remove(key);
      } else {
        _drafts[key] = _AdjDraft(
          itemId: itemId, itemName: itemName, itemSku: itemSku,
          itemUnit: itemUnit, batchNo: batchNo,
          availSnapshot: availSnapshot,
          unsignedQty: result.qty!,
          isOutbound: result.isOutbound!,
          reason: result.reason!,
        );
      }
    });
  }

  // For inbound reasons — let users add items not currently on hand at
  // this warehouse (e.g. surplus found in a corner, opening balance).
  // Picker returns one or more items; we open the qty sheet for each
  // sequentially so the user lands directly in the qty input.
  Future<void> _openExtraPicker() async {
    final picked = await showModalBottomSheet<List<InvItem>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AdjItemPickerSheet(
        excludeIds: _drafts.values.map((d) => d.itemId).toSet(),
      ),
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    for (final item in picked) {
      if (!mounted) break;
      await _openLineSheet(
        itemId: item.id, itemName: item.name,
        itemSku: item.sku, itemUnit: item.unit,
        batchNo: null, availSnapshot: 0,
      );
    }
  }

  void _onWarehouseChanged(String? id) {
    // Switching warehouse invalidates drafts — their availSnapshot was
    // captured at the old one. Clear is safer than silently re-binding.
    setState(() {
      warehouseId = id;
      _drafts.clear();
      _adjustedOnly = false;
    });
  }

  bool get _canSubmit {
    if (warehouseId == null || submitting || _drafts.isEmpty) return false;
    for (final d in _drafts.values) {
      if (d.unsignedQty <= 0) return false;
      if (d.isOutbound && d.unsignedQty > d.availSnapshot) return false;
    }
    return true;
  }

  // Backend stores one reason per adjustment, so we bucket drafts by
  // reason and post N adjustments — one per distinct reason in the draft.
  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => submitting = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final byReason = <String, List<_AdjDraft>>{};
      for (final d in _drafts.values) {
        byReason.putIfAbsent(d.reason, () => []).add(d);
      }
      final adjNos = <String>[];
      for (final entry in byReason.entries) {
        final a = await inventoryRepo.createAdjustment(
          warehouseId: warehouseId!,
          reason: entry.key,
          adjustmentDate: today,
          lines: [
            for (final d in entry.value)
              InvAdjustmentLineInput(
                itemId: d.itemId,
                batchNo: (d.batchNo ?? '').isEmpty ? null : d.batchNo,
                qtyDelta: (d.isOutbound ? -1 : 1) * d.unsignedQty,
              ),
          ],
        );
        await inventoryRepo.postAdjustment(a.id);
        adjNos.add(a.adjNo);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(adjNos.length == 1
            ? '${adjNos.first} posted'
            : '${adjNos.length} adjustments posted')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final onHand = warehouseId == null
        ? null
        : ref.watch(invOnHandProvider(
            (warehouseId: warehouseId, lowOnly: false, itemClassGroup: null)));
    final draftCount = _drafts.length;
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Record Adjustment',
        onBack: () => Navigator.of(context).pop(false),
        trailing: Padding(
          padding: const EdgeInsets.only(right: 8),
          child: _PostBtn(
            busy: submitting,
            label: draftCount <= 1 ? 'POST' : 'POST ($draftCount)',
            onTap: _canSubmit ? _submit : null,
          ),
        ),
      ),
      body: Column(
        children: [
          // Fixed controls — warehouse, search, class strip. Direction and
          // reason stay per-line in the sheet that opens on tap, so nothing
          // up here is a mode you can forget you left switched on.
          Container(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            color: t.bgWarm,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                WarehousePicker(
                  value: warehouseId,
                  onChanged: _onWarehouseChanged,
                  allowAll: false,
                  dense: true,
                ),
                const SizedBox(height: 8),
                InvSearchBar(
                  controller: _searchCtl,
                  onChanged: (v) => setState(() => _query = v.trim()),
                  hint: 'Item, SKU or batch…',
                ),
              ],
            ),
          ),
          if (warehouseId != null)
            onHand!.maybeWhen(
              data: (rows) => _classStrip(rows),
              orElse: () => const SizedBox.shrink(),
            ),
          Divider(height: 1, color: t.hairlineSoft),
          Expanded(
            child: warehouseId == null
                ? _placeholder(context, 'Pick a warehouse to load its on-hand list.')
                : onHand!.when(
                    loading: () => const Center(child: CircularProgressIndicator()),
                    error: (e, _) => _placeholder(context, 'Failed to load: $e'),
                    data: (rows) => _buildList(context, rows),
                  ),
          ),
        ],
      ),
    );
  }

  /// The bucket actually in force. Resolved at render time rather than stored,
  /// so no setState-during-build is needed to downgrade an empty default.
  String _effectiveClassGroup(List<InvOnHandRow> rows) {
    if (_classGroupTouched) return _classGroup;
    return resolveDefaultClassGroup(
      _classGroup,
      bucketCountsFor(rows.map((r) => r.itemClass)),
    );
  }

  /// Class strip sits outside the padded block so the pills can bleed to the
  /// screen edge when they overflow, same as the on-hand screen.
  Widget _classStrip(List<InvOnHandRow> rows) {
    final counts = bucketCountsFor(rows.map((r) => r.itemClass));
    if (counts.length < 2) return const SizedBox(height: 4);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InvClassTabs(
        selected: _effectiveClassGroup(rows),
        counts: counts,
        onChanged: (g) => setState(() {
          _classGroup = g;
          _classGroupTouched = true;
        }),
      ),
    );
  }

  Widget _placeholder(BuildContext context, String text) {
    final t = RT(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(text,
            textAlign: TextAlign.center,
            style: RunqText.caption.copyWith(color: t.muted)),
      ),
    );
  }

  /// Search + class + adjusted-only, applied in that order. Drafted rows are
  /// never hidden by search: half-entered work disappearing as you type reads
  /// as data loss even though it isn't.
  List<InvOnHandRow> _visibleRows(List<InvOnHandRow> rows) {
    final q = _query.toLowerCase();
    final group = _effectiveClassGroup(rows);
    final out = rows.where((r) {
      final batch = r.batchNo.isEmpty ? null : r.batchNo;
      final drafted = _drafts.containsKey(_draftKey(r.itemId, batch));
      if (_adjustedOnly) return drafted;
      if (group != classGroupAll &&
          classGroupForItemClass(r.itemClass) != group) {
        return drafted;
      }
      if (q.isEmpty) return true;
      final hay = '${r.itemName} ${r.itemSku ?? ''} ${r.batchNo}'.toLowerCase();
      return hay.contains(q) || drafted;
    }).toList();
    out.sort((a, b) => a.itemName.toLowerCase().compareTo(b.itemName.toLowerCase()));
    return out;
  }

  /// Flatten the visible rows into a render list of section headers and item
  /// rows, grouped category → sub-category. Uncategorised items collect under
  /// "Other" at the bottom rather than being dropped or scattered.
  List<_ListEntry> _sectioned(List<InvOnHandRow> visible) {
    const uncategorised = 'Other';
    // group -> sub -> rows, insertion-ordered after an explicit sort.
    final tree = <String, Map<String, List<InvOnHandRow>>>{};
    for (final r in visible) {
      final leaf = (r.categoryName ?? '').trim();
      final parent = (r.categoryGroup ?? '').trim();
      final group = parent.isNotEmpty
          ? parent
          : (leaf.isNotEmpty ? leaf : uncategorised);
      // A leaf equal to its parent (or absent) means the item sits directly on
      // the top-level category — no sub-heading worth drawing.
      final sub = (leaf.isEmpty || leaf == group) ? '' : leaf;
      tree.putIfAbsent(group, () => <String, List<InvOnHandRow>>{})
          .putIfAbsent(sub, () => <InvOnHandRow>[])
          .add(r);
    }

    final groups = tree.keys.toList()
      ..sort((a, b) {
        if (a == uncategorised) return 1;
        if (b == uncategorised) return -1;
        return a.toLowerCase().compareTo(b.toLowerCase());
      });

    final out = <_ListEntry>[];
    for (final g in groups) {
      final subs = tree[g]!.keys.toList()
        ..sort((a, b) {
          if (a.isEmpty) return -1; // direct-on-category rows lead the section
          if (b.isEmpty) return 1;
          return a.toLowerCase().compareTo(b.toLowerCase());
        });
      final total = tree[g]!.values.fold<int>(0, (s, l) => s + l.length);
      out.add(_ListEntry.group(g, total));
      for (final s in subs) {
        if (s.isNotEmpty) out.add(_ListEntry.sub(s));
        for (final r in tree[g]![s]!) {
          out.add(_ListEntry.row(r));
        }
      }
    }
    return out;
  }

  Widget _buildList(BuildContext context, List<InvOnHandRow> rows) {
    final visible = _visibleRows(rows);
    if (visible.isEmpty) {
      return InvEmptyState(
        icon: Icons.search_off_rounded,
        title: 'No items match',
        subtitle: _query.isNotEmpty
            ? 'Nothing here matches “$_query”'
            : 'Try another category, or add a product that is not on hand',
        actionLabel: '+ Add product not on hand',
        onAction: _openExtraPicker,
      );
    }
    final entries = _sectioned(visible);
    return ListView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 32),
      itemCount: entries.length + 2,
      itemBuilder: (ctx, idx) {
        if (idx == 0) return _listHeader(context, rows.length, visible.length);
        if (idx == entries.length + 1) return _addOtherFooter(context);
        return _entryTile(ctx, entries[idx - 1]);
      },
    );
  }

  Widget _entryTile(BuildContext context, _ListEntry e) {
    final t = RT(context);
    switch (e.kind) {
      case _EntryKind.group:
        return _CategoryHeader(label: e.label!, count: e.count);
      case _EntryKind.sub:
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
          child: Text(
            e.label!,
            style: RunqText.caption.copyWith(
              color: t.muted,
              fontWeight: FontWeight.w600,
            ),
          ),
        );
      case _EntryKind.row:
        final r = e.row!;
        final batchNo = r.batchNo.isEmpty ? null : r.batchNo;
        final draft = _drafts[_draftKey(r.itemId, batchNo)];
        return Column(
          children: [
            _OnHandTile(
              row: r,
              draft: draft,
              onTap: () => _openLineSheet(
                itemId: r.itemId,
                itemName: r.itemName,
                itemSku: r.itemSku,
                itemUnit: r.itemUnit,
                batchNo: batchNo,
                availSnapshot: r.qty,
              ),
            ),
            Divider(height: 1, color: t.hairlineSoft, indent: 16, endIndent: 16),
          ],
        );
    }
  }

  Widget _listHeader(BuildContext context, int total, int shown) {
    final t = RT(context);
    final draftCount = _drafts.length;
    final filtering = shown != total;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              draftCount == 0
                  ? (filtering
                      ? '$shown of $total items'
                      : '$total item${total == 1 ? '' : 's'} on hand')
                  : '$draftCount adjusted · $shown shown',
              style: RunqText.label.copyWith(color: t.muted, letterSpacing: 0.5),
            ),
          ),
          if (draftCount > 0)
            GestureDetector(
              onTap: () => setState(() => _adjustedOnly = !_adjustedOnly),
              child: Text(
                _adjustedOnly ? 'Show all' : 'Show adjusted',
                style: RunqText.caption.copyWith(
                  color: InvColors.brand(context),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _addOtherFooter(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: _openExtraPicker,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              border: Border.all(color: t.hairline),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.add, size: 16, color: brand),
                const SizedBox(width: 6),
                Text(
                  'Add product not on hand',
                  style: RunqText.bodyStrong.copyWith(color: brand, fontSize: 14),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Section entries ───────────────────────────────────────────────────────

enum _EntryKind { group, sub, row }

/// One rendered line in the sectioned list: a category heading, a
/// sub-category sub-heading, or an item row.
class _ListEntry {
  const _ListEntry._(this.kind, {this.label, this.count = 0, this.row});
  factory _ListEntry.group(String label, int count) =>
      _ListEntry._(_EntryKind.group, label: label, count: count);
  factory _ListEntry.sub(String label) => _ListEntry._(_EntryKind.sub, label: label);
  factory _ListEntry.row(InvOnHandRow row) => _ListEntry._(_EntryKind.row, row: row);

  final _EntryKind kind;
  final String? label;
  final int count;
  final InvOnHandRow? row;
}

/// Top-level category band. Tinted so the eye can find section boundaries
/// while thumbing a long list, without a sticky header stealing height.
class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.label, required this.count});
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      color: t.bgWarmer,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: RunqText.label.copyWith(
                color: t.ink2,
                letterSpacing: 0.6,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Text('$count', style: RunqText.caption.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

// ── On-hand list tile — name + sku/batch/avail, draft delta or chevron ─

class _OnHandTile extends StatelessWidget {
  const _OnHandTile({
    required this.row,
    required this.draft,
    required this.onTap,
  });
  final InvOnHandRow row;
  final _AdjDraft? draft;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasDraft = draft != null;
    final signedDelta = hasDraft
        ? (draft!.isOutbound ? -draft!.unsignedQty : draft!.unsignedQty)
        : 0.0;
    final deltaColor = signedDelta < 0 ? InvColors.error : InvColors.success;
    final subParts = <String>[
      if ((row.itemUnit ?? '').isNotEmpty) row.itemUnit!,
      if ((row.itemSku ?? '').isNotEmpty) row.itemSku!,
      if (row.batchNo.isNotEmpty) row.batchNo,
    ];
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    row.itemName,
                    style: RunqText.body.copyWith(
                      color: t.ink,
                      fontSize: 14,
                      fontWeight: hasDraft ? FontWeight.w700 : FontWeight.w500,
                    ),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                  if (subParts.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      subParts.join(' · '),
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                _QtyPill(text: _fmtQty(row.qty)),
                if (hasDraft) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: deltaColor.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      signedDelta > 0
                          ? '+${_fmtQty(signedDelta)}'
                          : '-${_fmtQty(signedDelta.abs())}',
                      style: RunqText.caption.copyWith(
                        color: deltaColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            if (!hasDraft) ...[
              const SizedBox(width: 2),
              Icon(Icons.chevron_right, size: 20, color: t.muted2),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Qty pill — subtle bordered chip used to surface the on-hand count ───

class _QtyPill extends StatelessWidget {
  const _QtyPill({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: t.hairlineSoft),
      ),
      child: Text(
        text,
        style: RunqText.caption.copyWith(
          color: t.ink,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// ── Adjustment line sheet — qty input + on-hand hint + save/clear ────────

class _AdjLineSheetResult {
  const _AdjLineSheetResult.saved({
    required this.qty,
    required this.isOutbound,
    required this.reason,
  }) : cleared = false;
  const _AdjLineSheetResult.cleared()
      : qty = null,
        isOutbound = null,
        reason = null,
        cleared = true;
  final double? qty;
  final bool? isOutbound;
  final String? reason;
  final bool cleared;
}

// Reasons split by direction. "correction" / "revaluation" appear on both
// sides because either intent is valid (system over-counted or under-counted).
const List<String> _outboundReasonOrder = [
  'damage', 'free_issue', 'expiry', 'theft', 'correction', 'revaluation',
];
const List<String> _inboundReasonOrder = [
  'found', 'opening_balance', 'correction', 'revaluation',
];

String _defaultReason(bool isOutbound) => isOutbound ? 'damage' : 'found';

class _AdjLineSheet extends StatefulWidget {
  const _AdjLineSheet({
    required this.itemName,
    this.itemSku,
    this.itemUnit,
    this.batchNo,
    required this.availSnapshot,
    required this.initialIsOutbound,
    this.initialReason,
    this.initialQty,
  });
  final String itemName;
  final String? itemSku;
  final String? itemUnit;
  final String? batchNo;
  final double availSnapshot;
  final bool initialIsOutbound;
  final String? initialReason;
  final double? initialQty;
  @override
  State<_AdjLineSheet> createState() => _AdjLineSheetState();
}

class _AdjLineSheetState extends State<_AdjLineSheet> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  late bool _isOutbound;
  late String _reason;

  @override
  void initState() {
    super.initState();
    _isOutbound = widget.initialIsOutbound;
    _reason = widget.initialReason ?? _defaultReason(_isOutbound);
    if (widget.initialQty != null) _ctrl.text = _fmtQty(widget.initialQty!);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _setDirection(bool outbound) {
    if (_isOutbound == outbound) return;
    setState(() {
      _isOutbound = outbound;
      // Reset reason to a sensible default for the new direction unless
      // the current pick is valid on both sides.
      final list = outbound ? _outboundReasonOrder : _inboundReasonOrder;
      if (!list.contains(_reason)) _reason = _defaultReason(outbound);
    });
  }

  void _save() {
    final q = double.tryParse(_ctrl.text) ?? -1;
    if (q <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive qty')),
      );
      return;
    }
    if (_isOutbound && q > widget.availSnapshot) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Only ${_fmtQty(widget.availSnapshot)} on hand')),
      );
      return;
    }
    Navigator.of(context).pop(_AdjLineSheetResult.saved(
      qty: q, isOutbound: _isOutbound, reason: _reason,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final insets = MediaQuery.of(context).viewInsets;
    final sub = [
      if ((widget.itemSku ?? '').isNotEmpty) widget.itemSku!,
      if ((widget.itemUnit ?? '').isNotEmpty) widget.itemUnit!,
      if ((widget.batchNo ?? '').isNotEmpty) 'Batch ${widget.batchNo!}',
    ].join(' · ');
    final unitSuffix = (widget.itemUnit ?? '').isEmpty ? '' : ' ${widget.itemUnit}';
    final reasons = _isOutbound ? _outboundReasonOrder : _inboundReasonOrder;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetHeader(
            title: 'Adjust stock',
            onClose: () => Navigator.of(context).pop(),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Item header
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.inventory_2_outlined, size: 18, color: t.muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.itemName,
                              style: RunqText.bodyStrong
                                  .copyWith(color: t.ink, fontSize: 15),
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                          if (sub.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // Direction toggle — explicit Add vs Remove choice, big
                // enough that the user can't miss what sign is being applied.
                _DirectionToggle(
                  isOutbound: _isOutbound,
                  onChanged: _setDirection,
                ),
                const SizedBox(height: 16),
                _Lbl(_isOutbound ? 'Qty to Remove' : 'Qty to Add'),
                TextField(
                  controller: _ctrl,
                  focusNode: _focus,
                  style: RunqText.body.copyWith(color: t.ink, fontSize: 16),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: _dec(context, hint: '0'),
                  onSubmitted: (_) => _save(),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.inventory_outlined, size: 13, color: t.muted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'On hand: ${_fmtQty(widget.availSnapshot)}$unitSuffix',
                        style: RunqText.caption.copyWith(color: t.muted),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _Lbl('Reason'),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final r in reasons)
                      InvFilterPill(
                        label: _reasonLabels[r] ?? r,
                        active: _reason == r,
                        onTap: () => setState(() => _reason = r),
                        activeColor: _isOutbound ? InvColors.error : InvColors.success,
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    if (widget.initialQty != null) ...[
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(context).pop(
                              const _AdjLineSheetResult.cleared()),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: InvColors.error,
                            side: BorderSide(
                                color: InvColors.error.withValues(alpha: 0.4)),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: const Text('Clear'),
                        ),
                      ),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                      flex: 2,
                      child: InvPrimaryButton(
                        label: 'Save',
                        icon: Icons.check_circle_outline,
                        onTap: _save,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Two-segment pill — Add (green) vs Remove (red). Active segment fills
// with its colour, inactive segment is a muted outline so the user sees
// both options at a glance and the chosen sign is unambiguous.
class _DirectionToggle extends StatelessWidget {
  const _DirectionToggle({required this.isOutbound, required this.onChanged});
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

// ── POST pill — AppBar action, mirrors stock-take ─────────────────────────

class _PostBtn extends StatelessWidget {
  const _PostBtn({required this.busy, required this.label, required this.onTap});
  final bool busy;
  final String label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null || busy;
    return Material(
      color: disabled ? const Color(0xFFA8A29E) : InvColors.brand(context),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: disabled ? null : onTap,
        child: SizedBox(
          height: 32,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (busy) ...[
                  const SizedBox(
                    width: 12, height: 12,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  ),
                  const SizedBox(width: 8),
                ],
                Text(
                  busy ? 'Posting…' : label,
                  style: RunqText.caption.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// Trim trailing zeros: 5.000 → 5, 5.5 → 5.5, 5.123 → 5.12.
String _fmtQty(num q) {
  if (q == q.truncateToDouble()) return q.toInt().toString();
  return q
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

// ── Multi-select item picker sheet — primary entry point ────────────────

// Searchable list with a checkbox on every row. Items already in the
// draft are hidden via [excludeIds] so the user can't double-add. The
// footer shows a sticky "Add N products" button that pops with every
// ticked item in one shot — picking ten items takes one open/close.
class _AdjItemPickerSheet extends StatefulWidget {
  const _AdjItemPickerSheet({this.excludeIds = const {}});
  final Set<String> excludeIds;
  @override
  State<_AdjItemPickerSheet> createState() => _AdjItemPickerSheetState();
}

class _AdjItemPickerSheetState extends State<_AdjItemPickerSheet> {
  final _ctrl = TextEditingController();
  // Selection lives in two maps so we keep full item data (needed when
  // popping) even if a tick scrolls off the current result page.
  final Map<String, InvItem> _selected = {};
  List<InvItem> _results = const [];
  bool _loading = false;
  String _lastQuery = '';
  // Adjustments span any class (damage, found, revaluation can apply to
  // raw materials, finished goods, spares alike) — default to All.
  static const _preferredGroup = classGroupAll;
  String? _classGroup;
  bool _userPickedGroup = false;

  @override
  void initState() {
    super.initState();
    _runSearch('');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _runSearch(String q) async {
    _lastQuery = q;
    setState(() => _loading = true);
    try {
      final hits = await inventoryRepo.searchItems(q);
      if (!mounted || q != _lastQuery) return;
      setState(() {
        _results = hits.where((r) => !widget.excludeIds.contains(r.id)).toList();
      });
    } finally {
      if (mounted && q == _lastQuery) setState(() => _loading = false);
    }
  }

  void _toggle(InvItem r) {
    setState(() {
      if (_selected.containsKey(r.id)) {
        _selected.remove(r.id);
      } else {
        _selected[r.id] = r;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            _SheetHeader(
              title: _selected.isEmpty
                  ? 'Pick products'
                  : '${_selected.length} selected',
              onClose: () => Navigator.of(context).pop(),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _ctrl,
                autofocus: true,
                onChanged: _runSearch,
                style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search by name or SKU',
                  hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
                  prefixIcon: Icon(Icons.search, color: t.muted),
                  filled: true,
                  fillColor: t.bgWarmer,
                  isDense: true,
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
                    borderSide: BorderSide(color: brand, width: 1.2),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_results.isNotEmpty) ...[
              Builder(builder: (_) {
                final counts = bucketCountsFor(_results.map((r) => r.itemClass));
                if (!_userPickedGroup) {
                  final resolved = resolveDefaultClassGroup(_preferredGroup, counts);
                  if (_classGroup != resolved) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) setState(() => _classGroup = resolved);
                    });
                  }
                }
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: InvClassTabs(
                    selected: _classGroup ?? classGroupAll,
                    counts: counts,
                    onChanged: (g) => setState(() {
                      _classGroup = g;
                      _userPickedGroup = true;
                    }),
                  ),
                );
              }),
            ],
            Expanded(
              child: _loading && _results.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : Builder(builder: (_) {
                      final active = _classGroup ?? classGroupAll;
                      final shown = active == classGroupAll
                          ? _results
                          : _results
                              .where((r) => classGroupForItemClass(r.itemClass) == active)
                              .toList();
                      if (shown.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              _results.isEmpty
                                  ? (widget.excludeIds.isEmpty
                                      ? 'No items match. Tweak the search or add this item in Masters.'
                                      : 'No more items to add — everything matching is already in the draft.')
                                  : 'No items in this group. Try another tab.',
                              textAlign: TextAlign.center,
                              style: RunqText.caption.copyWith(color: t.muted),
                            ),
                          ),
                        );
                      }
                      return ListView.separated(
                        controller: scrollCtrl,
                        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: const EdgeInsets.only(bottom: 8),
                        itemCount: shown.length,
                        separatorBuilder: (_, __) => Divider(
                            height: 1, color: t.hairlineSoft, thickness: 0.5),
                        itemBuilder: (_, i) {
                          final r = shown[i];
                            final selected = _selected.containsKey(r.id);
                            return InkWell(
                              onTap: () => _toggle(r),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 10),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(r.name,
                                              style: RunqText.bodyStrong
                                                  .copyWith(color: t.ink, fontSize: 14)),
                                          if ((r.sku ?? '').isNotEmpty ||
                                              (r.unit ?? '').isNotEmpty) ...[
                                            const SizedBox(height: 2),
                                            Text(
                                              [
                                                if ((r.sku ?? '').isNotEmpty) r.sku!,
                                                if ((r.unit ?? '').isNotEmpty) r.unit!,
                                              ].join(' · '),
                                              style: RunqText.caption
                                                  .copyWith(color: t.muted),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    // Custom square check — bigger tap target
                                    // than the default Checkbox without the
                                    // Material padding gymnastics.
                                    Container(
                                      width: 22, height: 22,
                                      decoration: BoxDecoration(
                                        color: selected ? brand : Colors.transparent,
                                        border: Border.all(
                                          color: selected ? brand : t.hairline,
                                          width: 1.5,
                                        ),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: selected
                                          ? const Icon(Icons.check,
                                              size: 14, color: Colors.white)
                                          : null,
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                      );
                    }),
            ),
            // Footer action bar — sticky, only enabled when something's
            // ticked. Pops the entire selection so the parent can dedupe
            // and append in one setState.
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: InvPrimaryButton(
                  label: _selected.isEmpty
                      ? 'Pick at least one product'
                      : 'Add ${_selected.length} product${_selected.length == 1 ? '' : 's'}',
                  icon: Icons.add,
                  onTap: _selected.isEmpty
                      ? null
                      : () => Navigator.of(context).pop(_selected.values.toList()),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Adjustment detail sheet — line items + meta for one adjustment ───────

class _AdjDetailSheet extends StatefulWidget {
  const _AdjDetailSheet({required this.adj});
  final InvAdjustment adj;
  @override
  State<_AdjDetailSheet> createState() => _AdjDetailSheetState();
}

class _AdjDetailSheetState extends State<_AdjDetailSheet> {
  InvAdjustmentDetail? _detail;
  Object? _err;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await inventoryRepo.adjustmentGet(widget.adj.id);
      if (!mounted) return;
      setState(() { _detail = d; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _err = e; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            _SheetHeader(
              title: widget.adj.adjNo,
              onClose: () => Navigator.of(context).pop(),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _err != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text('Failed to load: $_err',
                                textAlign: TextAlign.center,
                                style: RunqText.caption.copyWith(color: t.muted)),
                          ),
                        )
                      : _buildBody(scrollCtrl),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ScrollController scrollCtrl) {
    final t = RT(context);
    final d = _detail!;
    final isOutbound = _outboundReasons.contains(d.reason);
    final reasonColor = isOutbound ? InvColors.error : InvColors.success;
    final reasonBg = isOutbound
        ? InvColors.error.withValues(alpha: 0.10)
        : InvColors.success.withValues(alpha: 0.10);
    final reasonLabel = _reasonLabels[d.reason] ?? d.reason;
    final deltaText = d.totalValueDelta == 0
        ? '—'
        : '${d.totalValueDelta > 0 ? '+' : '-'}${compactINR(d.totalValueDelta.abs())}';
    final deltaColor = d.totalValueDelta < 0
        ? InvColors.error
        : d.totalValueDelta > 0
            ? InvColors.success
            : t.muted;
    return ListView(
      controller: scrollCtrl,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Icon(Icons.store_outlined, size: 14, color: t.muted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(d.warehouseName,
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  InvStatusPill(status: d.status),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: reasonBg,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      reasonLabel,
                      style: RunqText.micro.copyWith(color: reasonColor, letterSpacing: 0.3),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (d.adjustmentDate.isNotEmpty)
                    Text(d.adjustmentDate,
                        style: RunqText.caption.copyWith(color: t.muted)),
                  const Spacer(),
                  Text(deltaText,
                      style: RunqText.bodyStrong.copyWith(color: deltaColor, fontSize: 14)),
                ],
              ),
            ],
          ),
        ),
        if ((d.notes ?? '').isNotEmpty) ...[
          const SizedBox(height: 12),
          _MetaRow(icon: Icons.sticky_note_2_outlined, label: 'Notes', value: d.notes!),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Text('Items', style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
            const SizedBox(width: 6),
            Text('(${d.lines.length})',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        const SizedBox(height: 8),
        if (d.lines.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Center(
              child: Text('No line items',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ),
          )
        else
          for (var i = 0; i < d.lines.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _DetailLineCard(line: d.lines[i]),
          ],
      ],
    );
  }
}

class _DetailLineCard extends StatelessWidget {
  const _DetailLineCard({required this.line});
  final InvAdjustmentDetailLine line;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isNegative = line.qtyDelta < 0;
    final mag = line.qtyDelta.abs();
    final qtyStr = mag == mag.truncateToDouble()
        ? mag.toInt().toString()
        : mag.toStringAsFixed(2);
    final qtyColor = isNegative ? InvColors.error : InvColors.success;
    final qtyPrefix = isNegative ? '−' : '+';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.inventory_2_outlined, size: 16, color: t.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.itemName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                if ((line.itemSku ?? '').isNotEmpty || (line.batchNo ?? '').isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    [
                      if ((line.itemSku ?? '').isNotEmpty) line.itemSku!,
                      if ((line.batchNo ?? '').isNotEmpty) 'Batch ${line.batchNo!}',
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text('$qtyPrefix$qtyStr',
              style: RunqText.bodyStrong.copyWith(color: qtyColor, fontSize: 14)),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: t.muted),
          const SizedBox(width: 8),
          Text('$label: ',
              style: RunqText.caption.copyWith(color: t.muted)),
          Expanded(
            child: Text(value,
                style: RunqText.caption.copyWith(color: t.ink),
                maxLines: 3, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}

// ── Local sheet chrome ───────────────────────────────────────────────────

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.title, required this.onClose});
  final String title;
  final VoidCallback onClose;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 10),
        Container(
          width: 36, height: 4,
          decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 12, 8),
          child: Row(children: [
            Expanded(child: Text(title, style: RunqText.h3.copyWith(color: t.ink))),
            Material(
              color: t.bgWarmer,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onClose,
                child: SizedBox(
                  width: 28, height: 28,
                  child: Icon(Icons.close, size: 14, color: t.muted),
                ),
              ),
            ),
          ]),
        ),
      ],
    );
  }
}

class _Lbl extends StatelessWidget {
  const _Lbl(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Text(label.toUpperCase(),
        style: RunqText.label.copyWith(color: RT(context).muted, letterSpacing: 0.5)),
  );
}

InputDecoration _dec(BuildContext context, {String? hint, Widget? suffix}) {
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
