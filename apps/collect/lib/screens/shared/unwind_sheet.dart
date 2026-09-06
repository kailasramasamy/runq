import 'package:flutter/material.dart';

import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/dhenu_toast.dart';

/// Undo a load end to end, from wherever you are looking at it.
///
/// The pieces already existed — un-receive, cancel dispatch, reopen, reverse
/// pour — but each lived in a different app mode, in an order the server
/// enforces and nothing explained, and several of those screens only show
/// today. Correcting Friday's duplicate meant four screens, two mode switches,
/// and knowing to start from the far end.
///
/// So: show the whole chain, say what will happen to each leg, and do it in one
/// action. The preview is the point — a chain undo that does not first say what
/// it will undo is not something anyone should tap.
Future<bool> showUnwindSheet(
  BuildContext context, {
  required String consignmentId,
  required String title,
  required Future<void> Function() onDone,
}) async {
  final undone = await showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _UnwindSheet(consignmentId: consignmentId, title: title),
  );
  if (undone == null || undone == 0) return false;
  await onDone();
  // Say it happened. A chain action that silently closes leaves the operator
  // checking three screens to find out whether it worked — which is most of
  // what this feature was built to stop.
  if (context.mounted) {
    showDhenuToast(context, AppLocalizations.of(context).unwindDone(undone),
        type: DhenuToastType.success);
  }
  return true;
}

class _UnwindSheet extends StatefulWidget {
  const _UnwindSheet({required this.consignmentId, required this.title});

  final String consignmentId;
  final String title;

  @override
  State<_UnwindSheet> createState() => _UnwindSheetState();
}

class _UnwindSheetState extends State<_UnwindSheet> {
  MpUnwindPlan? _plan;
  String? _error;
  bool _loading = true;
  bool _running = false;
  bool _includePours = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final plan = await mpRepo.unwindPlan(widget.consignmentId, includePours: _includePours);
      if (mounted) setState(() { _plan = plan; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = friendlyError(context, e); _loading = false; });
    }
  }

  Future<void> _run() async {
    setState(() { _running = true; _error = null; });
    try {
      final undone = await mpRepo.unwindRun(widget.consignmentId, includePours: _includePours);
      if (mounted) Navigator.of(context).pop(undone);
    } catch (e) {
      if (mounted) setState(() { _running = false; _error = friendlyError(context, e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final plan = _plan;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      // Hugs its content, capped rather than fixed. Three steps left two-thirds
      // of the screen empty above the button before this.
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      child: SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _header(t, l),
          Flexible(
            child: _loading
                ? const Padding(
                    padding: EdgeInsets.all(DhenuSpacing.lg), child: DhenuLoadingList(rows: 3))
                : ListView(
                    shrinkWrap: true,
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(
                        DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
                    children: [
                      if (plan != null) ...[
                        if (plan.blocked) _blockedBanner(t, l),
                        if (plan.steps.isEmpty)
                          Text(l.unwindNothing, style: DhenuText.body.copyWith(color: t.inkSoft))
                        else ...[
                          Text(l.unwindWhatHappens,
                              style: DhenuText.label.copyWith(color: t.inkSoft)),
                          const SizedBox(height: DhenuSpacing.md),
                          for (var i = 0; i < plan.steps.length; i++)
                            _stepRow(t, i + 1, plan.steps[i], isLast: i == plan.steps.length - 1),
                        ],
                        const SizedBox(height: DhenuSpacing.md),
                        Divider(height: 1, color: t.hairline),
                        const SizedBox(height: DhenuSpacing.md),
                        _poursToggle(t, l),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: DhenuSpacing.md),
                        Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
                      ],
                    ],
                  ),
          ),
          _footer(t, l, plan),
        ]),
      ),
    );
  }

  Widget _header(DhenuTokens t, AppLocalizations l) => Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.lg),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Center(child: SheetGrabber()),
          const SizedBox(height: DhenuSpacing.md),
          Row(children: [
            Container(
              width: 38, height: 38, alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: t.gradeC.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: Icon(DhenuIcons.undo, size: 20, color: t.gradeC),
            ),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.unwindTitle, style: DhenuText.title.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(widget.title,
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
            ])),
          ]),
        ]),
      );

  /// Said once at the top rather than repeated per blocked step — the button is
  /// disabled, and the operator needs to know why before reading down.
  Widget _blockedBanner(DhenuTokens t, AppLocalizations l) => Container(
        margin: const EdgeInsets.only(bottom: DhenuSpacing.lg),
        padding: const EdgeInsets.all(DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.gradeC.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Row(children: [
          Icon(DhenuIcons.warning, size: 16, color: t.gradeC),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(child: Text(l.unwindBlocked,
              style: DhenuText.caption.copyWith(color: t.gradeC))),
        ]),
      );

  /// A timeline, not a list. These steps are one chain undone from the far end
  /// back, and the connector is what says so — the ordering rule an operator
  /// otherwise only ever meets as a refusal three screens later.
  Widget _stepRow(DhenuTokens t, int n, MpUnwindStep s, {required bool isLast}) {
    final tone = s.isBlocked ? t.gradeC : t.brand;
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Column(children: [
          Container(
            width: 24, height: 24, alignment: Alignment.center,
            decoration: BoxDecoration(color: tone.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Text('$n', style: DhenuText.label.copyWith(color: tone)),
          ),
          if (!isLast) Expanded(child: Container(width: 2, color: t.hairline)),
        ]),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : DhenuSpacing.lg),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.detail,
                  style: DhenuText.body.copyWith(
                      color: s.isBlocked ? t.gradeC : t.ink, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(
                s.qtyLitres > 0 ? '${s.label} · ${litres(s.qtyLitres, unit: true)}' : s.label,
                style: DhenuText.caption.copyWith(color: t.inkSoft),
              ),
              if (s.isBlocked) ...[
                const SizedBox(height: 3),
                Text(s.blocked!, style: DhenuText.caption.copyWith(color: t.gradeC)),
              ],
            ]),
          ),
        ),
      ]),
    );
  }

  /// Off by default and never implied. Reversing a pour takes a farmer's
  /// payment away, which is a different decision from removing a duplicate leg,
  /// and it must not ride along unnoticed with one.
  Widget _poursToggle(DhenuTokens t, AppLocalizations l) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: _includePours ? t.gradeC.withValues(alpha: 0.4) : t.hairline),
        ),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.unwindIncludePours,
                style: DhenuText.body.copyWith(
                    color: t.ink, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(l.unwindIncludePoursHint,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ])),
          const SizedBox(width: DhenuSpacing.md),
          Switch.adaptive(
            value: _includePours,
            onChanged: _running ? null : (v) { setState(() => _includePours = v); _load(); },
          ),
        ]),
      );

  Widget _footer(DhenuTokens t, AppLocalizations l, MpUnwindPlan? plan) {
    final canRun = plan != null && !plan.blocked && plan.steps.isNotEmpty && !_running;
    return Container(
      decoration: BoxDecoration(border: Border(top: BorderSide(color: t.hairline))),
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.md),
      child: PrimaryAction(
        label: plan == null
            ? l.unwindTitle
            : l.unwindConfirm(plan.steps.where((s) => !s.isBlocked).length),
        icon: DhenuIcons.undo,
        onPressed: canRun ? _run : null,
        loading: _running,
      ),
    );
  }
}
