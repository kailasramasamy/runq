// Reclaim — the morning teardown of unsold packets.
//
// Built for a technician at 6am, not an accountant. They count what did not
// sell and say what it is for. That is the whole interaction:
//
//     Farm Fresh Cow Milk   642 in stock
//     [ 120 ] packets  ->  61.2 Litre  ->  (Curd)
//
// Everything else is derived server-side from the BOMs — which raw material a
// pack releases, how much, the batch number, the expiry. Asking the floor for
// litres, batch codes and expiry dates is how a two-minute job becomes a
// five-minute one that gets skipped.
//
// The destination is intent only. The curd itself is made later as its own
// production run, so stock stays true about what physically exists right now.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../inventory/widgets/warehouse_picker.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// Options are per-warehouse: what is on the shelf drives what can be opened.
final reclaimOptionsProvider = FutureProvider.autoDispose
    .family<List<ReclaimOption>, String>((ref, warehouseId) async {
  return manufacturingRepo.reclaimOptions(warehouseId);
});

class ReclaimScreen extends ConsumerStatefulWidget {
  const ReclaimScreen({super.key});

  @override
  ConsumerState<ReclaimScreen> createState() => _ReclaimScreenState();
}

class _ReclaimScreenState extends ConsumerState<ReclaimScreen> {
  String? _warehouseId;
  bool _busy = false;

  /// Packet count and chosen destination, keyed by FG item id. Only products
  /// the technician actually typed into become lines.
  final Map<String, _Entry> _entries = {};

  @override
  void initState() {
    super.initState();
    _applyDefaultWarehouse();
  }

  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final pick = whs.firstWhere((w) => w.isDefault, orElse: () => whs.first);
    setState(() => _warehouseId = pick.id);
  }

  List<MapEntry<String, _Entry>> get _filled =>
      _entries.entries.where((e) => e.value.packets > 0).toList();

  Future<void> _submit(List<ReclaimOption> options) async {
    final filled = _filled;
    if (filled.isEmpty || _busy) return;
    final byId = {for (final o in options) o.fgItemId: o};

    setState(() => _busy = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final draft = await manufacturingRepo.createReclaim(
        warehouseId: _warehouseId!,
        reclaimDate: today,
        lines: [
          for (final e in filled)
            {
              'fgItemId': e.key,
              'fgQty': e.value.packets,
              if (e.value.destinationItemId != null)
                'destinationItemId': e.value.destinationItemId,
            },
        ],
      );
      final posted = await manufacturingRepo.postReclaim(draft.id);
      if (!mounted) return;

      invalidateStockViews(ref);
      ref.invalidate(mfgDashboardProvider);
      ref.invalidate(reclaimOptionsProvider);

      final msg = posted.warnings.isEmpty
          ? '${_recoveredSummary(filled, byId)} recovered · ${posted.data.reclaimNo}'
          : '${posted.data.reclaimNo} — ${posted.warnings.join(' · ')}';
      showRunqSnack(context, msg, kind: SnackKind.success);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final options = _warehouseId == null
        ? null
        : ref.watch(reclaimOptionsProvider(_warehouseId!));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: const MfgPlainAppBar(title: 'Unsold stock'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 8),
            child: WarehousePicker(
              value: _warehouseId,
              onChanged: (v) => setState(() {
                _warehouseId = v;
                _entries.clear();
              }),
              allowAll: false,
              dense: true,
            ),
          ),
          Expanded(
            child: options == null
                ? const SizedBox.shrink()
                : options.when(
                    loading: () => const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'Could not load: $e',
                          textAlign: TextAlign.center,
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                      ),
                    ),
                    data: _buildList,
                  ),
          ),
        ],
      ),
      bottomNavigationBar: options?.valueOrNull == null
          ? null
          : _SubmitBar(
              entries: _filled,
              options: options!.value!,
              busy: _busy,
              onSubmit: () => _submit(options.value!),
            ),
    );
  }

  Widget _buildList(List<ReclaimOption> options) {
    if (options.isEmpty) {
      return const MfgEmptyState(
        icon: Icons.recycling_rounded,
        title: 'Nothing to reclaim',
        description:
            'Reclaim needs a product in stock with an active recipe behind it.',
      );
    }
    final sections = _sectioned(options);
    return ListView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
      itemCount: sections.length,
      itemBuilder: (_, i) {
        final s = sections[i];
        if (s.heading != null) {
          return Padding(
            padding: EdgeInsets.fromLTRB(2, i == 0 ? 2 : 14, 2, 8),
            child: _SectionHeading(label: s.heading!, isGroup: s.isGroup),
          );
        }
        final o = s.option!;
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _ProductCard(
            option: o,
            entry: _entries[o.fgItemId],
            onChanged: (e) => setState(() {
              if (e == null) {
                _entries.remove(o.fgItemId);
              } else {
                _entries[o.fgItemId] = e;
              }
            }),
          ),
        );
      },
    );
  }

  /// Flatten into category > sub-category > products. Uncategorised items
  /// collect under "Other" at the bottom rather than being dropped.
  List<_Section> _sectioned(List<ReclaimOption> options) {
    const other = 'Other';
    final tree = <String, Map<String, List<ReclaimOption>>>{};
    for (final o in options) {
      final leaf = (o.categoryName ?? '').trim();
      final parent = (o.categoryGroup ?? '').trim();
      final group = parent.isNotEmpty ? parent : (leaf.isNotEmpty ? leaf : other);
      // Leaf equal to its parent means the item sits directly on a top-level
      // category — no sub-heading worth drawing.
      final sub = (leaf.isEmpty || leaf == group) ? '' : leaf;
      tree.putIfAbsent(group, () => {}).putIfAbsent(sub, () => []).add(o);
    }

    final groups = tree.keys.toList()
      ..sort((a, b) {
        if (a == other) return 1;
        if (b == other) return -1;
        return a.toLowerCase().compareTo(b.toLowerCase());
      });

    final out = <_Section>[];
    for (final g in groups) {
      final subs = tree[g]!.keys.toList()
        ..sort((a, b) {
          if (a.isEmpty) return -1;
          if (b.isEmpty) return 1;
          return a.toLowerCase().compareTo(b.toLowerCase());
        });
      // A single unnamed sub-group means the category has no depth worth
      // showing — skip the group header rather than print a band over one row.
      if (groups.length > 1 || subs.length > 1 || subs.first.isNotEmpty) {
        out.add(_Section.heading(g, isGroup: true));
      }
      for (final s in subs) {
        if (s.isNotEmpty) out.add(_Section.heading(s, isGroup: false));
        for (final o in tree[g]![s]!) {
          out.add(_Section.product(o));
        }
      }
    }
    return out;
  }
}

/// One row in the flattened list: a heading or a product card.
class _Section {
  const _Section._({this.heading, this.isGroup = false, this.option});
  factory _Section.heading(String label, {required bool isGroup}) =>
      _Section._(heading: label, isGroup: isGroup);
  factory _Section.product(ReclaimOption o) => _Section._(option: o);

  final String? heading;
  final bool isGroup;
  final ReclaimOption? option;
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.label, required this.isGroup});
  final String label;
  final bool isGroup;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Text(
      isGroup ? label.toUpperCase() : label,
      style: isGroup
          ? RunqText.label.copyWith(
              color: t.ink2,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w700,
            )
          : RunqText.caption.copyWith(color: t.muted, fontWeight: FontWeight.w600),
    );
  }
}

/// What the technician entered for one product.
class _Entry {
  const _Entry({required this.packets, this.destinationItemId});
  final double packets;
  final String? destinationItemId;

  _Entry copyWith({double? packets, String? destinationItemId, bool clearDest = false}) =>
      _Entry(
        packets: packets ?? this.packets,
        destinationItemId: clearDest ? null : (destinationItemId ?? this.destinationItemId),
      );
}

class _ProductCard extends StatefulWidget {
  const _ProductCard({
    required this.option,
    required this.entry,
    required this.onChanged,
  });
  final ReclaimOption option;
  final _Entry? entry;
  final ValueChanged<_Entry?> onChanged;

  @override
  State<_ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<_ProductCard> {
  late final TextEditingController _ctl =
      TextEditingController(text: widget.entry == null ? '' : _fmt(widget.entry!.packets));

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  void _onPackets(String raw) {
    final n = double.tryParse(raw.trim()) ?? 0;
    if (n <= 0) {
      widget.onChanged(null);
      return;
    }
    final dests = widget.option.destinations;
    widget.onChanged(
      (widget.entry ?? _Entry(packets: n, destinationItemId: dests.length == 1 ? dests.first.itemId : null))
          .copyWith(packets: n),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final o = widget.option;
    final entry = widget.entry;
    final packets = entry?.packets ?? 0;
    final overStock = packets > o.onHandQty;
    final litres = packets * o.yieldPerUnit;

    return MfgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(o.fgItemName,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 4),
                    // The stock figure is the number the technician checks
                    // their count against, so it reads as a value rather than
                    // as small print under the name.
                    Row(
                      children: [
                        Text(
                          _fmt(o.onHandQty),
                          style: RunqText.bodyStrong.copyWith(
                            color: t.ink,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'in stock'
                          '${(o.fgUnit ?? '').isEmpty ? '' : ' · ${o.fgUnit}'}',
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    // The ceiling for this row. Shown before anything is typed
                    // so the technician knows what the whole shelf is worth
                    // reclaiming without doing the multiplication.
                    Text(
                      'up to ${_fmt(o.projectedRecoveryQty)}'
                      '${(o.recoveredUnit ?? '').isEmpty ? '' : ' ${o.recoveredUnit}'}'
                      ' ${o.recoveredItemName}',
                      style: RunqText.caption.copyWith(color: t.muted2),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 96,
                child: TextField(
                  controller: _ctl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textCapitalization: TextCapitalization.none,
                  textAlign: TextAlign.right,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
                  onChanged: _onPackets,
                  decoration: InputDecoration(
                    hintText: '0',
                    labelText: 'Packs',
                    filled: true,
                    fillColor: t.bgWarm,
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(
                        color: overStock ? MfgColors.error : t.hairline,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (packets > 0) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.south_rounded, size: 14, color: MfgColors.brand(context)),
                const SizedBox(width: 6),
                Text(
                  '${_fmt(litres)} ${o.recoveredUnit ?? ''} ${o.recoveredItemName}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                ),
              ],
            ),
            if (overStock) ...[
              const SizedBox(height: 6),
              Text(
                'Only ${_fmt(o.onHandQty)} in stock',
                style: RunqText.caption.copyWith(color: MfgColors.error),
              ),
            ],
            if (o.destinations.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text('FOR', style: RunqText.label.copyWith(color: t.muted)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final d in o.destinations)
                    _DestChip(
                      label: d.itemName,
                      active: entry?.destinationItemId == d.itemId,
                      onTap: () => widget.onChanged(
                        entry!.copyWith(destinationItemId: d.itemId),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _DestChip extends StatelessWidget {
  const _DestChip({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: active ? brand : t.bgWarm,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? brand : t.hairline),
        ),
        child: Text(
          label,
          style: RunqText.caption.copyWith(
            color: active ? Colors.white : t.ink,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

/// Running total plus the post button. Keeping the total on the button means
/// the technician can confirm the morning's number without scrolling back up.
class _SubmitBar extends StatelessWidget {
  const _SubmitBar({
    required this.entries,
    required this.options,
    required this.busy,
    required this.onSubmit,
  });
  final List<MapEntry<String, _Entry>> entries;
  final List<ReclaimOption> options;
  final bool busy;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final byId = {for (final o in options) o.fgItemId: o};
    final packs = entries.fold<double>(0, (s, e) => s + e.value.packets);
    final overStock = entries.any(
      (e) => e.value.packets > (byId[e.key]?.onHandQty ?? 0),
    );

    final recovered = _recoveredSummary(entries, byId);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (entries.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  '${_fmt(packs)} packs → $recovered recovered',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center,
                ),
              ),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: MfgPrimaryButton(
                label: entries.isEmpty ? 'Enter packs to continue' : 'Post reclaim',
                onPressed: entries.isEmpty || overStock || busy ? null : onSubmit,
                loading: busy,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _fmt(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

/// "51 Litre" — or "51 Litre + 12 Kg" when a teardown opens into more than one
/// raw material. Totalled per unit rather than summed blind: adding litres to
/// kilos would print a number that means nothing.
String _recoveredSummary(
  List<MapEntry<String, _Entry>> entries,
  Map<String, ReclaimOption> byId,
) {
  final byUnit = <String, double>{};
  for (final e in entries) {
    final o = byId[e.key];
    if (o == null) continue;
    final unit = (o.recoveredUnit ?? '').trim();
    byUnit[unit] = (byUnit[unit] ?? 0) + e.value.packets * o.yieldPerUnit;
  }
  return byUnit.entries
      .map((u) => '${_fmt(u.value)}${u.key.isEmpty ? '' : ' ${u.key}'}')
      .join(' + ');
}
