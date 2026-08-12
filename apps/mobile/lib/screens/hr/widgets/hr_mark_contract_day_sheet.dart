// Mark a day (or a run of days) on a contract calendar.
//
// Opens from a tapped cell. Defaults to that single day and to "Leave",
// because the only reason to open this sheet is to record a deviation —
// the day was already counting as worked.
//
// The range control extends forward from the tapped day, which is how a
// three-day absence gets recorded in one action instead of three taps.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_contract_models.dart';
import '../../../api/hr_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';
import 'hr_contract_calendar.dart';
import 'hr_date_range_field.dart';
import 'hr_setup_widgets.dart';

Future<bool?> showHrMarkContractDaySheet(
  BuildContext context, {
  required HrContract contract,
  required DateTime day,
  required DateTime lastAccrualDay,
  /// Null = whole crew.
  required String? memberId,
  required ContractDayState currentState,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _MarkDaySheet(
      contract: contract,
      day: day,
      lastAccrualDay: lastAccrualDay,
      memberId: memberId,
      currentState: currentState,
    ),
  );
}

class _MarkDaySheet extends ConsumerStatefulWidget {
  final HrContract contract;
  final DateTime day, lastAccrualDay;
  final String? memberId;
  final ContractDayState currentState;

  const _MarkDaySheet({
    required this.contract,
    required this.day,
    required this.lastAccrualDay,
    required this.memberId,
    required this.currentState,
  });

  @override
  ConsumerState<_MarkDaySheet> createState() => _MarkDaySheetState();
}

class _MarkDaySheetState extends ConsumerState<_MarkDaySheet> {
  late DateTime _toDate;
  late String _status;
  late Set<String> _targets;
  bool _saving = false;

  static const _statuses = ['worked', 'leave', 'half_day'];

  @override
  void initState() {
    super.initState();
    _toDate = widget.day;
    // Opening on an already-marked day offers to clear it; otherwise the
    // reason you're here is to record an absence.
    _status = widget.currentState == ContractDayState.worked ? 'leave' : 'worked';
    _targets = widget.memberId != null
        ? {widget.memberId!}
        : widget.contract.members.map((m) => m.id).toSet();
  }

  bool get _isCrew => widget.contract.members.length > 1;

  int get _dayCount =>
      DateTime(_toDate.year, _toDate.month, _toDate.day)
          .difference(DateTime(widget.day.year, widget.day.month, widget.day.day))
          .inDays +
      1;

  bool get _canSave => _targets.isNotEmpty && !_saving;

  static String _statusLabel(String s) => switch (s) {
        'worked' => 'Worked',
        'leave' => 'Leave',
        'half_day' => 'Half day',
        _ => s,
      };

  static ContractDayState _stateOf(String s) => switch (s) {
        'leave' => ContractDayState.leave,
        'half_day' => ContractDayState.halfDay,
        _ => ContractDayState.worked,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return HrEditorSheet(
      title: hrLongDate(widget.day),
      saveLabel: _saveLabel(),
      saving: _saving,
      canSave: _canSave,
      onSave: _save,
      children: [
        Text('Mark as', style: RunqText.label.copyWith(color: t.muted2)),
        const SizedBox(height: 8),
        _statusChips(t),
        const SizedBox(height: 16),
        HrDateRangeField(
          from: widget.day,
          to: _toDate,
          onPickEnd: _pickEnd,
          onReset: () => setState(() => _toDate = widget.day),
        ),
        if (_isCrew) ...[
          const SizedBox(height: 16),
          _crewPicker(t),
        ],
        const SizedBox(height: 12),
        _note(t),
      ],
    );
  }

  String _saveLabel() {
    final days = _dayCount;
    final span = days > 1 ? ' $days days' : '';
    if (_status == 'worked') return 'Mark worked$span';
    return 'Mark ${_statusLabel(_status).toLowerCase()}$span';
  }

  Widget _statusChips(RunqTokens t) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _statuses.map((s) {
        final on = _status == s;
        final pair = contractDayColors(context, _stateOf(s));
        return GestureDetector(
          onTap: () => setState(() => _status = s),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              color: on ? pair[0] : t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.chip),
              border: Border.all(
                color: on ? pair[1] : t.hairline,
                width: on ? 1.5 : 0.5,
              ),
            ),
            child: Text(
              _statusLabel(s),
              style: RunqText.caption.copyWith(
                color: on ? pair[1] : t.ink,
                fontWeight: on ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _crewPicker(RunqTokens t) {
    final all = widget.contract.members;
    final everyone = _targets.length == all.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Who', style: RunqText.label.copyWith(color: t.muted2)),
            const Spacer(),
            GestureDetector(
              onTap: () => setState(() {
                _targets = everyone ? <String>{} : all.map((m) => m.id).toSet();
              }),
              child: Text(
                everyone ? 'Clear' : 'Whole crew',
                style: RunqText.caption.copyWith(
                  color: HrColors.brand(context),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: all.map((m) {
            final on = _targets.contains(m.id);
            return GestureDetector(
              onTap: () => setState(() {
                if (on) {
                  _targets.remove(m.id);
                } else {
                  _targets.add(m.id);
                }
              }),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: on ? HrColors.tealSubtle : t.surface,
                  borderRadius: BorderRadius.circular(RunqRadii.chip),
                  border: Border.all(
                    color: on ? HrColors.brand(context) : t.hairline,
                    width: on ? 1.5 : 0.5,
                  ),
                ),
                child: Text(
                  m.role == null ? m.name : '${m.name} · ${m.role}',
                  style: RunqText.caption.copyWith(
                    color: on ? HrColors.brand(context) : t.ink,
                    fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _note(RunqTokens t) {
    final msg = _status == 'worked'
        ? 'Clears any leave already marked on these days.'
        : 'Only the days you mark are deducted — everything else keeps counting.';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 14, color: t.muted2),
        const SizedBox(width: 6),
        Expanded(child: Text(msg, style: RunqText.caption.copyWith(color: t.muted2))),
      ],
    );
  }

  /// The end of the range cannot run past the contract's accrual edge —
  /// marking someone absent from a day the contract never covered would
  /// silently do nothing on the server.
  Future<void> _pickEnd() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _toDate,
      firstDate: widget.day,
      lastDate: widget.lastAccrualDay,
      helpText: 'Mark through',
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) setState(() => _toDate = picked);
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    try {
      await hrRepo.markContractDays(
        widget.contract.id,
        fromDate: widget.day,
        toDate: _toDate,
        status: _status,
        // Sending every id explicitly, rather than relying on the server's
        // "all members" default, keeps a partial crew selection honest.
        memberIds: _targets.toList(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}
