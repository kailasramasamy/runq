// Searchable warehouse picker. Renders as a pill trigger that shows the
// current selection (or 'All warehouses' / placeholder). Tapping opens a
// modal bottom sheet with a search field at the top and a filtered list
// of warehouses. Selection closes the sheet.
//
// Reused by the on-hand screen, the GRN / DN / Transfer / Adjustment /
// Stock-take sheets, and anywhere else we pick a warehouse.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/inventory_models.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

class WarehousePicker extends ConsumerWidget {
  const WarehousePicker({
    super.key,
    required this.value,
    required this.onChanged,
    this.label = 'Warehouse',
    this.allowAll = true,
    this.dense = false,
  });

  /// Current warehouse id. Null means "All warehouses" when [allowAll] is
  /// true, or "no selection" otherwise.
  final String? value;
  final ValueChanged<String?> onChanged;
  final String label;

  /// When true, the sheet pins an 'All warehouses' option at the top
  /// (used by filterable lists like On-hand). When false, the user must
  /// pick a specific warehouse (used by GRN / DN sheets).
  final bool allowAll;

  /// Tighter padding for in-sheet usage.
  final bool dense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final whs = ref.watch(invWarehousesProvider);
    final t = RT(context);
    final selected = value == null
        ? null
        : whs.maybeWhen(
            data: (list) => list.where((w) => w.id == value).firstOrNull,
            orElse: () => null,
          );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          final picked = await _openSheet(context, whs.valueOrNull ?? const []);
          if (picked != null && context.mounted) {
            // Sentinel for "All" because Dart can't return tri-state nullable
            // via showModalBottomSheet directly without a wrapper.
            onChanged(picked.isAll ? null : picked.id);
          }
        },
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: 14,
            vertical: dense ? 10 : 12,
          ),
          decoration: BoxDecoration(
            color: t.surface,
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.warehouse_outlined, size: 18, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label,
                        style: RunqText.caption.copyWith(color: t.muted, height: 1)),
                    const SizedBox(height: 2),
                    Text(
                      selected?.name ?? (allowAll ? 'All warehouses' : 'Select warehouse'),
                      style: RunqText.bodyStrong.copyWith(color: t.ink, height: 1.2),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.unfold_more_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }

  Future<_PickerResult?> _openSheet(BuildContext context, List<InvWarehouse> all) {
    return showModalBottomSheet<_PickerResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PickerSheet(
        warehouses: all,
        currentValue: value,
        allowAll: allowAll,
      ),
    );
  }
}

/// Internal — what the sheet returns. null id + isAll=true means "All".
class _PickerResult {
  final String? id;
  final bool isAll;
  const _PickerResult({this.id, this.isAll = false});
}

class _PickerSheet extends StatefulWidget {
  const _PickerSheet({
    required this.warehouses,
    required this.currentValue,
    required this.allowAll,
  });
  final List<InvWarehouse> warehouses;
  final String? currentValue;
  final bool allowAll;

  @override
  State<_PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<_PickerSheet> {
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
        ? widget.warehouses
        : widget.warehouses.where((w) =>
            w.name.toLowerCase().contains(q) ||
            w.code.toLowerCase().contains(q) ||
            w.type.toLowerCase().contains(q)).toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
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
            // Drag handle
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
                  Text('Pick warehouse', style: RunqText.h3.copyWith(color: t.ink)),
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
                controller: _searchCtrl,
                autofocus: false,
                textInputAction: TextInputAction.search,
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: 'Search by name, code, or type',
                  filled: true,
                  fillColor: t.bgWarmer,
                  contentPadding: const EdgeInsets.symmetric(vertical: 0),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () {
                            _searchCtrl.clear();
                            setState(() => _query = '');
                          },
                        ),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                children: [
                  if (widget.allowAll && q.isEmpty)
                    _Row(
                      icon: Icons.public_rounded,
                      title: 'All warehouses',
                      subtitle: '${widget.warehouses.length} total',
                      isActive: widget.currentValue == null,
                      onTap: () => Navigator.of(context).pop(
                        const _PickerResult(id: null, isAll: true),
                      ),
                    ),
                  if (widget.allowAll && q.isEmpty) const SizedBox(height: 4),
                  ...filtered.map((w) => _Row(
                        icon: _iconFor(w.type),
                        title: w.name,
                        subtitle: '${w.code} · ${_typeLabel(w.type)}'
                            '${w.isDefault ? ' · default' : ''}',
                        isActive: widget.currentValue == w.id,
                        onTap: () => Navigator.of(context).pop(
                          _PickerResult(id: w.id),
                        ),
                      )),
                  if (filtered.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(
                        child: Text(
                          'No warehouses match "$_query"',
                          style: RunqText.body.copyWith(color: t.muted),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static IconData _iconFor(String type) => switch (type) {
        'main' => Icons.factory_rounded,
        'godown' => Icons.warehouse_outlined,
        'shop' => Icons.storefront_outlined,
        'vehicle' => Icons.local_shipping_outlined,
        'virtual' => Icons.cloud_outlined,
        _ => Icons.warehouse_outlined,
      };

  static String _typeLabel(String type) => switch (type) {
        'main' => 'Main',
        'godown' => 'Godown',
        'shop' => 'Shop',
        'vehicle' => 'Vehicle',
        'virtual' => 'Virtual',
        _ => type,
      };
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon, required this.title, required this.subtitle,
    required this.isActive, required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
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
          padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
          decoration: BoxDecoration(
            color: isActive ? accent.withValues(alpha: 0.08) : null,
            border: Border.all(
              color: isActive ? accent.withValues(alpha: 0.30) : Colors.transparent,
              width: 1,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: isActive ? accent.withValues(alpha: 0.15) : t.bgWarmer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 19, color: isActive ? accent : t.muted),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              if (isActive) Icon(Icons.check_rounded, size: 20, color: accent),
            ],
          ),
        ),
      ),
    );
  }
}

