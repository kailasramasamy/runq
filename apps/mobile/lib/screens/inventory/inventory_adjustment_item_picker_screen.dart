// Item picker for stock adjustments — "Add product not on hand".
//
// Split out of inventory_adjustment_screen.dart, which was well past the
// point where another 280 lines could be justified, and promoted from a
// bottom sheet to a full screen at the same time.

import 'package:flutter/material.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_class_tabs.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

/// One rendered line: a category heading, a sub-category sub-heading, or an
/// item row. Flattened into a single list so the whole thing stays one
/// lazily-built ListView rather than nested scrollables.
class _PickEntry {
  const _PickEntry.category(this.label, this.count) : item = null, isSub = false;
  const _PickEntry.subcategory(this.label, this.count) : item = null, isSub = true;
  const _PickEntry.item(this.item) : label = null, count = 0, isSub = false;
  final String? label;
  final int count;
  final bool isSub;
  final InvItem? item;
  bool get isHeader => item == null;
}

/// Groups items category → sub-category → name, uncategorised last. The
/// catalogue is a tree in Masters and the floor thinks in it too ("count the
/// packaging"), so a flat A-Z list makes them read every row to find a group.
List<_PickEntry> _buildPickerSections(List<InvItem> rows) {
  const uncategorised = 'Uncategorised';
  final byCategory = <String, Map<String, List<InvItem>>>{};
  for (final r in rows) {
    final cat = (r.category ?? '').trim().isEmpty ? uncategorised : r.category!.trim();
    // A root-level category has no sub-category; '' keys that bucket and
    // renders without a sub-heading, directly under the category.
    final sub = (r.subcategory ?? '').trim();
    byCategory.putIfAbsent(cat, () => {}).putIfAbsent(sub, () => []).add(r);
  }
  final catNames = byCategory.keys.toList()
    ..sort((a, b) {
      if (a == uncategorised) return 1;
      if (b == uncategorised) return -1;
      return a.toLowerCase().compareTo(b.toLowerCase());
    });
  final entries = <_PickEntry>[];
  for (final cat in catNames) {
    final subs = byCategory[cat]!;
    final total = subs.values.fold<int>(0, (n, list) => n + list.length);
    entries.add(_PickEntry.category(cat, total));
    // '' (direct children of the category) first, then named sub-categories.
    final subNames = subs.keys.toList()
      ..sort(
        (a, b) => a.isEmpty
            ? -1
            : b.isEmpty
            ? 1
            : a.toLowerCase().compareTo(b.toLowerCase()),
      );
    for (final sub in subNames) {
      final items = subs[sub]!
        ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      // A leaf named after its parent ("Cold Pressed Oils" under "Cold Pressed
      // Oils") would print the same heading twice — the sub-level says nothing
      // there, so skip it.
      if (sub.isNotEmpty && sub.toLowerCase() != cat.toLowerCase()) {
        entries.add(_PickEntry.subcategory(sub, items.length));
      }
      entries.addAll(items.map(_PickEntry.item));
    }
  }
  return entries;
}

/// Pushes the picker and returns everything the user ticked, or null if
/// they backed out. A screen rather than a sheet: picking stock to add is a
/// browse-and-search task over the whole catalogue, and a sheet gives it
/// two-thirds of the screen, a keyboard on top of that, and no room for the
/// class pills, search field and list to coexist.
Future<List<InvItem>?> pushAdjItemPicker(
  BuildContext context, {
  Set<String> excludeIds = const {},
}) {
  return Navigator.of(context).push<List<InvItem>>(
    MaterialPageRoute(builder: (_) => InvAdjustmentItemPickerScreen(excludeIds: excludeIds)),
  );
}

/// Searchable list with a checkbox on every row. Items already in the
/// draft are hidden via [excludeIds] so the user can't double-add. A sticky
/// footer pops the whole selection in one shot — picking ten items takes
/// one round trip, not ten.
class InvAdjustmentItemPickerScreen extends StatefulWidget {
  const InvAdjustmentItemPickerScreen({super.key, this.excludeIds = const {}});
  final Set<String> excludeIds;
  @override
  State<InvAdjustmentItemPickerScreen> createState() => _InvAdjustmentItemPickerScreenState();
}

class _InvAdjustmentItemPickerScreenState extends State<InvAdjustmentItemPickerScreen> {
  final _ctrl = TextEditingController();
  // Selection lives in two maps so we keep full item data (needed when
  // popping) even if a tick scrolls off the current result page.
  final Map<String, InvItem> _selected = {};
  List<InvItem> _results = const [];
  bool _loading = false;
  String _lastQuery = '';

  /// The catalogue page the picker pulls. The old 25 silently cut the list
  /// off mid-alphabet — items sort finished-goods-first, so a tenant's raw
  /// materials fell off the end and simply could not be picked. The class
  /// counts are computed from this same set, so the limit also has to be
  /// high enough that the numbers on the pills aren't a lie.
  static const _fetchLimit = 200;

  /// True when the catalogue is bigger than one page, so the pill counts
  /// describe only what's loaded and the user has to be told.
  bool _truncated = false;
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
      final hits = await inventoryRepo.searchItems(q, limit: _fetchLimit);
      if (!mounted || q != _lastQuery) return;
      setState(() {
        _truncated = hits.length >= _fetchLimit;
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
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: _selected.isEmpty ? 'Pick products' : '${_selected.length} selected',
        onBack: () => Navigator.of(context).pop(),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            const SizedBox(height: 4),
            // Type pills sit ABOVE the search box: picking the bucket first
            // is how you narrow a mixed catalogue, and burying them under
            // the field made the list look like it had no raw materials.
            if (_results.isNotEmpty) ...[
              Builder(
                builder: (_) {
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
                    padding: const EdgeInsets.only(bottom: 8),
                    child: InvClassTabs(
                      selected: _classGroup ?? classGroupAll,
                      counts: counts,
                      onChanged: (g) => setState(() {
                        _classGroup = g;
                        _userPickedGroup = true;
                      }),
                    ),
                  );
                },
              ),
              // Counts describe what's loaded, so say so when the catalogue
              // is bigger than one page rather than showing a number that
              // quietly under-reports.
              if (_truncated)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text(
                    'Showing the first $_fetchLimit items — search to narrow.',
                    style: RunqText.micro.copyWith(color: RT(context).muted2),
                  ),
                ),
            ],
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _ctrl,
                // No autofocus now that this is a full screen: the grouped
                // list is the point, and a keyboard on open would bury it.
                autofocus: false,
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
            Expanded(
              child: _loading && _results.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : Builder(
                      builder: (_) {
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
                        final entries = _buildPickerSections(shown);
                        return ListView.builder(
                          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: const EdgeInsets.only(bottom: 8),
                          itemCount: entries.length,
                          itemBuilder: (_, i) {
                            final entry = entries[i];
                            if (entry.isHeader) {
                              return _SectionHeading(
                                label: entry.label!,
                                count: entry.count,
                                isSub: entry.isSub,
                              );
                            }
                            final r = entry.item!;
                            final selected = _selected.containsKey(r.id);
                            return InkWell(
                              onTap: () => _toggle(r),
                              child: Container(
                                decoration: BoxDecoration(
                                  border: Border(
                                    bottom: BorderSide(color: t.hairlineSoft, width: 0.5),
                                  ),
                                ),
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            r.name,
                                            style: RunqText.bodyStrong.copyWith(
                                              color: t.ink,
                                              fontSize: 14,
                                            ),
                                          ),
                                          if ((r.sku ?? '').isNotEmpty ||
                                              (r.unit ?? '').isNotEmpty) ...[
                                            const SizedBox(height: 2),
                                            Text(
                                              [
                                                if ((r.sku ?? '').isNotEmpty) r.sku!,
                                                if ((r.unit ?? '').isNotEmpty) r.unit!,
                                              ].join(' · '),
                                              style: RunqText.caption.copyWith(color: t.muted),
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
                                      width: 22,
                                      height: 22,
                                      decoration: BoxDecoration(
                                        color: selected ? brand : Colors.transparent,
                                        border: Border.all(
                                          color: selected ? brand : t.hairline,
                                          width: 1.5,
                                        ),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: selected
                                          ? const Icon(Icons.check, size: 14, color: Colors.white)
                                          : null,
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),
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

/// Category / sub-category heading. The sub variant is indented and lighter
/// so the two levels read as a tree at a glance instead of two equal rules.
class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.label, required this.count, required this.isSub});
  final String label;
  final int count;
  final bool isSub;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      color: isSub ? Colors.transparent : t.bgWarmer,
      padding: EdgeInsets.fromLTRB(isSub ? 28 : 16, isSub ? 10 : 8, 16, isSub ? 4 : 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              isSub ? label : label.toUpperCase(),
              style: isSub
                  ? RunqText.caption.copyWith(color: t.muted, fontWeight: FontWeight.w600)
                  : RunqText.label.copyWith(color: t.ink),
            ),
          ),
          Text('$count', style: RunqText.caption.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}
