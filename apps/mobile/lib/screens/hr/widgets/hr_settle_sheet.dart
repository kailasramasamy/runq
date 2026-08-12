// Settle a contract — what is owed, and to whom.
//
// A crew is settled person by person, so the sheet leads with the
// per-member breakdown rather than a single total: the mason and the helper
// are handed different amounts, and an advance one of them took must not
// quietly reduce the other's pay.
//
// Figures come from the server's preview, recomputed from the day log on
// every open. The sheet never does the arithmetic itself — showing a
// locally-derived number that disagrees with what gets posted would be
// worse than showing nothing.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_contract_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';
import 'hr_contract_bits.dart';
import 'hr_form.dart';
import 'hr_setup_widgets.dart';
import 'hr_widgets.dart';

Future<bool?> showHrSettleSheet(BuildContext context, HrContract contract) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _SettleSheet(contract: contract),
  );
}

class _SettleSheet extends ConsumerStatefulWidget {
  final HrContract contract;
  const _SettleSheet({required this.contract});

  @override
  ConsumerState<_SettleSheet> createState() => _SettleSheetState();
}

class _SettleSheetState extends ConsumerState<_SettleSheet> {
  final _deductions = TextEditingController();
  final _notes = TextEditingController();
  DateTime? _throughDate;
  bool _saving = false;

  @override
  void dispose() {
    _deductions.dispose();
    _notes.dispose();
    super.dispose();
  }

  double get _deductionValue {
    final v = double.tryParse(_deductions.text.trim());
    return (v == null || v < 0) ? 0 : v;
  }

  HrSettlementQuery get _query =>
      HrSettlementQuery(widget.contract.id, throughDate: _throughDate);

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(hrSettlementPreviewProvider(_query));
    return async.when(
      loading: () => const _SheetShell(
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 60),
            child: CircularProgressIndicator(color: HrColors.teal),
          ),
        ),
      ),
      error: (e, _) => _SheetShell(child: HrSetupError(error: e)),
      data: _body,
    );
  }

  Widget _body(HrSettlementPreview p) {
    // Local net so the figure tracks the deduction field as it is typed;
    // the server recomputes it identically on submit.
    final net = p.netPayable - _deductionValue;
    final blocked = p.isEmpty || net < 0;

    return HrEditorSheet(
      title: 'Settle contract',
      saveLabel: blocked ? 'Cannot settle' : 'Settle ${hrFormatINR(net)}',
      saving: _saving,
      canSave: !blocked && !_saving,
      onSave: () => _settle(p),
      children: [
        for (final w in p.warnings)
          HrContractWarning(text: w, severe: w.contains('exceed earnings')),
        if (net < 0 && !p.isNegative)
          const HrContractWarning(
            text: 'The deduction you entered pushes this below zero.',
            severe: true,
          ),
        _throughRow(p),
        const SizedBox(height: 12),
        if (p.lines.length > 1) ...[
          _memberBreakdown(p),
          const SizedBox(height: 12),
        ],
        _totals(p),
        const SizedBox(height: 12),
        HrFormSection(
          title: 'Adjustments',
          children: [
            HrTextField(
              label: 'Other deductions (₹)',
              hint: 'Damages, tools — optional',
              controller: _deductions,
              keyboard: const TextInputType.numberWithOptions(decimal: true),
              formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              textCapitalization: TextCapitalization.none,
              onChanged: (_) => setState(() {}),
            ),
            HrTextField(
              label: 'Notes',
              controller: _notes,
              maxLines: 2,
              hint: 'Optional',
            ),
          ],
        ),
        const SizedBox(height: 10),
        _postingNote(),
      ],
    );
  }

  /// Settling an open-ended contract has to pick a closing date, so it is
  /// shown and editable rather than silently defaulted to today.
  Widget _throughRow(HrSettlementPreview p) {
    final t = RT(context);
    return HrFormSection(
      children: [
        HrDateField(
          label: p.isOpenEnded ? 'Close the contract on' : 'Settle up to',
          value: _throughDate ?? p.throughDate,
          required: true,
          onChanged: (d) => setState(() => _throughDate = d),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          child: Text(
            'Days are counted from ${hrContractDateFull(p.fromDate)}.',
            style: RunqText.caption.copyWith(color: t.muted2),
          ),
        ),
      ],
    );
  }

  Widget _memberBreakdown(HrSettlementPreview p) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text('Who gets what',
              style: RunqText.label.copyWith(color: t.muted2)),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Column(
            children: [
              for (var i = 0; i < p.lines.length; i++) ...[
                _MemberLine(line: p.lines[i]),
                if (i < p.lines.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _totals(HrSettlementPreview p) {
    final t = RT(context);
    final net = p.netPayable - _deductionValue;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: HrColors.tealSubtle,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          HrMoneyRow(label: 'Total earned', amount: p.earned),
          if (p.advancesRecovered > 0)
            HrMoneyRow(
              label: 'Advances recovered',
              amount: p.advancesRecovered,
              negative: true,
            ),
          if (_deductionValue > 0)
            HrMoneyRow(
                label: 'Other deductions', amount: _deductionValue, negative: true),
          Divider(height: 12, thickness: 0.5, color: t.hairlineSoft),
          HrMoneyRow(
            label: 'Net payable',
            amount: net < 0 ? 0 : net,
            emphasis: true,
          ),
        ],
      ),
    );
  }

  Widget _postingNote() {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 14, color: t.muted2),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            'Settling books the wage to expenses, clears the advances and '
            'closes the contract. Record the payout separately once the '
            'money leaves.',
            style: RunqText.caption.copyWith(color: t.muted2),
          ),
        ),
      ],
    );
  }

  /// Draft then approve in one tap — pressing "Settle" means the posted
  /// entry, not a saved form somebody has to come back to.
  Future<void> _settle(HrSettlementPreview p) async {
    setState(() => _saving = true);
    try {
      final draft = await hrRepo.createSettlement(
        widget.contract.id,
        throughDate: _throughDate ?? p.throughDate,
        otherDeductions: _deductionValue,
        notes: _notes.text.trim(),
      );
      await hrRepo.approveSettlement(draft.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(context, 'Contract settled', kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}

class _MemberLine extends StatelessWidget {
  final HrSettlementLine line;
  const _MemberLine({required this.line});

  static String _days(double d) =>
      d == d.roundToDouble() ? d.round().toString() : d.toString();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    final sub = line.dailyRate == null
        ? 'Agreed amount'
        : '${_days(line.daysWorked)}d × ${hrFormatINR(line.dailyRate!)}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.memberRole == null
                      ? line.memberName
                      : '${line.memberName} · ${line.memberRole}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  line.advancesRecovered > 0
                      ? '$sub · advance ${hrFormatINR(line.advancesRecovered)}'
                      : sub,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            hrFormatINR(line.netPayable),
            style: RunqText.bodyStrong.copyWith(
              // A negative line is someone who drew more than they earned —
              // that is a recovery, not a payout, and must not read as one.
              color: line.netPayable < 0 ? const Color(0xFFDC2626) : brand,
            ),
          ),
        ],
      ),
    );
  }
}

/// Bare shell for the loading and error states, which have no form to hang
/// off [HrEditorSheet]'s submit button.
class _SheetShell extends StatelessWidget {
  final Widget child;
  const _SheetShell({required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.5,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      child: child,
    );
  }
}
