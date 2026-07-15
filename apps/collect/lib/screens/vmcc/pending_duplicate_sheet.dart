import 'package:flutter/material.dart';
import '../../l10n/app_localizations.dart';
import '../../services/pour_queue.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/sheet_grabber.dart';

/// Operator's choice when the farmer already has a pour for this slot saved on
/// the device but not yet synced (offline duplicate guard).
enum PendingDupAction { replace, extraLot }

/// Mirrors the online replace-or-combine sheet, but for queue-pending entries:
/// combining isn't possible offline (nothing to reverse server-side), so the
/// options are replace-the-saved-entry or record deliberately as an extra lot.
Future<PendingDupAction?> showPendingDuplicateSheet(
  BuildContext context,
  String farmerName,
  List<PendingPour> pending,
) {
  final t = DT(context);
  final l = AppLocalizations.of(context);
  final queuedQty = pending.fold<double>(0, (s, p) => s + p.qtyLitres);
  return showModalBottomSheet<PendingDupAction>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SheetGrabber(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.collectPendingDupTitle,
                  style: DhenuText.title.copyWith(color: t.ink)),
              const SizedBox(height: DhenuSpacing.xs),
              Text(l.collectPendingDupBody(farmerName),
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
              const SizedBox(height: DhenuSpacing.md),
              DhenuCard(
                child: Text(
                  litres(queuedQty, unit: true),
                  style: DhenuText.body.copyWith(color: t.ink),
                ),
              ),
              const SizedBox(height: DhenuSpacing.lg),
              Row(children: [
                Expanded(child: OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, PendingDupAction.extraLot),
                  child: Text(l.collectPendingDupExtraLot),
                )),
                const SizedBox(width: DhenuSpacing.md),
                Expanded(child: FilledButton(
                  onPressed: () => Navigator.pop(ctx, PendingDupAction.replace),
                  child: Text(l.collectPendingDupReplace),
                )),
              ]),
              Center(child: TextButton(
                onPressed: () => Navigator.pop(ctx, null),
                child: Text(l.commonCancel, style: DhenuText.label.copyWith(color: t.inkSoft)),
              )),
            ]),
          ),
        ]),
      ),
    ),
  );
}
