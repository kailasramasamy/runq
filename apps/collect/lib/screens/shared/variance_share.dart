import 'package:printing/printing.dart';

import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_payout_providers.dart' show MpCyclePeriod;
import '../../utils/format.dart';
import 'variance_widgets.dart';

/// Sharing the period's receipt variance.
///
/// The plant head asks the CC owner "how much are we losing and from whom". The
/// answer travels as the server-rendered PDF — source, day and load tables,
/// laid out to stand on its own — with a short caption carrying the headline,
/// so the chat preview says what the document is before anyone opens it.

/// Fetch the statement and open the OS share sheet with it. Throws the API's
/// own exception on failure so the caller can show it where the tap happened.
Future<void> shareVariance(
  AppLocalizations l, {
  required MpNode node,
  required String stage,
  required MpCyclePeriod period,
  required MpReceiptVarianceReport report,
}) async {
  final doc = await mpRepo.receiptVarianceStatementPdf(
    from: period.start, to: period.end, stage: stage, toNodeId: node.id,
    label: period.label,
  );
  final title = l.varianceShareTitle(node.name, period.label);
  await Printing.sharePdf(
    bytes: doc.bytes,
    filename: doc.filename,
    subject: title,
    body: varianceShareMessage(l, title: title, report: report),
  );
}

/// The caption: headline figures only — the breakdown is in the PDF, and
/// repeating it in the message would put two copies of every number in the chat.
String varianceShareMessage(
  AppLocalizations l, {
  required String title,
  required MpReceiptVarianceReport report,
}) {
  final s = report.totals;
  final loss = s.netValue != 0 ? s.netValue < 0 : s.netQty < 0;
  final netLine = loss ? l.varianceShareNetLoss : l.varianceShareNetGain;
  return [
    title,
    netLine(
      rupees(s.netValue.abs()),
      signedLitres(s.netQty, unit: true),
      signedPct(s.netPct),
    ),
    l.varianceShareShortOver(
      litres(s.shortQty, unit: true),
      rupees(s.shortValue),
      litres(s.gainQty, unit: true),
      rupees(s.gainValue),
    ),
    l.varianceShareFlagged(s.flaggedLoads, s.matchedLoads, s.loads),
    l.varianceShareSeePdf,
  ].join('\n');
}
