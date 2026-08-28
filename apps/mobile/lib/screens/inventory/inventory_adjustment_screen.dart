// Adjustments — list + stock-take-style create screen. Tap "+" opens a
// full screen: pick warehouse + reason at top, the warehouse's on-hand
// rows render below, tap any row to enter a delta in a bottom sheet.
// POST lives in the AppBar (amber pill). "Add product not on hand" footer
// pushes inventory_adjustment_item_picker_screen.dart for found-stock items
// the warehouse doesn't currently hold.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'inventory_adjustment_item_picker_screen.dart';
import 'inventory_adjustment_common.dart';
import 'inventory_adjustment_line_screen.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';
import '../../widgets/runq_snack.dart';
import '../../utils/format_qty.dart';

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
              child: Text(
                'Failed to load: $e',
                style: RunqText.caption.copyWith(color: t.muted),
                textAlign: TextAlign.center,
              ),
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
                  child: _AdjTile(adj: list[i], onTap: () => _openDetail(context, ref, list[i])),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _openDetail(BuildContext context, WidgetRef ref, InvAdjustment adj) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AdjDetailSheet(adj: adj),
    );
    // Posting or discarding from the sheet changes both the document's status
    // and, for a post, the stock behind it.
    if (changed == true) {
      ref.invalidate(invAdjustmentListProvider(null));
      invalidateStockViews(ref);
    }
  }

  void _openSheet(BuildContext context, WidgetRef ref) async {
    final created = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const _NewAdjustmentScreen()));
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
            width: 32,
            height: 32,
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
    final outbound = list.where((a) => invOutboundReasons.contains(a.reason)).length;
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
          Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 4),
          Text(
            value,
            style: RunqText.numberLg.copyWith(color: valueColor, fontSize: 20, height: 1.15),
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
    final isOutbound = invOutboundReasons.contains(adj.reason);
    final reasonColor = isOutbound ? InvColors.error : InvColors.success;
    final reasonBg = isOutbound
        ? InvColors.error.withValues(alpha: 0.10)
        : InvColors.success.withValues(alpha: 0.10);
    final reasonLabel = invReasonLabels[adj.reason] ?? _humanize(adj.reason);
    final deltaText = delta == 0 ? '—' : '${delta > 0 ? '+' : '-'}${compactINR(delta.abs())}';
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
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
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
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (_itemsPreview != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    _itemsPreview!,
                    style: RunqText.caption.copyWith(color: t.ink2),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
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
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
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

  /// Item ids whose batch rows are expanded. The list shows ONE row per item
  /// with its total on hand; a batch-tracked SKU can hold dozens of
  /// consignments and listing them all buried the three products this
  /// warehouse actually stocks. Adjustments still post against a batch, so
  /// the batches stay one tap away rather than being hidden.
  final Set<String> _expandedItems = {};
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

  Future<void> _openLineScreen({
    required String itemId,
    required String itemName,
    String? itemSku,
    String? itemUnit,
    String? batchNo,
    bool tracksBatches = false,
    required double availSnapshot,
  }) async {
    // An on-hand row always carries its batch; only an item picked with no
    // stock at this warehouse can be batch-tracked and batch-less.
    final needsBatchNo = tracksBatches && (batchNo ?? '').isEmpty;
    final key = _draftKey(itemId, batchNo);
    final existing = _drafts[key];
    final result = await pushAdjLineScreen(
      context,
      itemName: itemName,
      itemSku: itemSku,
      itemUnit: itemUnit,
      batchNo: batchNo,
      needsBatchNo: needsBatchNo,
      availSnapshot: availSnapshot,
      // Default direction: Remove if there's on-hand to take from,
      // otherwise Add (matches the most common intent on each row).
      initialIsOutbound: existing?.isOutbound ?? (availSnapshot > 0),
      initialReason: existing?.reason,
      initialQty: existing?.unsignedQty,
    );
    if (result == null || !mounted) return;
    // A batch typed in the sheet becomes part of the draft's identity, so two
    // batches of the same item stay separate rows.
    final resolvedBatch = result.batchNo ?? batchNo;
    final resolvedKey = _draftKey(itemId, resolvedBatch);
    setState(() {
      if (result.cleared) {
        _drafts.remove(key);
      } else {
        _drafts[resolvedKey] = _AdjDraft(
          itemId: itemId,
          itemName: itemName,
          itemSku: itemSku,
          itemUnit: itemUnit,
          batchNo: resolvedBatch,
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
    final picked = await pushAdjItemPicker(
      context,
      excludeIds: _drafts.values.map((d) => d.itemId).toSet(),
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    for (final item in picked) {
      if (!mounted) break;
      await _openLineScreen(
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        itemUnit: item.unit,
        batchNo: null,
        tracksBatches: item.trackBatches,
        availSnapshot: 0,
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
        try {
          await inventoryRepo.postAdjustment(a.id);
        } catch (e) {
          // Create and post are two calls, so a rejected post used to leave the
          // draft behind — unpostable, and with no way to finish or discard it
          // from here. Cancelling keeps the attempt in the audit trail without
          // parking a document nobody can act on; the draft rows are still on
          // screen, so the user fixes the cause and posts again.
          await inventoryRepo
              .cancelAdjustment(a.id, 'Auto-cancelled — posting failed')
              .catchError((_) => a);
          rethrow;
        }
        adjNos.add(a.adjNo);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
      RunqSnack.success(
        context,
        adjNos.length == 1 ? '${adjNos.first} posted' : '${adjNos.length} adjustments posted',
      );
    } catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, "Couldn't post the adjustment", description: snackErrorText(e));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final onHand = warehouseId == null
        ? null
        : ref.watch(
            invOnHandProvider((warehouseId: warehouseId, lowOnly: false, itemClassGroup: null)),
          );
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
            padding: const EdgeInsets.only(top: 4, bottom: 8),
            color: t.bgWarm,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Warehouse and search carry their own horizontal padding so
                // the class strip between them can sit flush and bleed to the
                // screen edge when its pills overflow.
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: WarehousePicker(
                    value: warehouseId,
                    onChanged: _onWarehouseChanged,
                    allowAll: false,
                    dense: true,
                  ),
                ),
                const SizedBox(height: 8),
                // Type pills above the search box — narrow to a bucket
                // first, then search inside it.
                if (warehouseId != null)
                  onHand!.maybeWhen(
                    data: (rows) => _classStrip(rows),
                    orElse: () => const SizedBox.shrink(),
                  ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: InvSearchBar(
                    controller: _searchCtl,
                    onChanged: (v) => setState(() => _query = v.trim()),
                    hint: 'Item, SKU or batch…',
                  ),
                ),
              ],
            ),
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
    return resolveDefaultClassGroup(_classGroup, _bucketCounts(rows));
  }

  /// Pill counts are per DISTINCT ITEM. A raw-milk SKU with 16 consignments
  /// is one product on hand, not sixteen.
  Map<String, int> _bucketCounts(List<InvOnHandRow> rows) =>
      bucketCountsForItems(rows.map((r) => (itemId: r.itemId, itemClass: r.itemClass)));

  /// Class strip sits outside the padded block so the pills can bleed to the
  /// screen edge when they overflow, same as the on-hand screen.
  Widget _classStrip(List<InvOnHandRow> rows) {
    final counts = _bucketCounts(rows);
    // Always rendered, every bucket shown. It used to hide itself whenever
    // one bucket held everything — which is exactly the warehouse where a
    // user wonders why they can't see the other types at all.
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InvClassTabs(
        selected: _effectiveClassGroup(rows),
        counts: counts,
        showEmpty: true,
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
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: RunqText.caption.copyWith(color: t.muted),
        ),
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
      if (group != classGroupAll && classGroupForItemClass(r.itemClass) != group) {
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
      final group = parent.isNotEmpty ? parent : (leaf.isNotEmpty ? leaf : uncategorised);
      // A leaf equal to its parent (or absent) means the item sits directly on
      // the top-level category — no sub-heading worth drawing.
      final sub = (leaf.isEmpty || leaf == group) ? '' : leaf;
      tree
          .putIfAbsent(group, () => <String, List<InvOnHandRow>>{})
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
      // Section count is products, not batch rows — same unit as the pills.
      final total = tree[g]!.values.expand((l) => l).map((r) => r.itemId).toSet().length;
      out.add(_ListEntry.group(g, total));
      for (final s in subs) {
        if (s.isNotEmpty) out.add(_ListEntry.sub(s));
        for (final batches in _byItem(tree[g]![s]!)) {
          // A single-batch product has nothing to drill into, so it stays a
          // plain row that opens the qty sheet directly.
          if (batches.length == 1) {
            out.add(_ListEntry.row(batches.first));
            continue;
          }
          out.add(_ListEntry.item(batches));
          if (_expandedItems.contains(batches.first.itemId)) {
            out.addAll(batches.map((b) => _ListEntry.row(b, indented: true)));
          }
        }
      }
    }
    return out;
  }

  /// Group on-hand rows by item, keeping the incoming (name-sorted) order.
  /// Each inner list is one product's batches, biggest batch first so the
  /// pool a user most likely means to adjust is at the top.
  List<List<InvOnHandRow>> _byItem(List<InvOnHandRow> rows) {
    final byItem = <String, List<InvOnHandRow>>{};
    for (final r in rows) {
      byItem.putIfAbsent(r.itemId, () => <InvOnHandRow>[]).add(r);
    }
    for (final list in byItem.values) {
      list.sort((a, b) => b.qty.compareTo(a.qty));
    }
    return byItem.values.toList();
  }

  /// Drafts for stock this warehouse doesn't hold — added through "Add product
  /// not on hand", so no row in the on-hand query represents them.
  ///
  /// Without this they were drafted into an invisible document: nothing on the
  /// screen changed, and the only proof the item was going in arrived after
  /// posting. They get their own band at the top rather than being filed into
  /// a category, because "not on hand" is the useful thing to say about them
  /// and the draft carries no category to file them under anyway.
  List<_AdjDraft> _draftsNotOnHand(List<InvOnHandRow> rows) {
    final onHandKeys = rows
        .map((r) => _draftKey(r.itemId, r.batchNo.isEmpty ? null : r.batchNo))
        .toSet();
    final out = _drafts.entries
        .where((e) => !onHandKeys.contains(e.key))
        .map((e) => e.value)
        .toList();
    out.sort((a, b) => a.itemName.toLowerCase().compareTo(b.itemName.toLowerCase()));
    return out;
  }

  /// A draft rendered as a zero-qty on-hand row, so one tile draws both cases.
  InvOnHandRow _rowForDraft(_AdjDraft d) => InvOnHandRow(
    itemId: d.itemId,
    itemName: d.itemName,
    itemSku: d.itemSku,
    itemUnit: d.itemUnit,
    warehouseId: warehouseId ?? '',
    warehouseName: '',
    batchNo: d.batchNo ?? '',
    qty: 0,
    avgCost: 0,
    value: 0,
  );

  Widget _buildList(BuildContext context, List<InvOnHandRow> rows) {
    final visible = _visibleRows(rows);
    final incoming = _draftsNotOnHand(rows);
    if (visible.isEmpty && incoming.isEmpty) {
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
    final entries = <_ListEntry>[
      if (incoming.isNotEmpty) ...[
        _ListEntry.group('Adding — not currently on hand', incoming.length),
        ...incoming.map((d) => _ListEntry.row(_rowForDraft(d))),
      ],
      ..._sectioned(visible),
    ];
    return ListView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 32),
      itemCount: entries.length + 2,
      itemBuilder: (ctx, idx) {
        // Incoming rows count toward "shown" — they are on screen, even though
        // they are absent from the on-hand total they'd otherwise be measured against.
        if (idx == 0) {
          // Counted in products so the header agrees with the pills and the
          // section headings. Batch rows would say "29" for three SKUs.
          final totalItems = rows.map((r) => r.itemId).toSet().length;
          final shownItems = visible.map((r) => r.itemId).toSet().length + incoming.length;
          return _listHeader(context, totalItems, shownItems);
        }
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
            style: RunqText.caption.copyWith(color: t.muted, fontWeight: FontWeight.w600),
          ),
        );
      case _EntryKind.item:
        final first = e.row!;
        final expanded = _expandedItems.contains(first.itemId);
        final totalQty = e.batches.fold<double>(0, (a, b) => a + b.qty);
        final drafted = e.batches
            .where(
              (b) => _drafts.containsKey(_draftKey(b.itemId, b.batchNo.isEmpty ? null : b.batchNo)),
            )
            .length;
        return Column(
          children: [
            _ItemGroupTile(
              row: first,
              totalQty: totalQty,
              batchCount: e.batches.length,
              draftedCount: drafted,
              expanded: expanded,
              onTap: () => setState(() {
                if (expanded) {
                  _expandedItems.remove(first.itemId);
                } else {
                  _expandedItems.add(first.itemId);
                }
              }),
            ),
            Divider(height: 1, color: t.hairlineSoft, indent: 16, endIndent: 16),
          ],
        );
      case _EntryKind.row:
        final r = e.row!;
        final batchNo = r.batchNo.isEmpty ? null : r.batchNo;
        final draft = _drafts[_draftKey(r.itemId, batchNo)];
        return Column(
          children: [
            Padding(
              padding: EdgeInsets.only(left: e.indented ? 16 : 0),
              child: _OnHandTile(
                row: r,
                draft: draft,
                onTap: () => _openLineScreen(
                  itemId: r.itemId,
                  itemName: r.itemName,
                  itemSku: r.itemSku,
                  itemUnit: r.itemUnit,
                  batchNo: batchNo,
                  availSnapshot: r.qty,
                ),
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

enum _EntryKind { group, sub, item, row }

/// One rendered line in the sectioned list: a category heading, a
/// sub-category sub-heading, or an item row.
class _ListEntry {
  const _ListEntry._(
    this.kind, {
    this.label,
    this.count = 0,
    this.row,
    this.batches = const [],
    this.indented = false,
  });
  factory _ListEntry.group(String label, int count) =>
      _ListEntry._(_EntryKind.group, label: label, count: count);
  factory _ListEntry.sub(String label) => _ListEntry._(_EntryKind.sub, label: label);
  factory _ListEntry.row(InvOnHandRow row, {bool indented = false}) =>
      _ListEntry._(_EntryKind.row, row: row, indented: indented);

  /// One product, carrying every on-hand batch row behind it. [row] holds the
  /// first batch so the tile can read name / sku / unit off it.
  factory _ListEntry.item(List<InvOnHandRow> batches) =>
      _ListEntry._(_EntryKind.item, row: batches.first, batches: batches);

  final _EntryKind kind;
  final String? label;
  final int count;
  final InvOnHandRow? row;
  final List<InvOnHandRow> batches;

  /// Batch row shown under an expanded product — inset so the hierarchy
  /// reads without needing a second divider style.
  final bool indented;
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

/// One product, collapsed. Shows the total across every batch plus how many
/// batches sit behind it; tapping expands them. Batch rows render with the
/// existing [_OnHandTile], indented under this one.
class _ItemGroupTile extends StatelessWidget {
  const _ItemGroupTile({
    required this.row,
    required this.totalQty,
    required this.batchCount,
    required this.draftedCount,
    required this.expanded,
    required this.onTap,
  });
  final InvOnHandRow row;
  final double totalQty;
  final int batchCount;
  final int draftedCount;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    final subParts = <String>[
      if ((row.itemUnit ?? '').isNotEmpty) row.itemUnit!,
      if ((row.itemSku ?? '').isNotEmpty) row.itemSku!,
      '$batchCount batches',
    ];
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      row.itemName,
                      style: RunqText.body.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            subParts.join(' · '),
                            style: RunqText.caption.copyWith(color: t.muted2),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (draftedCount > 0) ...[
                          const SizedBox(width: 6),
                          Text(
                            '$draftedCount adjusted',
                            style: RunqText.caption.copyWith(
                              color: brand,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: t.bgWarmer,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  invFmtQty(totalQty),
                  style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink),
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                size: 20,
                color: t.muted2,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnHandTile extends StatelessWidget {
  const _OnHandTile({required this.row, required this.draft, required this.onTap});
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
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subParts.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      subParts.join(' · '),
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
                // Drafted rows read "0 → 20": the number that matters before
                // posting is what the shelf will say afterwards, and a delta
                // alone left the user doing the arithmetic.
                _QtyPill(
                  text: hasDraft
                      ? '${invFmtQty(row.qty)} → ${invFmtQty(row.qty + signedDelta)}'
                      : invFmtQty(row.qty),
                  emphasis: hasDraft,
                ),
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
                          ? '+${invFmtQty(signedDelta)}'
                          : '-${invFmtQty(signedDelta.abs())}',
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
  const _QtyPill({required this.text, this.emphasis = false});
  final String text;

  /// Tints the pill for a row carrying an unposted change, so a scan of the
  /// list separates "this is the stock" from "this is what it will become".
  final bool emphasis;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: emphasis ? brand.withValues(alpha: 0.10) : t.bgWarmer,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: emphasis ? brand.withValues(alpha: 0.35) : t.hairlineSoft),
      ),
      child: Text(
        text,
        style: RunqText.caption.copyWith(
          color: emphasis ? brand : t.ink,
          fontWeight: FontWeight.w600,
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
                    width: 12,
                    height: 12,
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
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await inventoryRepo.adjustmentGet(widget.adj.id);
      if (!mounted) return;
      setState(() {
        _detail = d;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _err = e;
        _loading = false;
      });
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
            _SheetHeader(title: widget.adj.adjNo, onClose: () => Navigator.of(context).pop()),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _err != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Text(
                          'Failed to load: $_err',
                          textAlign: TextAlign.center,
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
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
    final isOutbound = invOutboundReasons.contains(d.reason);
    final reasonColor = isOutbound ? InvColors.error : InvColors.success;
    final reasonBg = isOutbound
        ? InvColors.error.withValues(alpha: 0.10)
        : InvColors.success.withValues(alpha: 0.10);
    final reasonLabel = invReasonLabels[d.reason] ?? d.reason;
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
          decoration: BoxDecoration(color: t.bgWarmer, borderRadius: BorderRadius.circular(10)),
          child: Column(
            children: [
              Row(
                children: [
                  Icon(Icons.store_outlined, size: 14, color: t.muted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      d.warehouseName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
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
                    Text(d.adjustmentDate, style: RunqText.caption.copyWith(color: t.muted)),
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
        if ((d.notes ?? '').isNotEmpty) ...[
          const SizedBox(height: 12),
          _MetaRow(icon: Icons.sticky_note_2_outlined, label: 'Notes', value: d.notes!),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Text('Items', style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
            const SizedBox(width: 6),
            Text('(${d.lines.length})', style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        const SizedBox(height: 8),
        if (d.lines.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Center(
              child: Text('No line items', style: RunqText.caption.copyWith(color: t.muted)),
            ),
          )
        else
          for (var i = 0; i < d.lines.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _DetailLineCard(line: d.lines[i]),
          ],
        if (_isUnfinished(d.status)) ...[const SizedBox(height: 20), _draftActions(d)],
      ],
    );
  }

  /// A document that has been created but hasn't moved stock yet. Until now the
  /// sheet was read-only, so one of these could only be looked at — a draft
  /// whose post had failed sat on the list permanently with no way to finish or
  /// discard it from the app.
  bool _isUnfinished(String status) => status == 'draft' || status == 'pending_approval';

  Widget _draftActions(InvAdjustmentDetail d) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'This adjustment has not moved any stock yet.',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
        const SizedBox(height: 10),
        InvPrimaryButton(
          label: _busy ? 'Posting…' : 'Post adjustment',
          icon: Icons.check_circle_outline,
          onTap: _busy ? null : () => _post(d),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _busy ? null : () => _cancel(d),
          style: OutlinedButton.styleFrom(
            foregroundColor: InvColors.error,
            side: BorderSide(color: InvColors.error.withValues(alpha: 0.4)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          child: const Text('Discard'),
        ),
      ],
    );
  }

  Future<void> _post(InvAdjustmentDetail d) =>
      _act(d, () => inventoryRepo.postAdjustment(d.id), '${d.adjNo} posted — stock updated');

  Future<void> _cancel(InvAdjustmentDetail d) => _act(
    d,
    () => inventoryRepo.cancelAdjustment(d.id, 'Discarded from mobile'),
    '${d.adjNo} discarded',
  );

  /// Runs an action, closes the sheet on success, and keeps it open on failure
  /// so the reason stays next to the document it belongs to. The messenger is
  /// captured before the pop — afterwards this context has no scaffold.
  Future<void> _act(
    InvAdjustmentDetail d,
    Future<void> Function() action,
    String successMessage,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnackOn(messenger, successMessage, kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      // Surfaced verbatim: the ledger's reason ("Batch number is required for
      // this item") is the only thing that says why it will not post.
      showRunqSnackOn(messenger, snackErrorText(e), kind: SnackKind.error);
    }
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
    final qtyStr = formatItemQty(mag, line.itemClass, unit: line.itemUnit);
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
                Text(
                  line.itemName,
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
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
          Text(
            '$qtyPrefix$qtyStr',
            style: RunqText.bodyStrong.copyWith(color: qtyColor, fontSize: 14),
          ),
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
          Text('$label: ', style: RunqText.caption.copyWith(color: t.muted)),
          Expanded(
            child: Text(
              value,
              style: RunqText.caption.copyWith(color: t.ink),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
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
          width: 36,
          height: 4,
          decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 12, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(title, style: RunqText.h3.copyWith(color: t.ink)),
              ),
              Material(
                color: t.bgWarmer,
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: onClose,
                  child: SizedBox(
                    width: 28,
                    height: 28,
                    child: Icon(Icons.close, size: 14, color: t.muted),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
