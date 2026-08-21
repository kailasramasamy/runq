// Shared item picker bottom sheet for manufacturing screens.
//
// Lives here rather than inside one screen because BOM authoring, ad-hoc
// consumption and reclaim all need the same "search items by name or SKU"
// sheet. `itemClassGroup` pre-filters it: 'finished' for FG/output pickers,
// 'bom_inputs' for BOM input lines, 'inputs' for raw material / packaging.
// Omit for an unfiltered search. `suggestFrom` (BOM output → input lines)
// floats items sharing the output's distinctive word into a "Suggested"
// section — the rest of the catalogue still follows below it.

import 'package:flutter/material.dart';

import '../../../api/manufacturing_models.dart';
import '../../../api/manufacturing_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'mfg_colors.dart';
import 'mfg_primitives.dart';

// ── Item picker bottom sheet ───────────────────────────────────────────────

/// Optional `itemClassGroup` pre-filters the picker. Use `'finished'` for
/// BOM output, `'bom_inputs'` for BOM input lines — keeps the list short and
/// on-task. Omit for an unfiltered search (e.g. ad-hoc WO consumption).
///
/// `suggestFrom` is a related item name (the BOM output). Items sharing its
/// distinctive word are hoisted into a "Suggested" section at the top of the
/// list — ranking only. Packaging and consumables share no word with the
/// output but belong in the recipe just as much, so nothing is filtered out.
Future<MfgItemRow?> showMfgItemPicker(
  BuildContext context, {
  required String title,
  String? itemClassGroup,
  String? suggestFrom,
}) {
  return showModalBottomSheet<MfgItemRow>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) =>
        MfgItemPickerSheet(title: title, itemClassGroup: itemClassGroup, suggestFrom: suggestFrom),
  );
}

/// Words that say nothing about *what* an item is — pack sizes, units and
/// marketing filler. Stripping them leaves the ingredient word ("mustard"
/// out of "Mustard Oil 1L Pouch") to seed the input search with.
const _kGenericWords = {
  'ml',
  'ltr',
  'litre',
  'liter',
  'kg',
  'kgs',
  'gm',
  'gms',
  'gram',
  'grams',
  'pcs',
  'pack',
  'packet',
  'pouch',
  'bottle',
  'box',
  'jar',
  'tin',
  'can',
  'the',
  'and',
  'with',
  'plain',
  'pure',
  'premium',
  'refined',
  'fresh',
  'new',
  'std',
  'standard',
  'grade',
};

/// Distinctive word of an item name, or null if there isn't one worth
/// searching on. Longest surviving word wins — in Indian FMCG naming the
/// ingredient is almost always longer than the form ("mustard" > "oil").
String? mfgSuggestKeyword(String? itemName) {
  if (itemName == null) return null;
  final words = itemName
      .toLowerCase()
      .split(RegExp(r'[^a-z]+'))
      .where((w) => w.length >= 3 && !_kGenericWords.contains(w))
      .toList();
  if (words.isEmpty) return null;
  words.sort((a, b) => b.length.compareTo(a.length));
  return words.first;
}

/// Second-level class chips, shown only for the BOM-input picker. The group
/// already excludes anything sold as-is; this narrows the remainder to one
/// kind of input, because "packaging" and "raw material" are different jobs
/// even though both are legitimate BOM lines.
const _kInputClassChips = <({String? itemClass, String label})>[
  (itemClass: null, label: 'All'),
  (itemClass: 'raw_material', label: 'Raw material'),
  (itemClass: 'packaging', label: 'Packaging'),
  (itemClass: 'semi_finished', label: 'Semi-finished'),
  (itemClass: 'consumable', label: 'Consumable'),
];

class MfgItemPickerSheet extends StatefulWidget {
  final String title;
  final String? itemClassGroup;
  final String? suggestFrom;
  const MfgItemPickerSheet({super.key, required this.title, this.itemClassGroup, this.suggestFrom});

  @override
  State<MfgItemPickerSheet> createState() => MfgItemPickerSheetState();
}

class MfgItemPickerSheetState extends State<MfgItemPickerSheet> {
  final _ctrl = TextEditingController();
  List<MfgItemRow> _results = const [];
  bool _loading = false;
  String _lastQuery = '';

  /// Distinctive word of the related item, if any — drives the "Suggested"
  /// section header and the ranking below it.
  String? _keyword;

  /// Index into `_results` where the suggested run ends. 0 = no section.
  int _suggestedCount = 0;

  /// Active class chip, null = the whole group.
  String? _itemClass;

  bool get _showClassChips => widget.itemClassGroup == 'bom_inputs';

  @override
  void initState() {
    super.initState();
    _keyword = mfgSuggestKeyword(widget.suggestFrom);
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
      // The keyword hits are fetched separately: the browse list is capped at
      // 30 rows, so a matching input could easily sit outside it. Merged ahead
      // of the browse rows, deduped by id.
      final hits = await Future.wait([
        if (_keyword != null && q.isEmpty)
          manufacturingRepo.searchItems(
            _keyword!,
            itemClass: _itemClass,
            itemClassGroup: widget.itemClassGroup,
          ),
        manufacturingRepo.searchItems(
          q,
          itemClass: _itemClass,
          itemClassGroup: widget.itemClassGroup,
        ),
      ]);
      if (!mounted || q != _lastQuery) return;
      final suggested = hits.length > 1 ? hits.first : const <MfgItemRow>[];
      final suggestedIds = suggested.map((i) => i.id).toSet();
      setState(() {
        _suggestedCount = suggested.length;
        _results = [...suggested, ...hits.last.where((i) => !suggestedIds.contains(i.id))];
      });
    } finally {
      if (mounted && q == _lastQuery) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
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
            Container(
              margin: const EdgeInsets.only(top: 8),
              width: 36,
              height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: Row(
                children: [
                  Text(widget.title, style: RunqText.h3.copyWith(color: t.ink)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextField(
                controller: _ctrl,
                autofocus: false,
                textCapitalization: TextCapitalization.none,
                onChanged: _runSearch,
                decoration: InputDecoration(
                  hintText: 'Search by name or SKU',
                  prefixIcon: const Icon(Icons.search_rounded),
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
                  suffixIcon: _ctrl.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () {
                            _ctrl.clear();
                            _runSearch('');
                          },
                        ),
                ),
              ),
            ),
            if (_showClassChips)
              SizedBox(
                height: 36,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                  itemCount: _kInputClassChips.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final chip = _kInputClassChips[i];
                    final selected = _itemClass == chip.itemClass;
                    return MfgFilterChip(
                      label: chip.label,
                      selected: selected,
                      onTap: () {
                        if (selected) return;
                        setState(() => _itemClass = chip.itemClass);
                        _runSearch(_ctrl.text);
                      },
                    );
                  },
                ),
              ),
            if (_showClassChips) const SizedBox(height: 12),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                  ? Center(
                      child: Text('No items found.', style: RunqText.body.copyWith(color: t.muted)),
                    )
                  : ListView.builder(
                      controller: scrollCtrl,
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                      itemCount: _results.length,
                      itemBuilder: (_, i) {
                        final item = _results[i];
                        // Headers ride on the first row of each run so the
                        // list stays a single flat, scroll-cheap builder.
                        final header = _suggestedCount == 0
                            ? null
                            : i == 0
                            ? 'Suggested for ${widget.suggestFrom}'
                            : i == _suggestedCount
                            ? 'All items'
                            : null;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (header != null)
                              Padding(
                                padding: EdgeInsets.fromLTRB(14, i == 0 ? 4 : 14, 14, 6),
                                child: Text(
                                  header.toUpperCase(),
                                  style: RunqText.label.copyWith(color: t.muted),
                                ),
                              ),
                            Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => Navigator.of(context).pop(item),
                                borderRadius: BorderRadius.circular(10),
                                child: Container(
                                  margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                                  padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 36,
                                        height: 36,
                                        decoration: BoxDecoration(
                                          color: MfgColors.roseSubtle,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Icon(
                                          Icons.inventory_2_outlined,
                                          size: 18,
                                          color: MfgColors.brand(context),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              item.name,
                                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              '${item.sku.isEmpty ? '' : '${item.sku} · '}${item.uom} · ${item.itemClass}',
                                              style: RunqText.caption.copyWith(color: t.muted),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
