import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/shift_toggle.dart';
import 'manual_receive_entry_screen.dart';

/// Manual receive hub — for milk that arrived WITHOUT a dispatch entry (the VMCC
/// operator forgot to mark dispatch, or works off a notebook). The operator
/// picks the date + shift first, then taps a VMCC straight from the list. Each
/// VMCC is flagged "Received" when milk from it is already in for that exact
/// date + shift, so nothing gets entered twice.
class ManualReceiveScreen extends ConsumerStatefulWidget {
  const ManualReceiveScreen({super.key, required this.vmccs, required this.ccNodeId});
  final List<MpNode> vmccs;
  final String ccNodeId;

  @override
  ConsumerState<ManualReceiveScreen> createState() => _ManualReceiveScreenState();
}

class _ManualReceiveScreenState extends ConsumerState<ManualReceiveScreen> {
  DateTime _date = DateTime.now();
  Shift _shift = DateTime.now().hour < 12 ? Shift.am : Shift.pm;

  /// VMCC id → litres already received at this CC for the selected date + shift.
  /// A whole-day (BMC) consignment carries a null shift and counts for either.
  Map<String, List<MpConsignment>> _receivedFor(List<MpConsignment> inbound) {
    final m = <String, List<MpConsignment>>{};
    for (final c in inbound.where((c) =>
        c.kind == 'vmcc_to_cc' && c.received && (c.shift == null || c.shift == _shift))) {
      (m[c.fromNodeId] ??= []).add(c);
    }
    return m;
  }

  /// Tapping a VMCC opens entry for this date + shift, carrying whatever is
  /// already in for it. The entry screen prefills the types already received
  /// and takes a fresh one for any type still missing, so a VMCC that sent both
  /// cow and buffalo can be completed without a duplicate.
  Future<void> _openEntry(MpNode vmcc, {List<MpConsignment> existing = const []}) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => ManualReceiveEntryScreen(
        vmcc: vmcc, ccNodeId: widget.ccNodeId, date: _date, shift: _shift, existing: existing),
    ));
    if (saved == true) {
      ref.invalidate(nodeInboundByDateProvider((nodeId: widget.ccNodeId, date: isoDate(_date))));
    }
  }

  // Backfill only: today is the latest selectable date, no future entries.
  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final inboundAsync =
        ref.watch(nodeInboundByDateProvider((nodeId: widget.ccNodeId, date: isoDate(_date))));
    final received = _receivedFor(inboundAsync.asData?.value ?? const []);
    // Only VMCCs that collect in the selected shift can have milk to receive.
    final shiftVmccs = widget.vmccs.where((v) => v.collectsShift(_shift.name)).toList();
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(l.ccManualReceiveTitle)),
      body: SafeArea(
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(DhenuSpacing.screen),
          children: [
            Container(
              padding: const EdgeInsets.all(DhenuSpacing.md),
              decoration: BoxDecoration(
                color: t.brand.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(DhenuRadii.input),
              ),
              child: Row(children: [
                Icon(DhenuIcons.info, size: 18, color: t.brand),
                const SizedBox(width: DhenuSpacing.sm),
                Expanded(child: Text(
                  l.ccManualReceiveInfoBanner,
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                )),
              ]),
            ),
            const SizedBox(height: DhenuSpacing.lg),
            DhenuCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.ccManualReceiveReceivingFor, style: DhenuText.label.copyWith(color: t.brand)),
              const SizedBox(height: DhenuSpacing.md),
              _dateField(t, l),
              const SizedBox(height: DhenuSpacing.md),
              Row(children: [
                Text(l.ccManualReceiveShiftLabel, style: DhenuText.label.copyWith(color: t.inkSoft)),
                const Spacer(),
                ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s)),
              ]),
            ])),
            const SizedBox(height: DhenuSpacing.lg),
            Text(l.ccManualReceiveSelectVmcc, style: DhenuText.label.copyWith(color: t.inkSoft)),
            const SizedBox(height: DhenuSpacing.sm),
            if (shiftVmccs.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.lg),
                child: Text(
                    widget.vmccs.isEmpty
                        ? l.ccManualReceiveNoVmccsLinked
                        : l.ccManualReceiveNoVmccsShift(_shift == Shift.am ? l.shiftAm : l.shiftPm),
                    style: DhenuText.body.copyWith(color: t.inkSoft)),
              )
            else
              // Pending VMCCs first, already-received pushed to the bottom;
              // each group sorted alphabetically by name.
              for (final v in [
                ..._byName(shiftVmccs.where((v) => !received.containsKey(v.id))),
                ..._byName(shiftVmccs.where((v) => received.containsKey(v.id))),
              ]) ...[
                _vmccTile(t, l, v, received[v.id] ?? const []),
                const SizedBox(height: DhenuSpacing.sm),
              ],
          ],
        ),
      ),
    );
  }

  List<MpNode> _byName(Iterable<MpNode> vmccs) =>
      vmccs.toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  Widget _vmccTile(DhenuTokens t, AppLocalizations l, MpNode v, List<MpConsignment> receipts) {
    final done = receipts.isNotEmpty;
    final qty = receipts.fold<double>(0, (a, c) => a + (c.receiptQty ?? 0));
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => _openEntry(v, existing: receipts),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
              color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(DhenuIcons.store, size: 20, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(v.name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(v.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ])),
        if (done) _receivedBadge(t, l, qty)
        else Icon(DhenuIcons.chevronRight, color: t.inkSoft),
      ]),
    );
  }

  Widget _receivedBadge(DhenuTokens t, AppLocalizations l, double qty) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
        decoration: BoxDecoration(
          color: t.gradeA.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(DhenuIcons.check, size: 13, color: t.gradeA),
          const SizedBox(width: 3),
          Text(l.ccManualReceiveReceivedBadge(litres(qty)), style: DhenuText.caption.copyWith(color: t.gradeA)),
        ]),
      );

  Widget _dateField(DhenuTokens t, AppLocalizations l) => InkWell(
        onTap: _pickDate,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: InputDecorator(
          decoration: InputDecoration(labelText: l.ccManualReceiveCollectionDate),
          child: Row(children: [
            Expanded(child: Text(prettyDate(isoDate(_date)), style: DhenuText.body.copyWith(color: t.ink))),
            Icon(DhenuIcons.calendar, size: 18, color: t.inkSoft),
          ]),
        ),
      );
}
