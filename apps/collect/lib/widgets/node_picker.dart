import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_states.dart';
import 'sheet_grabber.dart';

/// Clean, searchable node (VMCC/CC/PP) picker bottom sheet — replaces plain
/// dropdowns for node selection. Returns the chosen [MpNode], or null if
/// dismissed. Search appears only when the list is long enough to need it.
Future<MpNode?> showNodePicker(
  BuildContext context, {
  required List<MpNode> nodes,
  String? selectedId,
  String title = 'Select',
}) {
  return showModalBottomSheet<MpNode>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _NodePickerSheet(nodes: nodes, selectedId: selectedId, title: title),
  );
}

class _NodePickerSheet extends StatefulWidget {
  const _NodePickerSheet({required this.nodes, required this.selectedId, required this.title});
  final List<MpNode> nodes;
  final String? selectedId;
  final String title;

  @override
  State<_NodePickerSheet> createState() => _NodePickerSheetState();
}

class _NodePickerSheetState extends State<_NodePickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final showSearch = widget.nodes.length > 6;
    final q = _query.toLowerCase();
    final filtered = q.isEmpty
        ? widget.nodes
        : widget.nodes
            .where((n) => n.name.toLowerCase().contains(q) || n.code.toLowerCase().contains(q))
            .toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: Column(children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.sm),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(widget.title, style: DhenuText.h2.copyWith(color: t.ink)),
            ),
          ),
          if (showSearch)
            Padding(
              padding: const EdgeInsets.fromLTRB(DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.sm),
              child: TextField(
                onChanged: (v) => setState(() => _query = v.trim()),
                decoration: InputDecoration(
                  hintText: l.nodePickerSearchHint,
                  prefixIcon: const Icon(DhenuIcons.search),
                ),
              ),
            ),
          Expanded(
            child: filtered.isEmpty
                ? Center(child: DhenuEmptyState(icon: DhenuIcons.search, title: l.nodePickerNoMatch))
                : ListView.separated(
                    controller: scrollController,
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.only(bottom: DhenuSpacing.x4),
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
                    itemBuilder: (_, i) {
                      final n = filtered[i];
                      final selected = n.id == widget.selectedId;
                      return ListTile(
                        title: Text(n.name,
                            style: DhenuText.body.copyWith(
                              color: t.ink,
                              fontWeight: FontWeight.w700,
                            )),
                        subtitle: Text(n.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                        trailing: selected ? Icon(DhenuIcons.check, color: t.brand) : null,
                        onTap: () => Navigator.of(context).pop(n),
                      );
                    },
                  ),
          ),
        ]),
      ),
    );
  }
}
