// Day summary sections — materials, production, dispatch, other movements.
//
// Split out of `inventory_day_summary_screen.dart` so the screen file stays
// about the day (fetching it, moving between days) and this one stays about
// rendering one day's four lists.

library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_day_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

/// Quantities as a plant reads them: 842.885 → "842.885", 60.000 → "60".
/// Trailing zeros on a litre count are noise, but the third decimal is real
/// — milk is weighed to it.
String fmtQty(double v) {
  if (v == v.roundToDouble()) return v.toStringAsFixed(0);
  return v.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '');
}

// ── Materials ─────────────────────────────────────────────────────────────

/// What the plant had, took in, used up, and was left holding — one row per
/// input item. Items that moved come first; the rest are old stock, folded
/// away behind a toggle so a busy day isn't buried under a standing list.
class DayMaterialsSection extends StatefulWidget {
  const DayMaterialsSection({super.key, required this.rows});
  final List<InvDayMaterial> rows;

  @override
  State<DayMaterialsSection> createState() => _DayMaterialsSectionState();
}

class _DayMaterialsSectionState extends State<DayMaterialsSection> {
  bool _showIdle = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final moved = widget.rows.where((r) => r.moved).toList();
    final idle = widget.rows.where((r) => !r.moved).toList();
    final shown = _showIdle ? [...moved, ...idle] : moved;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InvSectionHeader(
          title: 'Materials & inputs',
          action: idle.isEmpty
              ? null
              : (_showIdle ? 'Hide idle stock' : '${idle.length} idle in stock'),
          onAction: idle.isEmpty ? null : () => setState(() => _showIdle = !_showIdle),
        ),
        if (shown.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: InvCard(
              child: _QuietRow(
                icon: Icons.inbox_outlined,
                text: 'No material moved on this day.',
              ),
            ),
          )
        else
          ...shown.map(
            (r) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: _MaterialRow(row: r),
            ),
          ),
        if (shown.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Text(
              'Tap a row for its closing balance, corrections and value.',
              style: RunqText.caption.copyWith(color: t.muted2),
            ),
          ),
      ],
    );
  }
}

class _MaterialRow extends StatefulWidget {
  const _MaterialRow({required this.row});
  final InvDayMaterial row;

  @override
  State<_MaterialRow> createState() => _MaterialRowState();
}

class _MaterialRowState extends State<_MaterialRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final row = widget.row;
    return InvCard(
      // Tap expands rather than navigates: the rest of the day's arithmetic
      // is one level down, and the audit trail is a deliberate second step
      // from inside the expanded panel.
      onTap: row.moved ? () => setState(() => _open = !_open) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.itemName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (row.sku != null && row.sku!.isNotEmpty)
                      Text(
                        row.sku!,
                        style: RunqText.caption.copyWith(color: t.muted2),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  InvQtyText(
                    qty: fmtQty(row.closing),
                    unit: row.unit,
                    style: RunqText.tabular(size: 17, color: t.ink),
                  ),
                  Text(
                    'in stock',
                    style: RunqText.caption.copyWith(color: t.muted2),
                  ),
                ],
              ),
            ],
          ),
          if (row.moved) ...[
            const SizedBox(height: 10),
            _FlowStrip(row: row, open: _open),
            if (_open) _MaterialDetail(row: row),
          ] else ...[
            const SizedBox(height: 6),
            Text(
              'No movement on this day',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
        ],
      ),
    );
  }
}

/// The three numbers that describe the day itself — what was there, what
/// arrived, what production took. Closing already sits at the top right of
/// the card, and `other` is a rare correction, so both are one tap down:
/// five columns on a phone squeezed every figure into an ellipsis.
class _FlowStrip extends StatelessWidget {
  const _FlowStrip({required this.row, required this.open});
  final InvDayMaterial row;
  final bool open;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(child: _FlowCell(label: 'Opening', value: fmtQty(row.opening))),
          const _FlowDivider(),
          Expanded(
            child: _FlowCell(
              label: 'Received',
              value: row.received > 0 ? '+${fmtQty(row.received)}' : '—',
              color: row.received > 0 ? InvColors.success : null,
            ),
          ),
          const _FlowDivider(),
          Expanded(
            child: _FlowCell(
              label: 'Used',
              value: row.consumed > 0 ? '−${fmtQty(row.consumed)}' : '—',
              color: row.consumed > 0 ? InvColors.error : null,
            ),
          ),
          Icon(
            open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
            size: 20,
            color: t.muted2,
          ),
        ],
      ),
    );
  }
}

/// The rest of the row's arithmetic, once asked for: the corrections that
/// moved this item without a receipt or a production run, what it closed at,
/// and the money behind the two headline quantities.
class _MaterialDetail extends StatelessWidget {
  const _MaterialDetail({required this.row});
  final InvDayMaterial row;

  @override
  Widget build(BuildContext context) {
    final u = row.unit == null ? '' : ' ${row.unit}';
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        children: [
          if (row.otherNet.abs() > 0.0005)
            _DetailLine(
              label: 'Transfers & adjustments',
              value: '${row.otherNet > 0 ? '+' : '−'}'
                  '${fmtQty(row.otherNet.abs())}$u',
              color: InvColors.info,
            ),
          _DetailLine(
            label: 'Closing balance',
            value: '${fmtQty(row.closing)}$u',
            strong: true,
          ),
          if (row.receivedValue > 0)
            _DetailLine(
              label: 'Received value',
              value: indianINR(row.receivedValue),
            ),
          if (row.consumedValue > 0)
            _DetailLine(
              label: 'Consumed value',
              value: indianINR(row.consumedValue),
            ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerLeft,
            child: GestureDetector(
              onTap: () => context.push('/inventory/items/${row.itemId}/movements'),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Stock movements',
                    style: RunqText.caption.copyWith(
                      color: InvColors.brand(context),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 16,
                    color: InvColors.brand(context),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One line in a [_LinePanel]: what it was, which batch (and when that batch
/// came in), and how much of it moved.
class _PanelLine extends StatelessWidget {
  const _PanelLine({required this.line});
  final InvDayLine line;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final meta = [
      if (line.batchNo != null && line.batchNo!.isNotEmpty) line.batchNo!,
      if (line.receivedOn != null) 'in ${prettyShortDate(line.receivedOn!)}',
    ].join('  ·  ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: line.itemName,
                        style: RunqText.caption.copyWith(color: t.ink),
                      ),
                      if (line.unit != null && line.unit!.isNotEmpty)
                        TextSpan(
                          text: '  ${line.unit}',
                          style: RunqText.micro.copyWith(color: t.muted2),
                        ),
                    ],
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (meta.isNotEmpty)
                  Text(
                    meta,
                    style: RunqText.micro.copyWith(color: t.muted2),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            fmtQty(line.qty),
            style: RunqText.tabular(size: 13, color: t.ink),
          ),
        ],
      ),
    );
  }
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({
    required this.label,
    required this.value,
    this.color,
    this.strong = false,
  });
  final String label;
  final String value;
  final Color? color;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          Text(
            value,
            style: RunqText.tabular(
              size: 13,
              w: strong ? FontWeight.w700 : FontWeight.w600,
              color: color ?? t.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _FlowCell extends StatelessWidget {
  const _FlowCell({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: RunqText.micro.copyWith(color: t.muted2),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: RunqText.tabular(size: 13, color: color ?? t.ink),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}

class _FlowDivider extends StatelessWidget {
  const _FlowDivider();

  @override
  Widget build(BuildContext context) => Container(
    width: 1,
    height: 26,
    margin: const EdgeInsets.symmetric(horizontal: 6),
    color: RT(context).hairlineSoft,
  );
}

// ── Production ────────────────────────────────────────────────────────────

class DayProducedSection extends StatelessWidget {
  const DayProducedSection({super.key, required this.rows});
  final List<InvDayProduced> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const InvSectionHeader(title: 'Produced'),
        if (rows.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: InvCard(
              child: _QuietRow(
                icon: Icons.precision_manufacturing_outlined,
                text: 'Nothing was produced on this day.',
              ),
            ),
          )
        else
          ...rows.map(
            (r) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: _ProducedRow(row: r),
            ),
          ),
      ],
    );
  }
}

class _ProducedRow extends StatefulWidget {
  const _ProducedRow({required this.row});
  final InvDayProduced row;

  @override
  State<_ProducedRow> createState() => _ProducedRowState();
}

class _ProducedRowState extends State<_ProducedRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final row = widget.row;
    final canOpen = row.inputs.isNotEmpty;
    return InvCard(
      onTap: canOpen ? () => setState(() => _open = !_open) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Unit rides with the name: two SKUs of the same milk
                    // differ only by pack size, and the figure on the right
                    // is meaningless until you know which one this is.
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: row.itemName,
                            style: RunqText.bodyStrong.copyWith(color: t.ink),
                          ),
                          if (row.unit != null && row.unit!.isNotEmpty)
                            TextSpan(
                              text: '  ${row.unit}',
                              style: RunqText.caption.copyWith(color: t.muted2),
                            ),
                        ],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (row.batchNo != null && row.batchNo!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      InvMetaChip(
                        icon: Icons.qr_code_2_rounded,
                        label: row.batchNo!,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    fmtQty(row.qty),
                    style: RunqText.tabular(size: 17, color: InvColors.success),
                  ),
                  Text(
                    indianINR(row.value),
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
              if (canOpen)
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Icon(
                    _open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    size: 20,
                    color: t.muted2,
                  ),
                ),
            ],
          ),
          if (_open) ...[
            const SizedBox(height: 10),
            _LinePanel(
              title: 'Made from',
              lines: row.inputs,
              footer: [
                if (row.woNumber != null) row.woNumber!,
                if (row.warehouseName != null) row.warehouseName!,
              ].join(' · '),
            ),
          ],
        ],
      ),
    );
  }
}

/// The lines behind a row — inputs consumed, or SKUs dispatched. Batch is
/// printed under the name because that is the traceable thing: which milk
/// consignment went into this batch, which batch went to this customer.
class _LinePanel extends StatelessWidget {
  const _LinePanel({
    required this.title,
    required this.lines,
    this.footer,
    this.action,
    this.onAction,
  });
  final String title;
  final List<InvDayLine> lines;
  final String? footer;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted2),
          ),
          const SizedBox(height: 6),
          for (var i = 0; i < lines.length; i++) ...[
            // A separator between lines, not around them: two consignments of
            // the same milk differ only in their batch code, and without a
            // rule between them the eye reads one four-line block.
            if (i > 0)
              Divider(height: 13, thickness: 1, color: t.hairlineSoft),
            _PanelLine(line: lines[i]),
          ],
          if (footer != null && footer!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(footer!, style: RunqText.micro.copyWith(color: t.muted2)),
          ],
          if (action != null && onAction != null) ...[
            const SizedBox(height: 8),
            GestureDetector(
              onTap: onAction,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    action!,
                    style: RunqText.caption.copyWith(
                      color: InvColors.brand(context),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 16,
                    color: InvColors.brand(context),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────

class DayDispatchSection extends StatelessWidget {
  const DayDispatchSection({super.key, required this.rows});
  final List<InvDayDispatch> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const InvSectionHeader(title: 'Dispatched'),
        if (rows.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: InvCard(
              child: _QuietRow(
                icon: Icons.local_shipping_outlined,
                text: 'Nothing left the gate on this day.',
              ),
            ),
          )
        else
          ...rows.map(
            (r) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: _DispatchRow(row: r),
            ),
          ),
      ],
    );
  }
}

class _DispatchRow extends StatefulWidget {
  const _DispatchRow({required this.row});
  final InvDayDispatch row;

  @override
  State<_DispatchRow> createState() => _DispatchRowState();
}

class _DispatchRowState extends State<_DispatchRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final row = widget.row;
    final canOpen = row.items.isNotEmpty;
    final route = row.route;
    return InvCard(
      // Expands to what went on the note. Opening the document itself is the
      // deliberate second step, from inside the panel.
      onTap: canOpen ? () => setState(() => _open = !_open) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.customerName ?? row.title,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      row.customerName == null
                          ? '${row.itemCount} item${row.itemCount == 1 ? '' : 's'}'
                          : '${row.title} · ${row.itemCount} item'
                              '${row.itemCount == 1 ? '' : 's'}',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    indianINR(row.value),
                    style: RunqText.tabular(size: 15, color: t.ink),
                  ),
                  Text(
                    '${fmtQty(row.qty)} out',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
              if (canOpen)
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Icon(
                    _open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    size: 20,
                    color: t.muted2,
                  ),
                ),
            ],
          ),
          if (_open) ...[
            const SizedBox(height: 10),
            _LinePanel(
              title: 'Items dispatched',
              lines: row.items,
              action: route == null ? null : 'Open delivery note',
              onAction: route == null ? null : () => context.push(route),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Other movements ───────────────────────────────────────────────────────

/// Everything the three headline buckets miss — transfers, adjustments,
/// stock takes, reclaims, reversals. Here so the day reconciles: stock that
/// moved without being received, made or dispatched is still accounted for.
class DayOtherSection extends StatelessWidget {
  const DayOtherSection({super.key, required this.rows});
  final List<InvDayOther> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const InvSectionHeader(title: 'Other movements'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: InvCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Column(
              children: [
                for (final r in rows)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            r.label,
                            style: RunqText.body.copyWith(color: t.ink),
                          ),
                        ),
                        Text(
                          '${r.docs} doc${r.docs == 1 ? '' : 's'}',
                          style: RunqText.caption.copyWith(color: t.muted2),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          r.inValue >= r.outValue
                              ? '+${indianINR(r.inValue)}'
                              : '−${indianINR(r.outValue)}',
                          style: RunqText.tabular(
                            size: 13,
                            color: r.inValue >= r.outValue
                                ? InvColors.success
                                : InvColors.error,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// The line a section shows when nothing happened. Deliberately a card and
/// not a full empty state — on a quiet day four full-height illustrations
/// would push the one section that *did* move off the screen.
class _QuietRow extends StatelessWidget {
  const _QuietRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Icon(icon, size: 18, color: t.muted2),
        const SizedBox(width: 10),
        Expanded(
          child: Text(text, style: RunqText.caption.copyWith(color: t.muted)),
        ),
      ],
    );
  }
}
