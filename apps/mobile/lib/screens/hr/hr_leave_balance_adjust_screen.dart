// Admin/manager screen to override an employee's leave balance for a
// given (year, type). Wraps `PUT /hr/leave-balances` which upserts —
// only the opening/accrued fields are touched, used stays as recorded.
//
// Reachable from HR More → "Adjust leave balance" (admin only).

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_form.dart';

class HrLeaveBalanceAdjustScreen extends ConsumerStatefulWidget {
  const HrLeaveBalanceAdjustScreen({super.key});
  @override
  ConsumerState<HrLeaveBalanceAdjustScreen> createState() =>
      _HrLeaveBalanceAdjustScreenState();
}

class _HrLeaveBalanceAdjustScreenState
    extends ConsumerState<HrLeaveBalanceAdjustScreen> {
  HrEmployee? _employee;
  HrLeaveType? _type;
  int _year = DateTime.now().year;
  final _opening = TextEditingController();
  final _accrued = TextEditingController();
  bool _saving = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _opening.dispose();
    _accrued.dispose();
    super.dispose();
  }

  /// When the (employee, type, year) tuple is complete, pre-fill
  /// opening/accrued from the existing balance so the user edits the
  /// real values rather than starting blank.
  Future<void> _maybePrefill() async {
    if (_employee == null || _type == null || _prefilled) return;
    try {
      final balances =
          await hrRepo.leaveBalances(employeeId: _employee!.id, year: _year);
      final match = balances
          .where((b) => b.leaveTypeId == _type!.id)
          .cast<HrLeaveBalance?>()
          .firstWhere((_) => true, orElse: () => null);
      if (!mounted) return;
      if (match != null) {
        _opening.text = _fmt(match.opening);
        _accrued.text = _fmt(match.accrued);
      }
      setState(() => _prefilled = true);
    } catch (_) {
      // Best-effort prefill — silent on failure; user can still type in.
    }
  }

  String _fmt(double v) => v == v.toInt() ? v.toInt().toString() : v.toStringAsFixed(1);

  bool get _canSave {
    if (_employee == null || _type == null) return false;
    final o = double.tryParse(_opening.text.trim());
    final a = double.tryParse(_accrued.text.trim());
    // Server upserts — at least one of opening/accrued must be set.
    if (o == null && a == null) return false;
    if ((o != null && o < 0) || (a != null && a < 0)) return false;
    return true;
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    final o = double.tryParse(_opening.text.trim());
    final a = double.tryParse(_accrued.text.trim());
    try {
      await hrRepo.adjustLeaveBalance(
        employeeId: _employee!.id,
        leaveTypeId: _type!.id,
        year: _year,
        opening: o,
        accrued: a,
      );
      // Invalidate any cached balance views so the next read sees fresh
      // numbers — most importantly the self-view balances on Pay tab.
      ref.invalidate(hrMyLeaveBalancesProvider);
      if (mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Balance updated', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Update failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final employeesAsync =
        ref.watch(hrEmployeesProvider(const HrEmployeesQuery(status: 'active')));
    final typesAsync = ref.watch(hrLeaveTypesProvider);

    return HrFormScreen(
      title: 'Adjust leave balance',
      bottomAction: HrSubmitButton(
        label: 'Save balance',
        loading: _saving,
        enabled: _canSave,
        onPressed: _save,
      ),
      body: Column(
        children: [
          HrFormSection(children: [
            HrSelectField<HrEmployee>(
              label: 'Employee',
              value: _employee,
              options: employeesAsync.asData?.value.data ?? const [],
              display: (e) => '${e.displayName} · ${e.employeeCode}',
              searchable: true,
              onChanged: (e) {
                setState(() {
                  _employee = e;
                  _prefilled = false;
                });
                _maybePrefill();
              },
              required: true,
            ),
            HrSelectField<HrLeaveType>(
              label: 'Leave type',
              value: _type,
              options: typesAsync.asData?.value ?? const [],
              display: (lt) => '${lt.code} · ${lt.name}',
              onChanged: (lt) {
                setState(() {
                  _type = lt;
                  _prefilled = false;
                });
                _maybePrefill();
              },
              required: true,
            ),
            HrSelectField<int>(
              label: 'Year',
              value: _year,
              options: List.generate(5, (i) => DateTime.now().year - 2 + i),
              display: (y) => '$y',
              onChanged: (y) {
                setState(() {
                  _year = y ?? DateTime.now().year;
                  _prefilled = false;
                });
                _maybePrefill();
              },
              required: true,
            ),
          ]),
          const SizedBox(height: 12),
          HrFormSection(
            title: 'Override',
            children: [
              HrTextField(
                label: 'Opening',
                hint: 'Carried-forward from last year',
                controller: _opening,
                keyboard: const TextInputType.numberWithOptions(decimal: true),
                formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                textCapitalization: TextCapitalization.none,
                onChanged: (_) => setState(() {}),
              ),
              HrTextField(
                label: 'Accrued',
                hint: 'Total earned this year',
                controller: _accrued,
                keyboard: const TextInputType.numberWithOptions(decimal: true),
                formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                textCapitalization: TextCapitalization.none,
                onChanged: (_) => setState(() {}),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 0),
            child: Text(
              'Used days aren\'t edited here — adjust by approving/cancelling specific requests instead.',
              style: RunqText.caption.copyWith(color: t.muted2),
            ),
          ),
        ],
      ),
    );
  }
}
