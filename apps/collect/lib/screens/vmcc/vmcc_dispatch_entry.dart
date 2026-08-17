import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/sheet_grabber.dart';
import 'fast_track_sheet.dart';
import 'vmcc_dispatch_tab.dart';

/// The one way into dispatch from a VMCC — used by Record Collection's
/// post-close CTA and by the home screen's Dispatch button, so both behave the
/// same way.
///
/// At an ordinary VMCC there is one destination, so this goes straight to the
/// dispatch screen. At a single-site VMCC the milk can either take the usual
/// leg to its chilling centre or run the whole chain to the plant in one step,
/// and only the operator knows which — so it asks. The chain is offered first
/// because at a single-site plant it is the normal case; the CC leg stays for
/// the day the plant isn't ready to take the milk.
Future<void> openVmccDispatch(
  BuildContext context, {
  required MpNode node,
  String? date,
  Shift? shift,
  /// Both of the day's shifts are closed and waiting. The chain can take them
  /// together; the dispatch screen cannot, so the chooser says which is which.
  bool bothShifts = false,
  String? totalLabel,
}) async {
  if (!node.fastTrackEnabled) {
    return _openDispatchScreen(context, node: node, date: date, shift: shift);
  }
  final choice = await _askDestination(context, node,
      bothShifts: bothShifts, totalLabel: totalLabel, firstShift: shift);
  if (choice == null || !context.mounted) return;
  if (choice == _Destination.plant) {
    return showFastTrackSheet(context,
        node: node, date: date, shift: shift, allClosedShifts: bothShifts);
  }
  return _openDispatchScreen(context, node: node, date: date, shift: shift);
}

enum _Destination { plant, cc }

Future<_Destination?> _askDestination(
    BuildContext context, MpNode node,
    {bool bothShifts = false, String? totalLabel, Shift? firstShift}) {
  final t = DT(context);
  final l = AppLocalizations.of(context);

  return showModalBottomSheet<_Destination>(
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
          // Watched, not read: nothing on VMCC home listens to the plant list,
          // so a cached read came back empty and the option rendered as a bare
          // "Send to". Watching fetches it and fills the name in when it lands.
          child: Consumer(builder: (ctx, ref, _) {
            final ccs = ref.watch(nodesByTypeProvider('cc')).valueOrNull ?? const <MpNode>[];
            final pps = ref.watch(nodesByTypeProvider('pp')).valueOrNull ?? const <MpNode>[];
            final cc = ccs.where((n) => n.id == node.parentNodeId).firstOrNull;
            final pp = pps.where((n) => n.id == cc?.parentNodeId).firstOrNull;
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Center(child: SheetGrabber()),
                Text(l.dispatchDestTitle, style: DhenuText.title.copyWith(color: t.ink)),
                const SizedBox(height: DhenuSpacing.lg),
                _option(
                  ctx, t,
                  icon: DhenuIcons.truck,
                  colour: t.brand,
                  // Never "Send to" with nothing after it: until the name
                  // arrives the option says what it does in the general.
                  title: (pp?.name.isNotEmpty ?? false)
                      ? l.dispatchDestPlant(pp!.name)
                      : l.dispatchDestPlantGeneric,
                  subtitle: bothShifts && totalLabel != null
                      ? l.dispatchDestPlantSubBoth(totalLabel)
                      : l.dispatchDestPlantSub,
                  onTap: () => Navigator.of(ctx).pop(_Destination.plant),
                ),
                const SizedBox(height: DhenuSpacing.sm),
                _option(
                  ctx, t,
                  icon: DhenuIcons.snowflake,
                  colour: t.inkSoft,
                  title: (cc?.name.isNotEmpty ?? false)
                      ? l.dispatchDestCc(cc!.name)
                      : l.dispatchDestCcGeneric,
                  // The dispatch screen takes one slot at a time, so when two
                  // are waiting it must say which one it will open — silently
                  // sending half the day is the failure this line prevents.
                  subtitle: bothShifts
                      ? l.dispatchDestCcSubOne(
                          firstShift == Shift.pm ? l.shiftPm : l.shiftAm)
                      : l.dispatchDestCcSub,
                  onTap: () => Navigator.of(ctx).pop(_Destination.cc),
                ),
              ],
            );
          }),
        ),
      ),
    ),
  );
}

Widget _option(
  BuildContext context,
  DhenuTokens t, {
  required IconData icon,
  required Color colour,
  required String title,
  required String subtitle,
  required VoidCallback onTap,
}) =>
    InkWell(
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
            decoration: BoxDecoration(
                color: colour.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Icon(icon, color: colour, size: 20),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(subtitle, style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ]),
          ),
          Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
        ]),
      ),
    );

Future<void> _openDispatchScreen(
  BuildContext context, {
  required MpNode node,
  String? date,
  Shift? shift,
}) {
  final l = AppLocalizations.of(context);
  final t = DT(context);
  return Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => Scaffold(
      appBar: AppBar(title: Text(l.dispatchTitle, style: DhenuText.h2.copyWith(color: t.ink))),
      body: VmccDispatchTab(
        node: node,
        initialDate: date,
        // A pooled VMCC sends its whole window as one tanker, so the slot's
        // shift means nothing there.
        initialShift: node.isPooledDispatch ? null : shift,
      ),
    ),
  ));
}
