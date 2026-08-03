// Shared BOM bottom-sheet picker used by report screens.
// Returns a [BomListRow] or null if dismissed.

import 'package:flutter/material.dart';
import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_primitives.dart';

Future<BomListRow?> showWoSummaryBomPicker(BuildContext context) {
  return showModalBottomSheet<BomListRow>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _BomPickerSheet(),
  );
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
        limit: 30,
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
                          itemCount: _results.length,
                          itemBuilder: (_, i) {
                            final bom = _results[i];
                            // Lead with what the BOM makes: on the floor you
                            // know you produced curd, not that you ran
                            // BOM-BUF-CURD-400G. The code stays underneath as
                            // the identifier.
                            return ListTile(
                              title: Text(
                                bom.outputItemName.isNotEmpty
                                    ? bom.outputItemName
                                    : bom.name,
                                style: RunqText.bodyStrong.copyWith(color: t.ink),
                              ),
                              subtitle: Text(
                                bom.bomCode,
                                style: RunqText.caption.copyWith(color: t.muted),
                              ),
                              trailing: MfgBomStatusPill(isActive: bom.isActive),
                              onTap: () => Navigator.pop(context, bom),
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
