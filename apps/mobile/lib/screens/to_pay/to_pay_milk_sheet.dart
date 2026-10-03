import 'package:flutter/material.dart';
import '../../api/api_client.dart';
import '../../api/to_pay_models.dart';
import '../../api/to_pay_repo.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/status_pill.dart';

/// The farmers behind one milk line on the To-pay screen: the cycle's directly
/// paid farmers, or — for a VMCC bill — the farmers that bill settles, whose
/// paid state is the bill's.
Future<void> showMilkPayeesSheet(
  BuildContext context, {
  required ToPayItem item,
  required String cycleId,
  String? vmccNodeId,
}) {
  final t = RT(context);
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: t.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.85,
      child: _PayeesSheet(item: item, cycleId: cycleId, vmccNodeId: vmccNodeId),
    ),
  );
}

class _PayeesSheet extends StatefulWidget {
  final ToPayItem item;
  final String cycleId;
  final String? vmccNodeId;
  const _PayeesSheet({required this.item, required this.cycleId, this.vmccNodeId});

  @override
  State<_PayeesSheet> createState() => _PayeesSheetState();
}

class _PayeesSheetState extends State<_PayeesSheet> {
  late final Future<List<MilkPayee>> _payees = _load();

  Future<List<MilkPayee>> _load() async {
    final lines = await fetchMilkCyclePayees(widget.cycleId);
    final node = widget.vmccNodeId;
    final billPaid = widget.item.status == 'paid';
    final mine = node == null
        ? lines.where((l) => !l.viaBill).map((l) => l.payee)
        : lines.where((l) => l.viaBill && l.payee.vmccNodeId == node).map((l) => MilkPayee(
              name: l.payee.name, code: l.payee.code, vmccNodeId: node,
              vmccName: l.payee.vmccName, net: l.payee.net, paid: billPaid,
            ));
    // Still-to-pay first, then by name — the ones that need action lead.
    return mine.toList()
      ..sort((a, b) => a.paid == b.paid ? a.name.compareTo(b.name) : (a.paid ? 1 : -1));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      top: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40, height: 4, margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 2),
            child: Text(widget.item.title, style: RunqText.h3.copyWith(color: t.ink)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Text(widget.item.subtitle, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          Expanded(
            child: FutureBuilder<List<MilkPayee>>(
              future: _payees,
              builder: (_, snap) {
                if (snap.hasError) {
                  final e = snap.error;
                  return _message(t, e is ApiException ? e.message : 'Could not load the farmers');
                }
                if (!snap.hasData) return const Center(child: CircularProgressIndicator());
                final list = snap.data!;
                if (list.isEmpty) return _message(t, 'No farmers in this payment');
                return _PayeeList(payees: list);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _message(RunqTokens t, String s) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(s, textAlign: TextAlign.center, style: RunqText.body.copyWith(color: t.muted)),
        ),
      );
}

class _PayeeList extends StatelessWidget {
  final List<MilkPayee> payees;
  const _PayeeList({required this.payees});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final paid = payees.where((p) => p.paid).length;
    final due = payees.where((p) => !p.paid).fold<double>(0, (s, p) => s + p.net);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Row(
            children: [
              Expanded(
                child: Text('${payees.length} FARMERS',
                    style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
              ),
              Text(
                due > 0 ? '$paid paid · ${formatINR(due, compact: true)} to pay' : 'All paid',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.card),
            border: Border.all(color: t.hairline, width: 0.6),
          ),
          child: Column(
            children: [
              for (var i = 0; i < payees.length; i++) ...[
                if (i > 0) Divider(height: 1, thickness: 0.6, color: t.hairline, indent: 16, endIndent: 16),
                _PayeeRow(p: payees[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _PayeeRow extends StatelessWidget {
  final MilkPayee p;
  const _PayeeRow({required this.p});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final caption = [p.code, if (p.vmccName != null && p.vmccName!.isNotEmpty) p.vmccName!].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.name, style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(caption, style: RunqText.caption.copyWith(color: t.muted),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatINR(p.net), style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 4),
              StatusPill(p.paid ? 'paid' : 'pending', label: p.paid ? 'PAID' : 'NOT PAID'),
            ],
          ),
        ],
      ),
    );
  }
}
