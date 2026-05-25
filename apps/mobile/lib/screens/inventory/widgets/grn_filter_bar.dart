// Filter bar widgets shared by the GRN list screen.
// Includes: _InlineSearch, _GrnFilterRow, _StatusChip.

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'warehouse_picker.dart';

// ---------------------------------------------------------------------------
// Status options constant (exported so the screen can reference it)
// ---------------------------------------------------------------------------

const grnStatusOptions = <({String label, String? value})>[
  (label: 'All', value: null),
  (label: 'Draft', value: 'draft'),
  (label: 'Posted', value: 'posted'),
  (label: 'Cancelled', value: 'cancelled'),
];

// ---------------------------------------------------------------------------
// Inline search field
// ---------------------------------------------------------------------------

class GrnInlineSearch extends StatefulWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const GrnInlineSearch({super.key, required this.value, required this.onChanged});

  @override
  State<GrnInlineSearch> createState() => _GrnInlineSearchState();
}

class _GrnInlineSearchState extends State<GrnInlineSearch> {
  late final TextEditingController _ctrl =
      TextEditingController(text: widget.value);
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Icon(Icons.search_rounded, size: 18, color: t.muted),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _ctrl,
              focusNode: _focus,
              onChanged: widget.onChanged,
              style: RunqText.body.copyWith(color: t.ink),
              decoration: InputDecoration(
                hintText: 'Search GRN, vendor, warehouse',
                hintStyle: RunqText.body.copyWith(color: t.muted2),
                isDense: true,
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Filter row: warehouse picker + status chips
// ---------------------------------------------------------------------------

class GrnFilterRow extends StatelessWidget {
  final String? warehouseId;
  final String? statusFilter;
  final ValueChanged<String?> onWarehouseChanged;
  final ValueChanged<String?> onStatusChanged;

  const GrnFilterRow({
    super.key,
    required this.warehouseId,
    required this.statusFilter,
    required this.onWarehouseChanged,
    required this.onStatusChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          WarehousePicker(
            value: warehouseId,
            onChanged: onWarehouseChanged,
            allowAll: true,
            dense: true,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: grnStatusOptions.map((opt) {
              return _StatusChip(
                label: opt.label,
                active: opt.value == statusFilter,
                onTap: () => onStatusChanged(opt.value),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _StatusChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final bg = active ? t.ink : t.surface;
    final fg = active ? t.surface : t.ink;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? Colors.transparent : t.hairline,
              width: 0.5,
            ),
          ),
          child: Text(label, style: RunqText.caption.copyWith(color: fg)),
        ),
      ),
    );
  }
}
