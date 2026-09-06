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
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _UnwindSheet(consignmentId: consignmentId, title: title),
  );
  if (ok == true) await onDone();
  return ok == true;
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
      await mpRepo.unwindRun(widget.consignmentId, includePours: _includePours);
      if (mounted) Navigator.of(context).pop(true);
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
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      child: SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _header(t, l),
          Flexible(
            child: _loading
                ? const Padding(
                    padding: EdgeInsets.all(DhenuSpacing.lg), child: DhenuLoadingList(rows: 3))
                : ListView(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(
                        DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
                    children: [
                      if (plan != null) ...[
                        for (var i = 0; i < plan.steps.length; i++)
                          _stepRow(t, l, i + 1, plan.steps[i]),
                        if (plan.steps.isEmpty)
                          Text(l.unwindNothing,
                              style: DhenuText.body.copyWith(color: t.inkSoft)),
                        const SizedBox(height: DhenuSpacing.lg),
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
            DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.md),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Center(child: SheetGrabber()),
          const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Icon(DhenuIcons.undo, size: 20, color: t.gradeC),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.unwindTitle, style: DhenuText.title.copyWith(color: t.ink)),
              Text(widget.title, style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ])),
          ]),
        ]),
      );

  /// Numbered, because the order is the whole point — the far end first, then
  /// back down the chain. An operator who has been told "cancel the receipt
  /// first" three times should be able to see why.
  Widget _stepRow(DhenuTokens t, AppLocalizations l, int n, MpUnwindStep s) {
    final color = s.isBlocked ? t.gradeC : t.ink;
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.md),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 22, height: 22, alignment: Alignment.center,
          decoration: BoxDecoration(
            color: (s.isBlocked ? t.gradeC : t.brand).withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Text('$n',
              style: DhenuText.label.copyWith(color: s.isBlocked ? t.gradeC : t.brand)),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.detail, style: DhenuText.body.copyWith(color: color)),
          const SizedBox(height: 2),
          Text(
            s.qtyLitres > 0 ? '${s.label} · ${litres(s.qtyLitres, unit: true)}' : s.label,
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
          if (s.isBlocked) ...[
            const SizedBox(height: 3),
            Text(s.blocked!, style: DhenuText.caption.copyWith(color: t.gradeC)),
          ],
        ])),
      ]),
    );
  }

  /// Off by default and never implied. Reversing a pour takes a farmer's
  /// payment away, which is a different decision from removing a duplicate leg,
  /// and it must not ride along unnoticed with one.
  Widget _poursToggle(DhenuTokens t, AppLocalizations l) => SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        value: _includePours,
        onChanged: _running ? null : (v) { setState(() => _includePours = v); _load(); },
        title: Text(l.unwindIncludePours, style: DhenuText.body.copyWith(color: t.ink)),
        subtitle: Text(l.unwindIncludePoursHint,
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
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
