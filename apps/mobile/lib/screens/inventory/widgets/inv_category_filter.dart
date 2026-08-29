// Category / sub-category filter pair for the Stock on Hand list.
//
// The list is already sectioned by the item category tree, but on a tenant
// with a few hundred SKUs that only helps once you have scrolled to the
// section. These two triggers jump straight to it: pick the parent category,
// then optionally the leaf under it, and the list collapses to that branch.
//
// Options are derived from the rows already in memory rather than from the
// category master, so a filter never offers a branch that holds no stock.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

/// One selectable branch: the value the caller filters on, the name shown,
/// and how many rows sit under it. [key] and [label] are the same string on
/// callers that filter by category *name* (the on-hand list, whose rows carry
/// names rather than ids); screens that filter server-side put the category id
/// in [key] and keep the name for display.
typedef InvCatOption = ({String key, String label, int count});

/// The two triggers, side by side under the warehouse picker. Sub-category is
/// inert when the current category has no leaves — an enabled control that
/// opens an empty sheet is worse than a visibly disabled one.
class InvCategoryFilter extends StatelessWidget {
  const InvCategoryFilter({
    super.key,
    required this.categories,
    required this.subcategories,
    required this.category,
    required this.subcategory,
    required this.onCategory,
    required this.onSubcategory,
    this.onClear,
  });

  final List<InvCatOption> categories;
  final List<InvCatOption> subcategories;

  /// Selected option keys, or null for "all".
  final String? category;
  final String? subcategory;
  final ValueChanged<String?> onCategory;
  final ValueChanged<String?> onSubcategory;

  /// Optional one-tap reset, shown as a trailing button only while something
  /// is picked. Screens that already carry a clear-all control elsewhere on
  /// the toolbar leave this null rather than offering the same reset twice.
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _Trigger(
            icon: Icons.folder_outlined,
            label: 'Category',
            value: category,
            placeholder: 'All',
            options: categories,
            title: 'Pick category',
            allLabel: 'All categories',
            onChanged: onCategory,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _Trigger(
            icon: Icons.subdirectory_arrow_right_rounded,
            label: 'Sub-category',
            value: subcategory,
            placeholder: subcategories.isEmpty ? 'None' : 'All',
            options: subcategories,
            title: 'Pick sub-category',
            allLabel: 'All sub-categories',
            enabled: subcategories.isNotEmpty,
            onChanged: onSubcategory,
          ),
        ),
        if (onClear != null && (category != null || subcategory != null)) ...[
          const SizedBox(width: 4),
          IconButton(
            onPressed: onClear,
            icon: const Icon(Icons.filter_alt_off_outlined, size: 18),
            tooltip: 'Clear category filter',
            visualDensity: VisualDensity.compact,
            style: IconButton.styleFrom(
              foregroundColor: InvColors.brand(context),
            ),
          ),
        ],
      ],
    );
  }
}

class _Trigger extends StatelessWidget {
  const _Trigger({
    required this.icon,
    required this.label,
    required this.value,
    required this.placeholder,
    required this.options,
    required this.title,
    required this.allLabel,
    required this.onChanged,
    this.enabled = true,
  });

  final IconData icon;
  final String label;
  final String? value;
  final String placeholder;
  final List<InvCatOption> options;
  final String title;
  final String allLabel;
  final ValueChanged<String?> onChanged;
  final bool enabled;

  /// The picked option's display name. A key that no longer appears in the
  /// options — the branch emptied under a changed class filter, say — reads
  /// as "all" rather than as a stale name the list no longer honours.
  String? get _selectedLabel {
    if (value == null) return null;
    for (final o in options) {
      if (o.key == value) return o.label;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final active = _selectedLabel != null;
    final accent = InvColors.brand(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: enabled
            ? () async {
                final picked = await _openSheet(context);
                if (picked != null) onChanged(picked.value);
              }
            : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: t.surface,
            border: Border.all(
              color: active ? accent.withValues(alpha: 0.45) : t.hairline,
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Opacity(
            opacity: enabled ? 1 : 0.5,
            child: Row(
              children: [
                Icon(icon, size: 16, color: active ? accent : t.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        style: RunqText.caption.copyWith(
                          color: t.muted,
                          height: 1,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _selectedLabel ?? placeholder,
                        style: RunqText.bodyStrong.copyWith(
                          color: t.ink,
                          height: 1.2,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                Icon(Icons.unfold_more_rounded, size: 16, color: t.muted2),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Returns null when the sheet is dismissed; a pick whose [value] is null
  /// means "All" — a bare `String?` can't tell those two apart.
  Future<({String? value})?> _openSheet(BuildContext context) {
    return showModalBottomSheet<({String? value})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _OptionSheet(
        title: title,
        allLabel: allLabel,
        options: options,
        current: value,
      ),
    );
  }
}

class _OptionSheet extends StatefulWidget {
  const _OptionSheet({
    required this.title,
    required this.allLabel,
    required this.options,
    required this.current,
  });
  final String title;
  final String allLabel;
  final List<InvCatOption> options;
  final String? current;

  @override
  State<_OptionSheet> createState() => _OptionSheetState();
}

class _OptionSheetState extends State<_OptionSheet> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? widget.options
        : widget.options
              .where((o) => o.label.toLowerCase().contains(q))
              .toList();
    final total = widget.options.fold<int>(0, (a, o) => a + o.count);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.92,
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
            // Search only earns its space once the list runs past a screenful.
            if (widget.options.length > 8)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: TextField(
                  controller: _searchCtrl,
                  textInputAction: TextInputAction.search,
                  onChanged: (v) => setState(() => _query = v),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search_rounded),
                    hintText: 'Search',
                    filled: true,
                    fillColor: t.bgWarmer,
                    contentPadding: const EdgeInsets.symmetric(vertical: 0),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                children: [
                  if (q.isEmpty)
                    _OptionRow(
                      label: widget.allLabel,
                      count: total,
                      isActive: widget.current == null,
                      onTap: () =>
                          Navigator.of(context).pop((value: null as String?)),
                    ),
                  for (final o in filtered)
                    _OptionRow(
                      label: o.label,
                      count: o.count,
                      isActive: widget.current == o.key,
                      onTap: () => Navigator.of(context).pop((value: o.key)),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.label,
    required this.count,
    required this.isActive,
    required this.onTap,
  });
  final String label;
  final int count;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accent = InvColors.brand(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          decoration: BoxDecoration(
            color: isActive ? accent.withValues(alpha: 0.08) : null,
            border: Border.all(
              color: isActive
                  ? accent.withValues(alpha: 0.30)
                  : Colors.transparent,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text('$count', style: RunqText.caption.copyWith(color: t.muted)),
              if (isActive) ...[
                const SizedBox(width: 8),
                Icon(Icons.check_rounded, size: 20, color: accent),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
