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

class _EntryRow extends StatelessWidget {
  final MonthlyPnlEntry e;
  final bool booked;
  const _EntryRow(this.e, {required this.booked});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final date = DateFormat('d MMM').format(DateTime.parse(e.date));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (e.party != null)
              Text(e.party!,
                  style: e.partyFromBank
                      ? RunqText.bodyStrong.copyWith(color: t.muted, fontStyle: FontStyle.italic)
                      : RunqText.bodyStrong.copyWith(color: t.ink)),
            Text(e.description, style: RunqText.body.copyWith(color: e.party == null ? t.ink : t.ink2)),
            const SizedBox(height: 2),
            Text('$date · ${e.source} · ${e.account}', style: RunqText.caption.copyWith(color: t.muted)),
          ]),
        ),
        const SizedBox(width: 12),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(formatINR(e.amount), style: RunqText.tabular(color: t.ink)),
          if (e.markable && e.ref != null) _MarkButton(ref: e.ref!, booked: booked),
        ]),
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
    return TextButton(
      onPressed: _busy ? null : _toggle,
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        minimumSize: const Size(0, 32),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: Text(widget.booked ? 'Restore' : 'Not an expense',
          style: RunqText.caption.copyWith(color: RT(context).brand)),
    );
  }
}
