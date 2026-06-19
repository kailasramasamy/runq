import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
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

  Future<void> _run() async {
    final cycles = await ref.read(recentCyclePeriodsProvider.future);
    if (!mounted) return;
    if (cycles.isEmpty) {
      showDhenuToast(context, 'No cycles available', type: DhenuToastType.error);
      return;
    }
    final picked = await _pickCycle(cycles);
    if (picked == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final bytes = await mpRepo.farmerPourStatementPdf(
        farmerId: widget.farmer.id, from: picked.start, to: picked.end, label: picked.label,
      );
      await Printing.sharePdf(
        bytes: bytes,
        filename: 'statement-${widget.farmer.code}-${picked.start}.pdf',
      );
    } catch (e) {
      if (mounted) {
        showDhenuToast(context, 'Could not generate statement: $e', type: DhenuToastType.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<MpCyclePeriod?> _pickCycle(List<MpCyclePeriod> cycles) {
    final t = DT(context);
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
              child: Text('Select cycle', style: DhenuText.title.copyWith(color: t.ink)),
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
    return OutlinedButton.icon(
      onPressed: _busy ? null : _run,
      icon: _busy
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(DhenuIcons.share, size: 18),
      label: Text(_busy ? 'Preparing…' : 'Share cycle statement'),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
        side: BorderSide(color: t.brand),
        foregroundColor: t.brand,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.button)),
      ),
    );
  }
}
