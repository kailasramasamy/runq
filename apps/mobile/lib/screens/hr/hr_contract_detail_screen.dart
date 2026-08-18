// One labour contract: the running balance, the working-day calendar, the
// crew and their rates, the advances paid, and the settlement that closes
// it all out.
//
// The balance strip sits at the top because "what do I still owe him?" is
// the question this screen exists to answer. The calendar is next, since
// that is what moves the number.

library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/api_client.dart';
import '../../api/hr_contract_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_advance_sheet.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_contract_bits.dart';
import 'widgets/hr_contract_calendar.dart';
import 'widgets/hr_contract_form_sheet.dart';
import 'widgets/hr_contract_pause_card.dart';
import 'widgets/hr_crew_member_sheet.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_mark_contract_day_sheet.dart';
import 'widgets/hr_month_calendar.dart';
import 'widgets/hr_settle_sheet.dart';
import 'widgets/hr_settlement_payment_sheet.dart';
import 'widgets/hr_setup_widgets.dart';
import 'widgets/hr_widgets.dart';

class HrContractDetailScreen extends ConsumerStatefulWidget {
  final String id;
  const HrContractDetailScreen({super.key, required this.id});

  @override
  ConsumerState<HrContractDetailScreen> createState() =>
      _HrContractDetailScreenState();
}

class _HrContractDetailScreenState extends ConsumerState<HrContractDetailScreen> {
  DateTime? _month;

  /// Null = whole crew. Ignored for a single-member contract.
  String? _memberFilter;

  /// The statement is rendered by the server, so there is a wait worth showing.
  bool _sharing = false;

  void _refresh() {
    ref.invalidate(hrContractProvider(widget.id));
    ref.invalidate(hrContractsProvider);
    ref.invalidate(hrSettlementPreviewProvider);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(hrContractProvider(widget.id));
    final contract = async.asData?.value;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    contract?.name ?? 'Contract',
                    style: RunqText.h2.copyWith(color: t.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (contract != null)
                  IconButton(
                    onPressed: _sharing ? null : () => _shareStatement(contract),
                    icon: _sharing
                        ? SizedBox(
                            width: 18, height: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: t.muted),
                          )
                        : Icon(Icons.ios_share_rounded, color: t.muted),
                  ),
                if (contract?.isActive == true)
                  IconButton(
                    onPressed: () => _edit(contract!),
                    icon: Icon(Icons.edit_outlined, color: t.muted),
                  ),
              ],
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(color: HrColors.teal)),
                error: (e, _) => HrSetupError(error: e),
                data: _body,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(HrContract c) {
    final settlement = c.liveSettlement;
    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            color: HrColors.teal,
            onRefresh: () async => _refresh(),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics()),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                _summary(c),
                const SizedBox(height: RunqSpacing.sectionGap),
                if (c.balance != null)
                  HrBalanceStrip(
                    earned: c.balance!.earned,
                    advances: c.balance!.advancesPaid,
                    outstanding: c.balance!.netPayable,
                    throughDate: c.balance!.throughDate,
                    isOpenEnded: c.isOpenEnded,
                    // A lump sum is priced for the job, so days are not
                    // what it is made of.
                    daysWorked: c.isTask ? null : c.balance!.daysWorked,
                    isCrew: c.members.length > 1,
                    excludedNote: c.isTask ? '' : c.balance!.excludedNote,
                  ),
                // A task lump sum is priced for the job, not the days, so
                // stopping the work changes nothing there.
                if (!c.isTask) ...[
                  const SizedBox(height: RunqSpacing.sectionGap),
                  HrContractPauseCard(contract: c, onChanged: _refresh),
                ],
                if (c.hasCalendar) ...[
                  const SizedBox(height: RunqSpacing.sectionGap),
                  _calendarCard(c),
                ],
                if (!c.isTask) ...[
                  const SizedBox(height: RunqSpacing.sectionGap),
                  _crewSection(c),
                ],
                const SizedBox(height: RunqSpacing.sectionGap),
                _advancesSection(c),
                if (settlement != null) ...[
                  const SizedBox(height: RunqSpacing.sectionGap),
                  _settlementSection(c, settlement),
                ],
              ],
            ),
          ),
        ),
        _actions(c),
      ],
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  Widget _summary(HrContract c) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              HrContractTypeChip(type: c.contractType),
              const SizedBox(width: 8),
              Text(c.contractNumber,
                  style: RunqText.caption.copyWith(color: t.muted)),
              const Spacer(),
              HrContractStatusChip(status: c.status),
            ],
          ),
          const SizedBox(height: 12),
          _kv(t, 'Lead person',
              c.leadPersonPhone == null || c.leadPersonPhone!.isEmpty
                  ? c.leadPersonName
                  : '${c.leadPersonName} · ${c.leadPersonPhone}'),
          _kv(t, 'Term', hrContractTerm(c), sub: _daysWorkedNote(c)),
          _kv(
            t,
            c.isTask ? 'Agreed amount' : 'Rate',
            hrContractCompLabel(c),
          ),
          if ((c.notes ?? '').trim().isNotEmpty) _kv(t, 'Notes', c.notes!.trim()),
        ],
      ),
    );
  }

  /// Days actually worked, sitting under the term because that is the line
  /// it qualifies: the term says how long the job has run, this says how
  /// much of it was worked. What was taken out to get there lives on the
  /// balance strip below, where the money it drives is.
  ///
  /// Null on a task lump sum — priced for the job, not the days.
  String? _daysWorkedNote(HrContract c) {
    final b = c.balance;
    if (c.isTask || b == null) return null;
    final unit = c.members.length > 1 ? 'crew-days' : 'days';
    return '${hrFormatDays(b.daysWorked)} $unit worked';
  }

  Widget _kv(RunqTokens t, String k, String v, {String? sub}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 100,
              child: Text(k, style: RunqText.caption.copyWith(color: t.muted)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(v,
                      style: RunqText.body
                          .copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                  if (sub != null) ...[
                    const SizedBox(height: 2),
                    Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ],
              ),
            ),
          ],
        ),
      );

  // ── Calendar ────────────────────────────────────────────────────────────

  Widget _calendarCard(HrContract c) {
    final t = RT(context);
    final cal = ContractCalendar(c);
    final month = _month ?? DateTime(cal.lastAccrualDay.year, cal.lastAccrualDay.month);
    final startMonth = DateTime(c.startDate.year, c.startDate.month);
    final lastMonth = DateTime(cal.lastAccrualDay.year, cal.lastAccrualDay.month);
    final isCrew = c.members.length > 1;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          HrMonthStepper(
            month: month,
            onPrev: month.isAfter(startMonth)
                ? () => setState(() =>
                    _month = DateTime(month.year, month.month - 1))
                : null,
            onNext: month.isBefore(lastMonth)
                ? () => setState(() =>
                    _month = DateTime(month.year, month.month + 1))
                : null,
          ),
          if (isCrew) ...[
            const SizedBox(height: 4),
            _memberSelector(c),
          ],
          const SizedBox(height: 8),
          HrContractCalendar(
            calendar: cal,
            month: month,
            memberId: isCrew ? _memberFilter : c.members.firstOrNull?.id,
            onTapDay: (d) => _markDay(c, cal, d),
          ),
          const SizedBox(height: 12),
          HrContractCalendarLegend(showPaused: c.pauses.isNotEmpty),
        ],
      ),
    );
  }

  /// "Whole crew" first — the common action is marking a rain day for
  /// everyone, not chasing one person.
  Widget _memberSelector(HrContract c) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    Widget chip(String label, String? id) {
      final on = _memberFilter == id;
      return Padding(
        padding: const EdgeInsets.only(right: 6),
        child: GestureDetector(
          onTap: () => setState(() => _memberFilter = id),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
            decoration: BoxDecoration(
              color: on ? HrColors.tealSubtle : t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.chip),
              border: Border.all(
                color: on ? brand : t.hairline,
                width: on ? 1.5 : 0.5,
              ),
            ),
            child: Text(
              label,
              style: RunqText.caption.copyWith(
                color: on ? brand : t.ink,
                fontWeight: on ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      );
    }

    return SizedBox(
      height: 36,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          chip('Whole crew', null),
          for (final m in c.members) chip(m.name, m.id),
        ],
      ),
    );
  }

  Future<void> _markDay(HrContract c, ContractCalendar cal, DateTime day) async {
    if (!c.isActive) {
      showRunqSnack(context, 'This contract is ${c.status}', kind: SnackKind.info);
      return;
    }
    final isCrew = c.members.length > 1;
    final memberId = isCrew ? _memberFilter : c.members.firstOrNull?.id;
    final state = memberId == null
        ? cal.crewStateFor(day).state
        : cal.stateFor(day, memberId);
    final changed = await showHrMarkContractDaySheet(
      context,
      contract: c,
      day: day,
      lastAccrualDay: cal.lastAccrualDay,
      memberId: memberId,
      currentState: state,
    );
    if (changed == true) _refresh();
  }

  // ── Crew ────────────────────────────────────────────────────────────────

  Widget _crewSection(HrContract c) {
    final t = RT(context);
    // A solo contract is a crew of one under the hood; showing it as a
    // "crew" list would be noise, so it reads as the rate instead.
    final isSolo = c.contractType == 'solo_daily';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(isSolo ? 'Worker' : 'Crew',
                style: RunqText.label.copyWith(color: t.muted2)),
            const Spacer(),
            if (c.isActive && !isSolo)
              GestureDetector(
                onTap: () => _addMember(c),
                child: Text('Add person',
                    style: RunqText.caption.copyWith(
                      color: HrColors.brand(context),
                      fontWeight: FontWeight.w700,
                    )),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Column(
            children: [
              for (var i = 0; i < c.members.length; i++) ...[
                _MemberRow(
                  member: c.members[i],
                  editable: c.isActive,
                  onTap: () => _editMember(c, c.members[i]),
                ),
                if (i < c.members.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _addMember(HrContract c) async {
    final saved = await showHrCrewMemberSheet(context, contractId: c.id);
    if (saved == true) _refresh();
  }

  Future<void> _editMember(HrContract c, HrContractMember m) async {
    if (!c.isActive) return;
    final saved = await showHrCrewMemberSheet(
      context,
      contractId: c.id,
      existing: m,
      // The last person on a day-rate contract cannot be removed — the
      // contract would have nothing left to price.
      allowRemove: c.members.length > 1,
    );
    if (saved == true) _refresh();
  }

  // ── Advances ────────────────────────────────────────────────────────────

  Widget _advancesSection(HrContract c) {
    final t = RT(context);
    final rows = c.advances;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Advances', style: RunqText.label.copyWith(color: t.muted2)),
            const Spacer(),
            if ((c.balance?.advancesPaid ?? 0) > 0)
              Text('${hrFormatINR(c.balance!.advancesPaid)} to recover',
                  style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: Text('No advances paid yet.',
                style: RunqText.caption.copyWith(color: t.muted)),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  _AdvanceRow(
                    advance: rows[i],
                    memberName: _memberName(c, rows[i].memberId),
                    canCancel: c.isActive && rows[i].status == 'paid',
                    onCancelled: _refresh,
                  ),
                  if (i < rows.length - 1)
                    Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
                ],
              ],
            ),
          ),
      ],
    );
  }

  String? _memberName(HrContract c, String? memberId) {
    if (memberId == null) return null;
    for (final m in c.members) {
      if (m.id == memberId) return m.name;
    }
    return null;
  }

  // ── Settlement ──────────────────────────────────────────────────────────

  Widget _settlementSection(HrContract c, HrSettlement s) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Settlement', style: RunqText.label.copyWith(color: t.muted2)),
            const Spacer(),
            Text(s.settlementNumber,
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Column(
            children: [
              HrMoneyRow(label: 'Earned', amount: s.earned),
              if (s.advancesRecovered > 0)
                HrMoneyRow(
                    label: 'Advances recovered',
                    amount: s.advancesRecovered,
                    negative: true),
              if (s.otherDeductions > 0)
                HrMoneyRow(
                    label: 'Other deductions',
                    amount: s.otherDeductions,
                    negative: true),
              HrMoneyRow(label: 'Net payable', amount: s.netPayable),
              if (s.amountPaid > 0)
                HrMoneyRow(label: 'Paid', amount: s.amountPaid, negative: true),
              Divider(height: 12, thickness: 0.5, color: t.hairlineSoft),
              HrMoneyRow(
                label: s.amountDue > 0 ? 'Still to pay' : 'Fully disbursed',
                amount: s.amountDue,
                emphasis: true,
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    HrContractStatusChip(
                      status: s.isPartlyPaid ? 'part paid' : s.status,
                    ),
                    const Spacer(),
                    Text(
                      'Settled to ${hrContractDateFull(s.toDate)}',
                      style: RunqText.caption.copyWith(color: t.muted2),
                    ),
                  ],
                ),
              ),
              HrSettlementPaymentList(
                settlementId: s.id,
                amountPaid: s.amountPaid,
                canVoid: true,
                onChanged: _refresh,
              ),
              if (s.awaitsPayment)
                Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 10),
                  child: SizedBox(
                    width: double.infinity,
                    child: HrSubmitButton(
                      label: 'Record payment',
                      loading: false,
                      enabled: true,
                      onPressed: () => _recordPayment(c, s),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _recordPayment(HrContract c, HrSettlement s) async {
    final saved = await showHrSettlementPaymentSheet(context, c, s);
    if (saved == true) {
      ref.invalidate(hrSettlementPaymentsProvider(s.id));
      _refresh();
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  Widget _actions(HrContract c) {
    final t = RT(context);
    if (!c.isActive) return const SizedBox.shrink();
    // A settlement freezes the numbers — a later advance would never be
    // recovered by it, and the server refuses one.
    final settled = c.liveSettlement != null;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        // Paying an advance happens repeatedly through a contract's life;
        // settling happens once, at the end. The frequent action gets the
        // primary button, and the app's convention puts that on the right.
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: settled ? null : () => _settle(c),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  side: BorderSide(color: t.hairline, width: 0.5),
                  foregroundColor: t.ink,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(settled ? 'Settled' : 'Settle'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: HrSubmitButton(
                label: 'Pay advance',
                loading: false,
                enabled: !settled,
                onPressed: () => _advance(c),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Fetch the statement and hand it to the share sheet, which is how
  /// "download" works on both platforms — save to Files, mail it, or send it
  /// straight to the crew lead on WhatsApp.
  Future<void> _shareStatement(HrContract c) async {
    setState(() => _sharing = true);
    try {
      final bytes = await hrRepo.contractStatementPdf(c.id);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${c.contractNumber}-statement.pdf');
      await file.writeAsBytes(bytes);
      if (!mounted) return;
      // iPad throws without an anchor for the popover.
      final box = context.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf', name: file.path.split('/').last)],
        subject: '${c.name} — contract statement',
        sharePositionOrigin: origin,
      );
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, 'Could not build the statement: $e',
            kind: SnackKind.error);
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _edit(HrContract c) async {
    final saved = await showHrContractFormSheet(context, existing: c);
    if (saved == true) _refresh();
  }

  Future<void> _advance(HrContract c) async {
    final saved = await showHrAdvanceSheet(context, c);
    if (saved == true) _refresh();
  }

  Future<void> _settle(HrContract c) async {
    final saved = await showHrSettleSheet(context, c);
    if (saved == true) _refresh();
  }
}

class _MemberRow extends StatelessWidget {
  final HrContractMember member;
  final bool editable;
  final VoidCallback onTap;
  const _MemberRow({
    required this.member,
    required this.editable,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final gone = member.leftOn != null;
    return InkWell(
      onTap: editable ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(member.name,
                      style: RunqText.bodyStrong.copyWith(
                          color: gone ? t.muted : t.ink)),
                  if (member.role != null || gone) ...[
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (member.role != null) member.role!,
                        if (gone) 'left ${hrContractDate(member.leftOn!)}',
                      ].join(' · '),
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ],
              ),
            ),
            Text('${hrFormatINR(member.dailyRate)}/day',
                style: RunqText.body.copyWith(
                    color: gone ? t.muted2 : t.ink,
                    fontWeight: FontWeight.w600)),
            if (editable) ...[
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
            ],
          ],
        ),
      ),
    );
  }
}

class _AdvanceRow extends StatelessWidget {
  final HrAdvance advance;
  final String? memberName;
  final bool canCancel;
  final VoidCallback onCancelled;
  const _AdvanceRow({
    required this.advance,
    required this.memberName,
    required this.canCancel,
    required this.onCancelled,
  });

  static String _method(String s) => switch (s) {
        'cash' => 'Cash',
        'bank_transfer' => 'Bank transfer',
        'upi' => 'UPI',
        'cheque' => 'Cheque',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 11, 8, 11),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(hrFormatINR(advance.amount),
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    if (memberName != null) ...[
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text('→ $memberName',
                            style: RunqText.caption.copyWith(color: t.muted),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${hrContractDateFull(advance.paidOn)} · '
                  '${_method(advance.paymentMethod)}',
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          HrContractStatusChip(status: advance.status),
          if (canCancel)
            IconButton(
              visualDensity: VisualDensity.compact,
              onPressed: () => _confirmCancel(context),
              icon: Icon(Icons.close_rounded, size: 16, color: t.muted2),
            )
          else
            const SizedBox(width: 8),
        ],
      ),
    );
  }

  Future<void> _confirmCancel(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reverse this advance?'),
        content: Text(
          '${hrFormatINR(advance.amount)} paid on '
          '${hrContractDateFull(advance.paidOn)} will be reversed, and the '
          'money shown as returned.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Reverse'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await hrRepo.cancelAdvance(advance.id);
      onCancelled();
      if (context.mounted) {
        showRunqSnack(context, 'Advance reversed', kind: SnackKind.success);
      }
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}
