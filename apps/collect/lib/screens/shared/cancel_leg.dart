import 'package:flutter/material.dart';

import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/sheet_grabber.dart';
import 'unwind_sheet.dart';

/// Undoing a leg of the journey, shared by both ends of both legs.
///
/// A mis-entry at a VMCC has to be walked all the way back — plant receipt, CC
/// dispatch, CC receipt, VMCC dispatch — before the pour itself can be touched,
/// and each of those four screens needs the same button, the same confirm
/// wording and the same "the server said no, here's why" handling. Keeping it
/// in one place is what stops the four drifting into four slightly different
/// answers to the same question.
///
/// The server owns every rule about whether a cancel is allowed (milk sent
/// onward, batch already in production). Nothing here second-guesses it — the
/// button is offered on state alone, and the refusal comes back as a toast.

/// Cancel button for a dispatched load.
///
/// Once the load has landed the undo has to start at the far end, so the button
/// turns into a hint saying so rather than disappearing. Rendering nothing was
/// the dead end that sent an operator hunting: their duplicate legs were
/// already received, the tab offered no affordance at all, and there was
/// nothing on screen naming the centre that had to act first.
class CancelDispatchButton extends StatelessWidget {
  const CancelDispatchButton({
    super.key,
    required this.consignment,
    required this.destinationName,
    required this.onDone,
  });

  final MpConsignment consignment;
  final String destinationName;
  final Future<void> Function() onDone;

  @override
  Widget build(BuildContext context) {
    if (consignment.isReversed) return const SizedBox.shrink();
    final t = DT(context);
    final l = AppLocalizations.of(context);
    // A received leg used to render a lock and a hint naming the centre that
    // had to act first — true, but it left the operator to go and find that
    // screen, in another mode, often date-scoped to today. The undo now starts
    // from here and walks the whole chain in the order the guards require.
    if (consignment.received) {
      return IconButton(
        icon: Icon(DhenuIcons.undo, size: 18, color: t.gradeC),
        tooltip: l.unwindOpen,
        onPressed: () => showUnwindSheet(
          context,
          consignmentId: consignment.id,
          title: '${consignment.consignmentNo} · $destinationName',
          onDone: onDone,
        ),
      );
    }
    return IconButton(
      icon: Icon(DhenuIcons.undo, size: 18, color: t.gradeC),
      tooltip: l.cancelDispatchAction,
      onPressed: () => confirmCancelDispatch(context, consignment, destinationName, onDone),
    );
  }
}

/// Cancel button for a load already taken in here. Puts it back in transit so
/// the sender can withdraw it — or, for a manually-entered receipt, withdraws
/// it outright, since there is no dispatch behind it to return to.
class CancelReceiptButton extends StatelessWidget {
  const CancelReceiptButton({
    super.key,
    required this.consignment,
    required this.sourceName,
    required this.onDone,
  });

  final MpConsignment consignment;
  final String sourceName;
  final Future<void> Function() onDone;

  @override
  Widget build(BuildContext context) {
    if (!consignment.received || consignment.isReversed) return const SizedBox.shrink();
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final manual = consignment.directReceive;
    return IconButton(
      icon: Icon(manual ? DhenuIcons.trash : DhenuIcons.undo, size: 18, color: t.gradeC),
      tooltip: manual ? l.ccReceiveDeleteReceipt : l.cancelReceiptAction,
      onPressed: () => confirmCancelReceipt(context, consignment, sourceName, onDone),
    );
  }
}

/// Confirm and cancel a dispatch. Exposed on its own so a screen that lists its
/// actions in a sheet can offer the same undo as one that shows an icon.
Future<void> confirmCancelDispatch(
  BuildContext context, MpConsignment c, String destinationName,
  Future<void> Function() onDone,
) {
  final l = AppLocalizations.of(context);
  return _run(
    context,
    title: l.cancelDispatchTitle,
    body: l.cancelDispatchBody(litres(c.dispatchQty ?? 0, unit: true), destinationName),
    confirmLabel: l.cancelDispatchAction,
    action: () => mpRepo.cancelDispatch(c.id),
    onDone: onDone,
  );
}

/// Confirm and cancel a receipt. A manual receipt is worded as a deletion,
/// because that is what it is — there is no dispatch for it to fall back to.
Future<void> confirmCancelReceipt(
  BuildContext context, MpConsignment c, String sourceName,
  Future<void> Function() onDone,
) {
  final l = AppLocalizations.of(context);
  final manual = c.directReceive;
  return _run(
    context,
    title: manual ? l.ccReceiveDeleteConfirmTitle : l.cancelReceiptTitle,
    body: manual
        ? l.ccReceiveDeleteConfirmBody(sourceName, litres(c.receiptQty ?? 0, unit: true))
        : l.cancelReceiptBody(litres(c.receiptQty ?? 0, unit: true), sourceName),
    confirmLabel: manual ? l.syncDelete : l.cancelReceiptAction,
    action: () => mpRepo.cancelReceipt(c.id),
    onDone: onDone,
  );
}

/// Confirm, call, refresh. A refusal (milk already moved on) surfaces as the
/// server's own sentence — it names the next step, which a generic "could not
/// cancel" would throw away.
Future<void> _run(
  BuildContext context, {
  required String title,
  required String body,
  required String confirmLabel,
  required Future<void> Function() action,
  required Future<void> Function() onDone,
}) async {
  final l = AppLocalizations.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.commonCancel)),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(confirmLabel)),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await action();
    await onDone();
  } catch (e) {
    if (context.mounted) {
      showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
    }
  }
}

/// The same undo, one tap further away.
///
/// A dispatched load is money and litres already committed downstream, and an
/// undo icon sitting inline in the sent-legs list is a mis-tap away from
/// unwinding a leg nobody asked to unwind. The dots open a sheet that names the
/// load first, so the operator confirms which leg before they confirm the act.
class CancelDispatchMenuButton extends StatelessWidget {
  const CancelDispatchMenuButton({
    super.key,
    required this.consignment,
    required this.destinationName,
    required this.onDone,
  });

  final MpConsignment consignment;
  final String destinationName;
  final Future<void> Function() onDone;

  @override
  Widget build(BuildContext context) {
    if (consignment.isReversed) return const SizedBox.shrink();
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return IconButton(
      icon: Icon(DhenuIcons.more, size: 18, color: t.inkSoft),
      tooltip: consignment.received ? l.unwindOpen : l.cancelDispatchAction,
      onPressed: () => _openDispatchActions(context, consignment, destinationName, onDone),
    );
  }
}

/// Sheet listing what can be done to a sent leg. Once the load has landed the
/// undo has to start at the far end, so the one action turns into the chain
/// unwind rather than a cancel the server would refuse.
Future<void> _openDispatchActions(
  BuildContext context, MpConsignment c, String destinationName,
  Future<void> Function() onDone,
) {
  final t = DT(context);
  final l = AppLocalizations.of(context);
  final title = '${c.consignmentNo} · $destinationName';
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Center(child: SheetGrabber()),
              Text(destinationName, style: DhenuText.title.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text('${c.consignmentNo} · ${litres(c.dispatchQty ?? 0, unit: true)}',
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
              const SizedBox(height: DhenuSpacing.lg),
              _sheetAction(
                t,
                DhenuIcons.undo,
                c.received ? l.unwindOpen : l.cancelDispatchAction,
                t.gradeC,
                () {
                  Navigator.pop(ctx);
                  if (c.received) {
                    showUnwindSheet(context,
                        consignmentId: c.id, title: title, onDone: onDone);
                  } else {
                    confirmCancelDispatch(context, c, destinationName, onDone);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

Widget _sheetAction(
    DhenuTokens t, IconData icon, String label, Color color, VoidCallback onTap) {
  return InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(DhenuRadii.card),
    child: Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        border: Border.all(color: t.hairline),
      ),
      child: Row(children: [
        Container(
          width: 38, height: 38, alignment: Alignment.center,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Text(label, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
      ]),
    ),
  );
}
