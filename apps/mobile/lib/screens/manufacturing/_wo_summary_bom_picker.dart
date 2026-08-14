// Shared BOM bottom-sheet picker used by report screens.
// Returns a [BomListRow] or null if dismissed.

import 'package:flutter/material.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_bom_grouping.dart';
import 'widgets/mfg_primitives.dart';

Future<BomListRow?> showWoSummaryBomPicker(BuildContext context) {
  return showModalBottomSheet<BomListRow>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _BomPickerSheet(),
  );
}

/// Leads with what the BOM makes: on the floor you know you produced curd,
/// not that you ran BOM-BUF-CURD-400G. The code stays underneath as the
/// identifier.
class _BomPickerTile extends StatelessWidget {
  const _BomPickerTile({required this.bom, required this.onTap});
  final BomListRow bom;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListTile(
      title: Text(
        bom.outputItemName.isNotEmpty ? bom.outputItemName : bom.name,
        style: RunqText.bodyStrong.copyWith(color: t.ink),
      ),
      subtitle: Text(
        bom.bomCode,
        style: RunqText.caption.copyWith(color: t.muted),
      ),
      trailing: MfgBomStatusPill(isActive: bom.isActive),
      onTap: onTap,
    );
  }
}

class _BomPickerSheet extends StatefulWidget {
  const _BomPickerSheet();

  @override
  State<_BomPickerSheet> createState() => _BomPickerSheetState();
}

class _BomPickerSheetState extends State<_BomPickerSheet> {
  final _ctrl = TextEditingController();
  List<BomListRow> _results = const [];
  bool _loading = false;
  String _lastQuery = '';

  /// Section headers and BOM rows in one flat list, so the sheet keeps a
  /// lazy [ListView.builder] instead of building every tile up front.
  List<Object> get _entries {
    final groups = groupBomsByCategory(_results);
    final out = <Object>[];
    String? currentCategory;
    for (final g in groups) {
      if (g.category != currentCategory) {
        currentCategory = g.category;
        out.add(MfgCategoryHeader(
          label: g.category,
          count: bomCategoryCount(groups, g.category),
        ));
      }
      if (g.subcategory != null) {
        out.add(MfgCategoryHeader(
          label: g.subcategory!,
          count: g.rows.length,
          nested: true,
        ));
      }
      out.addAll(g.rows);
    }
    return out;
  }

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
      final res = await manufacturingRepo.listBoms(
        search: q.isEmpty ? null : q,
        // Category-ordered so the sheet can section by what each BOM makes,
        // and asked for in one page — a technician scrolling for "Paneer"
        // shouldn't hit an invisible cut-off partway down.
        sort: 'category',
        limit: 200,
      );
      if (!mounted || q != _lastQuery) return;
      setState(() => _results = res.data);
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
                  Expanded(
                    child: Text('Pick BOM', style: RunqText.h3.copyWith(color: t.ink)),
                  ),
                  IconButton(
                    icon: Icon(Icons.close_rounded, color: t.muted),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: MfgSearchBar(
                controller: _ctrl,
                placeholder: 'Search BOM code or name…',
                onChanged: _runSearch,
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? Center(
                          child: Text(
                            'No BOMs found',
                            style: RunqText.body.copyWith(color: t.muted),
                          ),
                        )
                      : ListView.builder(
                          controller: scrollCtrl,
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 40),
                          itemCount: _entries.length,
                          itemBuilder: (_, i) {
                            final entry = _entries[i];
                            if (entry is MfgCategoryHeader) return entry;
                            return _BomPickerTile(
                              bom: entry as BomListRow,
                              onTap: () => Navigator.pop(context, entry),
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
