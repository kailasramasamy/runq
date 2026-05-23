// Initiate-reward bottom sheet. Extracted from hr_rewards_screen.dart to
// keep both files under 500 lines. Rendered as a modal sheet from the FAB.
//
// Form fields:
//   - Employee picker  (team members, manager-only)
//   - Reward type      (active reward types)
//   - Amount           (hidden when recognition kind selected)
//   - Title            (free text)
//   - Citation         (optional, free text)
//   - Award date       (date picker, defaults to today)

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';

class InitiateRewardResult {
  final String employeeId;
  final String employeeName;
  final String rewardTypeId;
  final double amount;
  final String title;
  final String? citation;
  final DateTime awardDate;
  const InitiateRewardResult({
    required this.employeeId,
    required this.employeeName,
    required this.rewardTypeId,
    required this.amount,
    required this.title,
    this.citation,
    required this.awardDate,
  });
}

Future<InitiateRewardResult?> showInitiateRewardSheet(
  BuildContext context, {
  required List<HrEmployee> teamMembers,
  required List<HrRewardType> rewardTypes,
}) {
  return showModalBottomSheet<InitiateRewardResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _InitiateRewardSheet(
      teamMembers: teamMembers,
      rewardTypes: rewardTypes,
    ),
  );
}

class _InitiateRewardSheet extends StatefulWidget {
  final List<HrEmployee> teamMembers;
  final List<HrRewardType> rewardTypes;
  const _InitiateRewardSheet({
    required this.teamMembers,
    required this.rewardTypes,
  });

  @override
  State<_InitiateRewardSheet> createState() => _InitiateRewardSheetState();
}

class _InitiateRewardSheetState extends State<_InitiateRewardSheet> {
  String? _employeeId, _rewardTypeId;
  final _titleCtrl = TextEditingController();
  final _citationCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  DateTime _awardDate = DateTime.now();
  bool _generatingCitation = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _citationCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  HrRewardType? get _selectedType =>
      _rewardTypeId == null
          ? null
          : widget.rewardTypes.where((t) => t.id == _rewardTypeId).firstOrNull;

  bool get _isRecognition => _selectedType?.kind == 'recognition';
  bool get _isPoints => _selectedType?.kind == 'points';

  bool get _canSubmit {
    if (_employeeId == null || _rewardTypeId == null) return false;
    if (_titleCtrl.text.trim().isEmpty) return false;
    if (!_isRecognition) {
      if (_isPoints) {
        final v = int.tryParse(_amountCtrl.text.trim());
        if (v == null || v <= 0) return false;
      } else {
        final v = double.tryParse(_amountCtrl.text.trim());
        if (v == null || v <= 0) return false;
      }
    }
    return true;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _awardDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 90)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) setState(() => _awardDate = picked);
  }

  /// Ask the server's AI to draft a citation from the title (and, when
  /// chosen, the employee + reward type) and drop it into the field.
  Future<void> _generateCitation() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty || _generatingCitation) return;
    setState(() => _generatingCitation = true);
    try {
      final emp = _employeeId == null
          ? null
          : widget.teamMembers.where((e) => e.id == _employeeId).firstOrNull;
      final citation = await hrRepo.suggestRewardCitation(
        title: title,
        employeeName: emp?.displayName,
        typeName: _selectedType?.name,
      );
      if (!mounted) return;
      setState(() => _citationCtrl.text = citation);
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException ? e.message : "Couldn't generate a citation";
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _generatingCitation = false);
    }
  }

  void _submit() {
    if (!_canSubmit) return;
    final emp = widget.teamMembers.firstWhere((e) => e.id == _employeeId);
    final double amount;
    if (_isRecognition) {
      amount = 0.0;
    } else if (_isPoints) {
      amount = (int.tryParse(_amountCtrl.text.trim()) ?? 0).toDouble();
    } else {
      amount = double.tryParse(_amountCtrl.text.trim()) ?? 0;
    }
    Navigator.of(context).pop(InitiateRewardResult(
      employeeId: _employeeId!,
      employeeName: emp.displayName,
      rewardTypeId: _rewardTypeId!,
      amount: amount,
      title: _titleCtrl.text.trim(),
      citation: _citationCtrl.text.trim().isEmpty ? null : _citationCtrl.text.trim(),
      awardDate: _awardDate,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + inset),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('Initiate reward', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 16),
            _label(t, 'Employee'),
            const SizedBox(height: 6),
            _PickerField(
              placeholder: 'Select employee',
              value: _employeeId == null
                  ? null
                  : widget.teamMembers
                      .firstWhere((e) => e.id == _employeeId)
                      .displayName,
              onTap: () => _showEmployeePicker(context, t),
            ),
            const SizedBox(height: 12),
            _label(t, 'Reward type'),
            const SizedBox(height: 6),
            if (widget.rewardTypes.isEmpty)
              Text(
                'No reward types configured. Set them up on the web app.',
                style: RunqText.caption.copyWith(color: t.muted),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: widget.rewardTypes.map((rt) {
                  final active = rt.id == _rewardTypeId;
                  return GestureDetector(
                    onTap: () => setState(() {
                      final prev = _selectedType;
                      _rewardTypeId = rt.id;
                      // Clear the amount field when switching between
                      // recognition (hidden), monetary, and points — different
                      // validation and format constraints apply to each.
                      if (rt.kind == 'recognition' ||
                          prev?.kind == 'recognition' ||
                          prev?.kind != rt.kind) {
                        _amountCtrl.clear();
                      }
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: active
                            ? HrColors.teal.withValues(alpha: 0.12)
                            : t.surface,
                        border: Border.all(
                          color: active ? HrColors.teal : t.hairline,
                          width: active ? 1.5 : 0.5,
                        ),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            rt.name,
                            style: RunqText.bodyStrong.copyWith(
                              color: active ? HrColors.teal : t.ink,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: rt.isMonetary
                                  ? (active
                                      ? HrColors.teal.withValues(alpha: 0.15)
                                      : t.bgWarmer)
                                  : (active
                                      ? HrColors.teal.withValues(alpha: 0.15)
                                      : t.bgWarmer),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              rt.isPoints ? 'pts' : rt.isMonetary ? '₹' : '★',
                              style: RunqText.micro.copyWith(
                                color: active ? HrColors.teal : t.muted,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            if (_selectedType != null && !_isRecognition) ...[
              const SizedBox(height: 12),
              _label(t, _isPoints ? 'Points' : 'Amount (₹)'),
              const SizedBox(height: 6),
              TextField(
                controller: _amountCtrl,
                keyboardType: _isPoints
                    ? TextInputType.number
                    : const TextInputType.numberWithOptions(decimal: true),
                textCapitalization: TextCapitalization.none,
                inputFormatters: _isPoints
                    ? [FilteringTextInputFormatter.digitsOnly]
                    : [
                        FilteringTextInputFormatter.allow(
                            RegExp(r'^\d+\.?\d{0,2}')),
                      ],
                onChanged: (_) => setState(() {}),
                decoration:
                    _inputDecoration(t, _isPoints ? '100' : 'e.g. 5000'),
              ),
            ],
            const SizedBox(height: 12),
            _label(t, 'Title'),
            const SizedBox(height: 6),
            TextField(
              controller: _titleCtrl,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
              decoration: _inputDecoration(t, 'e.g. Outstanding performance in Q1'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _label(t, 'Citation (optional)')),
                _buildGenerateButton(t),
              ],
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _citationCtrl,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 3,
              decoration: _inputDecoration(t, 'Briefly describe the achievement, or generate one…'),
            ),
            const SizedBox(height: 12),
            _label(t, 'Award date'),
            const SizedBox(height: 6),
            GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                decoration: BoxDecoration(
                  color: t.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: t.hairline, width: 0.5),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today_outlined, size: 16, color: t.muted),
                    const SizedBox(width: 8),
                    Text(
                      _fmtDate(_awardDate),
                      style: RunqText.body.copyWith(color: t.ink),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _canSubmit ? _submit : null,
              style: FilledButton.styleFrom(
                backgroundColor: HrColors.teal,
                disabledBackgroundColor: t.hairlineSoft,
                disabledForegroundColor: t.muted2,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Submit reward'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showEmployeePicker(BuildContext ctx, RunqTokens t) async {
    await showModalBottomSheet<void>(
      context: ctx,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _EmployeePickerSheet(
        employees: widget.teamMembers,
        selectedId: _employeeId,
        onSelect: (id) {
          setState(() => _employeeId = id);
          Navigator.of(ctx).pop();
        },
      ),
    );
  }

  Widget _label(RunqTokens t, String text) =>
      Text(text, style: RunqText.caption.copyWith(color: t.muted));

  /// "Generate from title" affordance shown beside the citation label.
  /// Disabled until a title is entered; spins while the request is in flight.
  Widget _buildGenerateButton(RunqTokens t) {
    final canGenerate = _titleCtrl.text.trim().isNotEmpty && !_generatingCitation;
    final color = canGenerate ? HrColors.teal : t.muted2;
    return GestureDetector(
      onTap: canGenerate ? _generateCitation : null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_generatingCitation)
            const SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(strokeWidth: 2, color: HrColors.teal),
            )
          else
            Icon(Icons.auto_awesome, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            _generatingCitation ? 'Generating…' : 'Generate from title',
            style: RunqText.caption.copyWith(color: color),
          ),
        ],
      ),
    );
  }

  InputDecoration _inputDecoration(RunqTokens t, String hint) => InputDecoration(
        hintText: hint,
        hintStyle: RunqText.body.copyWith(color: t.muted),
        isDense: true,
        filled: true,
        fillColor: t.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: t.hairline, width: 0.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: t.hairline, width: 0.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: HrColors.teal, width: 1.5),
        ),
      );

  static String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day.toString().padLeft(2, '0')} ${m[d.month - 1]} ${d.year}';
  }
}

class _PickerField extends StatelessWidget {
  final String placeholder;
  final String? value;
  final VoidCallback onTap;
  const _PickerField({
    required this.placeholder,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                value ?? placeholder,
                style: RunqText.body.copyWith(
                  color: value == null ? t.muted : t.ink,
                ),
              ),
            ),
            Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: t.muted),
          ],
        ),
      ),
    );
  }
}

class _EmployeePickerSheet extends StatefulWidget {
  final List<HrEmployee> employees;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  const _EmployeePickerSheet({
    required this.employees,
    required this.selectedId,
    required this.onSelect,
  });

  @override
  State<_EmployeePickerSheet> createState() => _EmployeePickerSheetState();
}

class _EmployeePickerSheetState extends State<_EmployeePickerSheet> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final filtered = _search.isEmpty
        ? widget.employees
        : widget.employees
            .where((e) =>
                e.displayName.toLowerCase().contains(_search.toLowerCase()) ||
                e.employeeCode.toLowerCase().contains(_search.toLowerCase()))
            .toList();

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Select employee', style: RunqText.h3.copyWith(color: t.ink)),
                const SizedBox(height: 10),
                TextField(
                  autofocus: true,
                  textCapitalization: TextCapitalization.none,
                  onChanged: (v) => setState(() => _search = v),
                  decoration: InputDecoration(
                    hintText: 'Search…',
                    prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
                    isDense: true,
                    filled: true,
                    fillColor: t.surface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: t.hairline, width: 0.5),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: t.hairline, width: 0.5),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              itemCount: filtered.length,
              separatorBuilder: (_, __) => Divider(height: 1, color: t.hairlineSoft),
              itemBuilder: (_, i) {
                final emp = filtered[i];
                final sel = emp.id == widget.selectedId;
                return InkWell(
                  onTap: () => widget.onSelect(emp.id),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(emp.displayName,
                                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
                              Text(emp.employeeCode,
                                  style: RunqText.caption.copyWith(color: t.muted)),
                            ],
                          ),
                        ),
                        if (sel)
                          Icon(Icons.check_circle_rounded,
                              size: 18, color: HrColors.teal),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
