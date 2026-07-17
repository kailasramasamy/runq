import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_toast.dart';

/// Button that exports a farmer's pours for a chosen cycle as a PDF and opens
/// the OS share sheet. The PDF is rendered server-side (parity with web).
class ShareStatementButton extends ConsumerStatefulWidget {
  const ShareStatementButton({super.key, required this.farmer});
  final MpFarmer farmer;

  @override
  ConsumerState<ShareStatementButton> createState() => _ShareStatementButtonState();
}

class _ShareStatementButtonState extends ConsumerState<ShareStatementButton> {
  bool _busy = false;

  /// Default tap: share the latest *closed* cycle straight away (the most
  /// common ask — no picker). The calendar button next door opens the picker.
  Future<void> _run({bool choose = false}) async {
    final l = AppLocalizations.of(context);
    final cycles = await ref.read(recentCyclePeriodsProvider.future);
    if (!mounted) return;
    if (cycles.isEmpty) {
      showDhenuToast(context, l.statementNoCycles, type: DhenuToastType.error);
      return;
    }
    // cycles[0] is the in-progress window; [1] is the newest closed one.
    final MpCyclePeriod? picked = choose
        ? await _pickCycle(cycles)
        : (cycles.length > 1 ? cycles[1] : cycles.first);
    if (picked == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final doc = await mpRepo.farmerPourStatementPdf(
        farmerId: widget.farmer.id, from: picked.start, to: picked.end, label: picked.label,
      );
      // Operators keep the straight-to-share flow (they're sending it on, not
      // reading it), but share the server's name so both surfaces agree.
      await Printing.sharePdf(bytes: doc.bytes, filename: doc.filename);
    } catch (e) {
      if (mounted) {
        final l2 = AppLocalizations.of(context);
        showDhenuToast(context, l2.statementGenerateError(e), type: DhenuToastType.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<MpCyclePeriod?> _pickCycle(List<MpCyclePeriod> cycles) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return showModalBottomSheet<MpCyclePeriod>(
      context: context,
      backgroundColor: t.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.lg, DhenuSpacing.lg, DhenuSpacing.lg, DhenuSpacing.sm),
              child: Text(l.statementSelectCycle, style: DhenuText.title.copyWith(color: t.ink)),
            ),
            // Flexible + scrollable list so a tall set of cycles never overflows
            // on shorter screens.
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
                children: [
                  for (final c in cycles)
                    ListTile(
                      leading: Icon(DhenuIcons.calendar, color: t.brand),
                      title: Text(c.label, style: DhenuText.body.copyWith(color: t.ink)),
                      subtitle: Text('${prettyDate(c.start)} – ${prettyDate(c.end)}',
                          style: DhenuText.caption.copyWith(color: t.inkSoft)),
                      onTap: () => Navigator.pop(context, c),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final buttonStyle = OutlinedButton.styleFrom(
      minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
      side: BorderSide(color: t.brand),
      foregroundColor: t.brand,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.button)),
    );
    return Row(children: [
      Expanded(
        child: OutlinedButton.icon(
          onPressed: _busy ? null : _run,
          icon: _busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(DhenuIcons.share, size: 18),
          label: Text(_busy ? l.statementPreparing : l.statementShareButton),
          style: buttonStyle,
        ),
      ),
      const SizedBox(width: DhenuSpacing.sm),
      // Pick a different cycle — the plain tap shares the latest closed one.
      OutlinedButton(
        onPressed: _busy ? null : () => _run(choose: true),
        style: buttonStyle.copyWith(
          minimumSize: const WidgetStatePropertyAll(Size(DhenuSpacing.minTap, DhenuSpacing.minTap)),
          padding: const WidgetStatePropertyAll(EdgeInsets.zero),
        ),
        child: const Icon(DhenuIcons.calendar, size: 18),
      ),
    ]);
  }
}
