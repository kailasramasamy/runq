import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/node_picker.dart';
import 'qc_report_view.dart';
import 'qc_vmcc_ranking.dart';

enum _Scope { all, vmcc, ranking }

/// CC QC report — three scopes over the same windowed receipts: all VMCCs
/// pooled, one selected VMCC, or every VMCC ranked side by side. The 7/14/30-day
/// range applies to all three.
class CcQcReport extends ConsumerStatefulWidget {
  const CcQcReport({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<CcQcReport> createState() => _CcQcReportState();
}

class _CcQcReportState extends ConsumerState<CcQcReport> {
  int _days = 7;
  _Scope _scope = _Scope.all;
  String? _vmccId;

  List<MpNode> _children(List<MpNode> all) =>
      all.where((n) => n.parentNodeId == widget.node.id && n.isActive).toList()
        ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final rowsAsync = ref.watch(nodeReceivedRangeProvider((nodeId: widget.node.id, days: _days)));
    final vmccs = _children(ref.watch(nodesByTypeProvider('vmcc')).asData?.value ?? const []);
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.sm),
        child: Column(children: [
          _scopeBar(t),
          const SizedBox(height: DhenuSpacing.sm),
          _rangeSelector(t),
          if (_scope == _Scope.vmcc) ...[
            const SizedBox(height: DhenuSpacing.sm),
            _vmccField(t, vmccs),
          ],
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(nodeReceivedRangeProvider((nodeId: widget.node.id, days: _days)));
            ref.invalidate(nodesByTypeProvider('vmcc'));
          },
          child: rowsAsync.when(
            loading: () => const DhenuLoadingList(),
            error: (e, _) => DhenuEmptyState(
                icon: DhenuIcons.cloudOff, title: 'Could not load QC data', subtitle: '$e'),
            data: (rows) => _content(rows, vmccs),
          ),
        ),
      ),
    ]);
  }

  Widget _content(List<MpConsignment> rows, List<MpNode> vmccs) {
    switch (_scope) {
      case _Scope.all:
        return QcReportView(
          rows: rows,
          days: _days,
          heroLabel: 'RECEIVED · LAST $_days DAYS',
          heroFooter: 'Qty-weighted quality across all VMCC receipts',
        );
      case _Scope.ranking:
        return QcVmccRanking(rows: rows, vmccs: vmccs, days: _days);
      case _Scope.vmcc:
        final id = _vmccId ?? (vmccs.isNotEmpty ? vmccs.first.id : null);
        if (id == null) {
          return const DhenuEmptyState(
              icon: DhenuIcons.store,
              title: 'No VMCCs linked',
              subtitle: 'Assign VMCCs to this CC in the web admin');
        }
        final v = vmccs.firstWhere((n) => n.id == id, orElse: () => vmccs.first);
        final filtered = rows.where((c) => c.fromNodeId == id).toList();
        return QcReportView(
          rows: filtered,
          days: _days,
          heroLabel: '${v.name.toUpperCase()} · LAST $_days DAYS',
          heroFooter: 'Qty-weighted quality received from this VMCC',
          emptySubtitle: 'No milk received from this VMCC in this window',
        );
    }
  }

  Widget _scopeBar(DhenuTokens t) => Container(
        decoration: BoxDecoration(
            color: t.hairline, borderRadius: BorderRadius.circular(DhenuRadii.pill)),
        padding: const EdgeInsets.all(3),
        child: Row(children: [
          _scopeSeg(t, _Scope.all, 'All'),
          _scopeSeg(t, _Scope.vmcc, 'By VMCC'),
          _scopeSeg(t, _Scope.ranking, 'Ranking'),
        ]),
      );

  Widget _scopeSeg(DhenuTokens t, _Scope s, String label) {
    final on = _scope == s;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _scope = s),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: on ? t.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(DhenuRadii.pill),
          ),
          child: Text(label,
              style: DhenuText.label.copyWith(
                  color: on ? t.brand : t.inkSoft,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w600)),
        ),
      ),
    );
  }

  Widget _vmccField(DhenuTokens t, List<MpNode> vmccs) {
    final id = _vmccId ?? (vmccs.isNotEmpty ? vmccs.first.id : null);
    MpNode? sel;
    for (final n in vmccs) {
      if (n.id == id) { sel = n; break; }
    }
    return DhenuCard(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: vmccs.isEmpty
          ? null
          : () async {
              final picked = await showNodePicker(context,
                  nodes: vmccs, selectedId: id, title: 'Select VMCC');
              if (picked != null) setState(() => _vmccId = picked.id);
            },
      child: Row(children: [
        Icon(DhenuIcons.store, size: 18, color: t.brand),
        const SizedBox(width: DhenuSpacing.sm),
        Expanded(
            child: Text(sel?.name ?? 'Select a VMCC',
                style: DhenuText.body.copyWith(
                    color: sel == null ? t.inkSoft : t.ink, fontWeight: FontWeight.w600))),
        Icon(DhenuIcons.chevronDown, size: 18, color: t.inkSoft),
      ]),
    );
  }

  Widget _rangeSelector(DhenuTokens t) => Row(children: [
        for (final d in const [7, 14, 30]) ...[
          Expanded(child: _rangeChip(t, d)),
          if (d != 30) const SizedBox(width: DhenuSpacing.sm),
        ],
      ]);

  Widget _rangeChip(DhenuTokens t, int d) {
    final on = _days == d;
    return GestureDetector(
      onTap: () => setState(() => _days = d),
      child: Container(
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? t.brand : t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: on ? t.brand : t.hairline),
        ),
        child: Text('$d days',
            style: DhenuText.label.copyWith(color: on ? Colors.white : t.inkSoft)),
      ),
    );
  }
}
