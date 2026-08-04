// Shared item picker bottom sheet for manufacturing screens.
//
// Lives here rather than inside one screen because BOM authoring, ad-hoc
// consumption and reclaim all need the same "search items by name or SKU"
// sheet. `itemClassGroup` pre-filters it: 'finished' for FG/output pickers,
// 'inputs' for raw material / packaging. Omit for an unfiltered search.

import 'package:flutter/material.dart';

import '../../../api/manufacturing_models.dart';
import '../../../api/manufacturing_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'mfg_colors.dart';

// ── Item picker bottom sheet ───────────────────────────────────────────────

/// Optional `itemClassGroup` pre-filters the picker. Use `'finished'` for
/// BOM output, `'inputs'` for BOM input lines — keeps the list short and
/// on-task. Omit for an unfiltered search (e.g. ad-hoc WO consumption).
Future<MfgItemRow?> showMfgItemPicker(
  BuildContext context, {
  required String title,
  String? itemClassGroup,
}) {
  return showModalBottomSheet<MfgItemRow>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => MfgItemPickerSheet(title: title, itemClassGroup: itemClassGroup),
  );
}

class MfgItemPickerSheet extends StatefulWidget {
  final String title;
  final String? itemClassGroup;
  const MfgItemPickerSheet({super.key, required this.title, this.itemClassGroup});

  @override
  State<MfgItemPickerSheet> createState() => MfgItemPickerSheetState();
}

class MfgItemPickerSheetState extends State<MfgItemPickerSheet> {
  final _ctrl = TextEditingController();
  List<MfgItemRow> _results = const [];
  bool _loading = false;
  String _lastQuery = '';

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
      final hits = await manufacturingRepo.searchItems(
        q,
        itemClassGroup: widget.itemClassGroup,
      );
      if (!mounted || q != _lastQuery) return;
      setState(() => _results = hits);
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
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(2),
              ),
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
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? Center(
                          child: Text('No items found.',
                              style: RunqText.body.copyWith(color: t.muted)))
                      : ListView.builder(
                          controller: scrollCtrl,
                          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                          itemCount: _results.length,
                          itemBuilder: (_, i) {
                            final item = _results[i];
                            return Material(
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
                                        width: 36, height: 36,
                                        decoration: BoxDecoration(
                                          color: MfgColors.roseSubtle,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Icon(Icons.inventory_2_outlined,
                                            size: 18, color: MfgColors.brand(context)),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(item.name,
                                                style: RunqText.bodyStrong.copyWith(color: t.ink)),
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
