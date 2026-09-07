import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_toast.dart';

/// Sharing a received load, the way a pour is shared from the detail sheet.
///
/// The receiving operator is asked for these figures constantly — the VMCC
/// wants to know what landed and how it tested, and the answer used to be a
/// photograph of the screen or a hand-typed message that quietly disagreed with
/// the app. Composing it here means every surface sends the same sentence.
///
/// No pricing, deliberately: a leg's ₹/L is settled per cycle against the rate
/// chart, and a figure sent load-by-load reads as a promise the payout then has
/// to argue with.

/// Open WhatsApp with the load written out. Same wa.me text share the shift
/// roundup uses (WhatsApp shows its own contact picker), so no share dependency.
Future<void> shareConsignment(
  BuildContext context, {
  required MpConsignment consignment,
  required String sourceName,
  required String destinationName,
}) async {
  final l = AppLocalizations.of(context);
  final msg = consignmentShareMessage(l,
      c: consignment, sourceName: sourceName, destinationName: destinationName);
  final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(msg)}');
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    showDhenuToast(context, l.helpCouldNotOpen, type: DhenuToastType.error);
  }
}

/// Structured, one fact per line. A line appears only where there is something
/// to say: an analyzer-less VMCC sends no FAT/SNF, and a refusal line on a load
/// nobody refused would read as a dispute that never happened.
String consignmentShareMessage(
  AppLocalizations l, {
  required MpConsignment c,
  required String sourceName,
  required String destinationName,
}) {
  final quality = [
    if (c.receiptFat != null) 'FAT ${c.receiptFat!.toStringAsFixed(1)}',
    if (c.receiptSnf != null) 'SNF ${c.receiptSnf!.toStringAsFixed(1)}',
  ].join(' · ');
  return [
    l.consignmentShareTitle,
    '$sourceName → $destinationName',
    '',
    '${prettyDate(c.collectionDate)} · ${consignmentSlotL10n(l, c.shift)}',
    if (c.milkType != null) '${l.pourDetailMilkType}: ${milkTypeL10n(l, c.milkType!)}',
    if (c.dispatchQty != null)
      '${l.consignmentShareDispatched}: ${litres(c.dispatchQty!, unit: true)}',
    '${l.consignmentShareReceived}: ${litres(c.receiptQty ?? 0, unit: true)}',
    if (quality.isNotEmpty) quality,
    if (c.receiptWater != null)
      '${l.pourDetailWater}: ${c.receiptWater!.toStringAsFixed(1)}',
    if (c.rejectedQty > 0)
      '${l.consignmentShareRefused}: ${litres(c.rejectedQty, unit: true)}',
    '',
    c.consignmentNo,
    if (c.containerNo?.isNotEmpty ?? false) l.dispatchContainerLabel(c.containerNo!),
  ].join('\n');
}

/// Share affordance for a row that has no actions sheet to hang it in — the
/// per-consignment legs in receive history.
class ShareConsignmentButton extends StatelessWidget {
  const ShareConsignmentButton({
    super.key,
    required this.consignment,
    required this.sourceName,
    required this.destinationName,
  });

  final MpConsignment consignment;
  final String sourceName;
  final String destinationName;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return IconButton(
      icon: Icon(DhenuIcons.share, size: 16, color: t.brand),
      tooltip: l.consignmentShare,
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      padding: EdgeInsets.zero,
      onPressed: () => shareConsignment(context,
          consignment: consignment,
          sourceName: sourceName,
          destinationName: destinationName),
    );
  }
}
