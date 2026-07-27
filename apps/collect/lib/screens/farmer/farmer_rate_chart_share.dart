import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_toast.dart';

/// AppBar action that exports the active rate chart as a PDF and opens the OS
/// share sheet. The PDF is rendered server-side (GET /rate-charts/:id/print),
/// so farmers can forward the exact printable chart to family or neighbours.
class RateChartShareAction extends ConsumerStatefulWidget {
  const RateChartShareAction({super.key, required this.chartId});
  final String chartId;

  @override
  ConsumerState<RateChartShareAction> createState() => _RateChartShareActionState();
}

class _RateChartShareActionState extends ConsumerState<RateChartShareAction> {
  bool _busy = false;

  Future<void> _share() async {
    setState(() => _busy = true);
    try {
      final doc = await mpRepo.rateChartPdf(widget.chartId);
      await Printing.sharePdf(bytes: doc.bytes, filename: doc.filename);
    } catch (e) {
      if (mounted) {
        showDhenuToast(context, AppLocalizations.of(context).farmerRateShareError(e),
            type: DhenuToastType.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return IconButton(
      onPressed: _busy ? null : _share,
      tooltip: l.farmerRateShareTooltip,
      icon: _busy
          ? const SizedBox(
              width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(DhenuIcons.share, size: 22, color: t.ink),
    );
  }
}
