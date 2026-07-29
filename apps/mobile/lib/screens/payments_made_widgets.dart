import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

class PaymentsFilterBar extends StatelessWidget {
  final String rangeLabel, status;
  final bool rangeActive;
  final VoidCallback onRange;
  final ValueChanged<String> onStatus;
  const PaymentsFilterBar({
    super.key,
    required this.rangeLabel,
    required this.rangeActive,
    required this.status,
    required this.onRange,
    required this.onStatus,
  });

  @override
  Widget build(BuildContext context) {
    const statuses = [
      ('all', 'All'),
      ('pending', 'Awaiting bank'),
      ('matched', 'Matched'),
      ('cancelled', 'Cancelled'),
    ];
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _Chip(
            label: rangeLabel,
            selected: rangeActive,
            trailing: Icons.keyboard_arrow_down_rounded,
            onTap: onRange,
          ),
          const SizedBox(width: 8),
          for (final (key, label) in statuses) ...[
            _Chip(label: label, selected: status == key, onTap: () => onStatus(key)),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final IconData? trailing;
  final VoidCallback onTap;
  const _Chip({required this.label, required this.selected, required this.onTap, this.trailing});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fg = selected ? Colors.white : t.ink2;
    return Material(
      color: selected ? RunqColors.indigo : t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: selected ? Colors.transparent : t.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label, style: RunqText.caption.copyWith(color: fg, fontWeight: FontWeight.w600)),
              if (trailing != null) ...[
                const SizedBox(width: 2),
                Icon(trailing, size: 16, color: fg),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class PaymentsSummaryCard extends StatelessWidget {
  final String label, value, caption;
  final Color color;
  const PaymentsSummaryCard({
    super.key,
    required this.label,
    required this.value,
    required this.caption,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(label,
                    style: RunqText.caption.copyWith(color: t.muted),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: RunqText.tabular(size: 20, w: FontWeight.w700, color: t.ink)),
          ),
          const SizedBox(height: 2),
          Text(caption, style: RunqText.micro.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

class PaymentsSearchField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  const PaymentsSearchField({
    super.key,required this.controller, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      onChanged: onChanged,
      textCapitalization: TextCapitalization.none,
      textInputAction: TextInputAction.search,
      style: RunqText.body.copyWith(color: t.ink),
      decoration: InputDecoration(
        isDense: true,
        filled: true,
        fillColor: t.inputFill,
        hintText: 'Search payee, category, UPI ref…',
        hintStyle: RunqText.body.copyWith(color: t.muted2),
        prefixIcon: Icon(Icons.search, size: 20, color: t.muted2),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                icon: Icon(Icons.close, size: 18, color: t.muted2),
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
              ),
        contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: t.hairline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: t.hairline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: RunqColors.indigo),
        ),
      ),
    );
  }
}

class PaymentsEmptyState extends StatelessWidget {
  final RunqTokens t;
  final bool noneAtAll;
  const PaymentsEmptyState({
    super.key,required this.t, required this.noneAtAll});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 48),
      child: Column(
        children: [
          Icon(noneAtAll ? Icons.qr_code_scanner_outlined : Icons.filter_alt_off_outlined,
              size: 44, color: t.muted2),
          const SizedBox(height: 12),
          Text(noneAtAll ? 'No payments logged yet' : 'No payments match',
              style: RunqText.h4.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(noneAtAll ? 'Tap + to log a QR/UPI payment you made' : 'Try a wider date range or clear the search',
              textAlign: TextAlign.center, style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}
