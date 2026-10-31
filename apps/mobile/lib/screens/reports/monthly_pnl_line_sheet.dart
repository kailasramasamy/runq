import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../api/api_client.dart';
import '../../api/reports_models.dart';
import '../../api/reports_repo.dart';
import '../../providers/reports_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/runq_snack.dart';

/// The entries behind one monthly-P&L line — same list as the web drill-down.
Future<void> showMonthlyPnlLineSheet(
  BuildContext context, {
  required String lineKey,
  required String label,
  required DateRange range,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _LineSheet(lineKey: lineKey, label: label, range: range),
  );
}

class _LineSheet extends ConsumerWidget {
  final String lineKey;
  final String label;
  final DateRange range;
  const _LineSheet({required this.lineKey, required this.label, required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final arg = (lineKey, range);
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, controller) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: AsyncSlot<MonthlyPnlLineDetail>(
          value: ref.watch(monthlyPnlLineProvider(arg)),
          onRetry: () => ref.invalidate(monthlyPnlLineProvider(arg)),
          data: (d) => ListView.separated(
            controller: controller,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            itemCount: d.entries.length + 1,
            separatorBuilder: (_, i) => i == 0 ? const SizedBox(height: 8) : Divider(height: 1, color: t.hairlineSoft),
            itemBuilder: (_, i) => i == 0
                ? _Header(label: label, range: range, detail: d)
                : _EntryRow(d.entries[i - 1], booked: d.isProfitBooked),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String label;
  final DateRange range;
  final MonthlyPnlLineDetail detail;
  const _Header({required this.label, required this.range, required this.detail});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fmt = DateFormat('d MMM yy');
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Center(
        child: Container(
          width: 36, height: 4,
          decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
        ),
      ),
      const SizedBox(height: 12),
      Text(label, style: RunqText.h3.copyWith(color: t.ink)),
      const SizedBox(height: 2),
      Text('${fmt.format(range.from)} – ${fmt.format(range.to)} · ${detail.entries.length} entries',
          style: RunqText.caption.copyWith(color: t.muted)),
      const SizedBox(height: 8),
      Text(formatINR(detail.total), style: RunqText.numberLg.copyWith(color: t.ink)),
      if (detail.isProfitBooked) ...[
        const SizedBox(height: 6),
        Text('Booked as expenses in the books, counted here as profit taken out. '
            'The official P&L still treats them as expenses.',
            style: RunqText.caption.copyWith(color: t.muted)),
      ],
    ]);
  }
}

/// One line — who and how much; tap for the description, posting and mark action.
class _EntryRow extends StatefulWidget {
  final MonthlyPnlEntry e;
  final bool booked;
  const _EntryRow(this.e, {required this.booked});

  @override
  State<_EntryRow> createState() => _EntryRowState();
}

class _EntryRowState extends State<_EntryRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final e = widget.e;
    final italic = e.party != null && e.partyFromBank;
    return InkWell(
      onTap: () => setState(() => _open = !_open),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text(e.party ?? e.description,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: RunqText.bodyStrong.copyWith(
                      color: italic ? t.muted : t.ink, fontStyle: italic ? FontStyle.italic : null)),
            ),
            const SizedBox(width: 12),
            Text(formatINR(e.amount), style: RunqText.tabular(color: t.ink)),
            Icon(_open ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 18, color: t.muted),
          ]),
          if (_open) _EntryDetail(e, booked: widget.booked),
        ]),
      ),
    );
  }
}

class _EntryDetail extends StatelessWidget {
  final MonthlyPnlEntry e;
  final bool booked;
  const _EntryDetail(this.e, {required this.booked});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final date = DateFormat('d MMM').format(DateTime.parse(e.date));
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (e.party != null) Text(e.description, style: RunqText.body.copyWith(color: t.ink2)),
        const SizedBox(height: 2),
        Text('$date · ${e.source} · ${e.account}', style: RunqText.caption.copyWith(color: t.muted)),
        if (e.markable && e.ref != null)
          Align(alignment: Alignment.centerRight, child: _MarkButton(ref: e.ref!, booked: booked)),
      ]),
    );
  }
}

/// Moves an entry between its expense line and "Booked as expense" — internal P&L only.
class _MarkButton extends ConsumerStatefulWidget {
  final ProfitMarkRef ref;
  final bool booked;
  const _MarkButton({required this.ref, required this.booked});

  @override
  ConsumerState<_MarkButton> createState() => _MarkButtonState();
}

class _MarkButtonState extends ConsumerState<_MarkButton> {
  bool _busy = false;

  Future<void> _toggle() async {
    setState(() => _busy = true);
    try {
      await reportsRepo.setProfitMark(widget.ref, marked: !widget.booked);
      ref.invalidate(monthlyPnlLineProvider);
      ref.invalidate(monthlyPnlProvider);
      if (!mounted) return;
      RunqSnack.success(context, widget.booked ? 'Counted as an expense again' : 'Moved to “Booked as expense”');
    } on ApiException catch (e) {
      if (!mounted) return;
      RunqSnack.error(context, 'Could not update the entry', description: e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final restore = widget.booked;
    final fg = restore ? t.ink2 : t.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: restore ? Colors.transparent : t.brandSubtle,
        shape: StadiumBorder(side: BorderSide(color: restore ? t.hairline : Colors.transparent)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: _busy ? null : _toggle,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              _busy
                  ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
                  : Icon(restore ? Icons.undo_rounded : Icons.savings_outlined, size: 16, color: fg),
              const SizedBox(width: 6),
              Text(restore ? 'Count as expense' : 'Not an expense',
                  style: RunqText.caption.copyWith(color: fg, fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      ),
    );
  }
}
