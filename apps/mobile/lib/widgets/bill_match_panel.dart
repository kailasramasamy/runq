// PP Phase 3 — Mobile 3-way match panel.
//
// Slots into the AP bill detail screen. Self-hides when the bill's
// vendor has no open POs and the bill isn't already matched. Tapping
// a suggestion opens a confirm sheet; the user accepts (within
// tolerance) or supplies an override reason (outside tolerance).
//
// Follows /module-ui purchase skill conventions:
//   * Uses Pur* primitives (PurStatusPill-equivalent via local badge,
//     PurColors.brand for accent) — match is a PP concept surfaced on
//     a finance screen, so the violet accent visually links to the PP
//     module.
//   * Picker-sheet archetype: DraggableScrollableSheet with search-less
//     list (open POs are already filtered server-side).
//   * keyboardDismissBehavior: onDrag on the override-reason sheet.
//   * RunqText tokens only — check-fonts.sh clean.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/purchase_models.dart';
import '../api/purchase_repo.dart';
import '../screens/purchase/widgets/pur_colors.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import 'runq_card.dart';
import 'runq_snack.dart';

class BillMatchPanel extends ConsumerStatefulWidget {
  final String billId;
  /// Invoked after a successful match commit so the parent can invalidate
  /// its bill-detail provider.
  final VoidCallback? onMatched;
  const BillMatchPanel({super.key, required this.billId, this.onMatched});

  @override
  ConsumerState<BillMatchPanel> createState() => _BillMatchPanelState();
}

class _BillMatchPanelState extends ConsumerState<BillMatchPanel> {
  late Future<MatchPreview> _future;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  void _refresh() {
    _future = purchaseRepo.previewMatch(widget.billId);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<MatchPreview>(
      future: _future,
      builder: (_, snap) {
        if (snap.connectionState != ConnectionState.done) return const SizedBox.shrink();
        if (snap.hasError) return const SizedBox.shrink();
        final p = snap.data;
        if (p == null) return const SizedBox.shrink();
        // Self-hide when nothing to show: no open POs AND not already matched.
        if (p.openPos.isEmpty && p.matchedPoId == null) return const SizedBox.shrink();
        return _PanelBody(
          preview: p,
          onMatched: () {
            setState(_refresh);
            widget.onMatched?.call();
          },
        );
      },
    );
  }
}

class _PanelBody extends StatelessWidget {
  final MatchPreview preview;
  final VoidCallback onMatched;
  const _PanelBody({required this.preview, required this.onMatched});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('3-WAY MATCH', style: RunqText.label),
                    const SizedBox(height: 2),
                    Text(
                      preview.matchedPoId != null
                          ? 'Matched · tolerance ±${preview.tolerancePct.toStringAsFixed(1)}%'
                          : '${preview.openPos.length} open PO(s) for this vendor · ±${preview.tolerancePct.toStringAsFixed(1)}%',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ),
              _StatusBadge(status: preview.matchStatus),
            ],
          ),
          const SizedBox(height: 10),
          if (preview.matchedPoId != null)
            _MatchedRow(preview: preview)
          else
            Column(
              children: preview.openPos.take(5).map((po) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: _SuggestionRow(
                    billId: preview.billId,
                    billTotal: preview.amountDelta?.billTotal ?? 0,
                    tolerancePct: preview.tolerancePct,
                    po: po,
                    onMatched: onMatched,
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (bg, fg, label) = switch (status) {
      'matched' => (PurColors.successBg, PurColors.success, '✓ Matched'),
      'mismatch' => (PurColors.orangeAlertBg, PurColors.orangeAlert, 'Override'),
      _ => (RT(context).bgWarm, RT(context).muted, 'Unmatched'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: RunqText.micro.copyWith(color: fg, fontWeight: FontWeight.w600)),
    );
  }
}

class _SuggestionRow extends StatelessWidget {
  final String billId;
  final double billTotal;
  final double tolerancePct;
  final OpenPoSummary po;
  final VoidCallback onMatched;
  const _SuggestionRow({
    required this.billId,
    required this.billTotal,
    required this.tolerancePct,
    required this.po,
    required this.onMatched,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final absDelta = (billTotal - po.openValue).abs();
    final pctDelta = po.openValue > 0 ? (absDelta / po.openValue) * 100 : 100;
    final withinTolerance = pctDelta <= tolerancePct;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(po.poNumber,
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text(
                  'Open ${formatINR(po.openValue)} · Bill ${formatINR(billTotal)} · Δ ${formatINR(absDelta)} (${pctDelta.toStringAsFixed(1)}%)',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: () => _openCommitSheet(context),
            style: FilledButton.styleFrom(
              backgroundColor: withinTolerance ? PurColors.brand(context) : PurColors.orangeAlert,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              minimumSize: const Size(0, 0),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(withinTolerance ? 'Match' : 'Override',
                style: RunqText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Future<void> _openCommitSheet(BuildContext context) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _CommitMatchSheet(
        billId: billId,
        billTotal: billTotal,
        tolerancePct: tolerancePct,
        po: po,
      ),
    );
    if (ok == true) onMatched();
  }
}

class _MatchedRow extends StatelessWidget {
  final MatchPreview preview;
  const _MatchedRow({required this.preview});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final po = preview.openPos
        .where((p) => p.id == preview.matchedPoId)
        .cast<OpenPoSummary?>()
        .firstWhere((_) => true, orElse: () => null);
    final delta = preview.amountDelta;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: t.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.link_rounded, size: 14, color: PurColors.brand(context)),
              const SizedBox(width: 6),
              Text(po?.poNumber ?? '(closed PO)',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ],
          ),
          if (delta != null) ...[
            const SizedBox(height: 2),
            Text(
              'Bill ${formatINR(delta.billTotal)} vs PO open ${formatINR(delta.poOpen)} · Δ ${formatINR(delta.absDelta)} (${delta.pctDelta.toStringAsFixed(1)}%)',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
        ],
      ),
    );
  }
}

class _CommitMatchSheet extends StatefulWidget {
  final String billId;
  final double billTotal;
  final double tolerancePct;
  final OpenPoSummary po;
  const _CommitMatchSheet({
    required this.billId,
    required this.billTotal,
    required this.tolerancePct,
    required this.po,
  });

  @override
  State<_CommitMatchSheet> createState() => _CommitMatchSheetState();
}

class _CommitMatchSheetState extends State<_CommitMatchSheet> {
  final _reasonCtl = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reasonCtl.dispose();
    super.dispose();
  }

  Future<void> _commit(bool withinTolerance) async {
    if (!withinTolerance && _reasonCtl.text.trim().isEmpty) {
      showRunqSnack(context, 'An override reason is required', kind: SnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await purchaseRepo.commitMatch(
        billId: widget.billId,
        matchedPoId: widget.po.id,
        overrideReason: withinTolerance ? null : _reasonCtl.text.trim(),
      );
      if (!mounted) return;
      showRunqSnack(
        context,
        res.status == 'matched'
            ? 'Matched to ${widget.po.poNumber}'
            : 'Override accepted (${res.pctDelta.toStringAsFixed(1)}% > ${widget.tolerancePct}%)',
        kind: SnackKind.success,
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final absDelta = (widget.billTotal - widget.po.openValue).abs();
    final pctDelta = widget.po.openValue > 0 ? (absDelta / widget.po.openValue) * 100 : 100;
    final withinTolerance = pctDelta <= widget.tolerancePct;

    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.9,
      expand: false,
      builder: (_, scrollCtl) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text('Match to ${widget.po.poNumber}',
                        style: RunqText.h3.copyWith(color: t.ink)),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollCtl,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: withinTolerance ? PurColors.successBg : PurColors.orangeAlertBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: withinTolerance ? PurColors.success : PurColors.orangeAlert,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Bill ${formatINR(widget.billTotal)} vs PO open ${formatINR(widget.po.openValue)}',
                          style: RunqText.bodyStrong.copyWith(color: t.ink),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Δ ${formatINR(absDelta)} (${pctDelta.toStringAsFixed(2)}%) · tolerance ±${widget.tolerancePct}%',
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                      ],
                    ),
                  ),
                  if (!withinTolerance) ...[
                    const SizedBox(height: 12),
                    Text('OVERRIDE REASON', style: RunqText.micro),
                    const SizedBox(height: 4),
                    TextField(
                      controller: _reasonCtl,
                      maxLines: 3,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        hintText: 'Short-supply on PO; vendor invoiced extra freight; …',
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
              decoration: BoxDecoration(
                color: t.surface,
                border: Border(top: BorderSide(color: t.hairline)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => Navigator.pop(context),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: _busy ? null : () => _commit(withinTolerance),
                      style: FilledButton.styleFrom(
                        backgroundColor:
                            withinTolerance ? PurColors.brand(context) : PurColors.orangeAlert,
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : Text(withinTolerance ? 'Match' : 'Override & match'),
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
}
