// Pausing and resuming a labour contract.
//
// Days accrue by themselves from the start date, so a stretch where nobody
// turned up — rain, a stalled site, a festival — has to be taken out or the
// crew is paid for it. The alternative this replaces is marking every one of
// those days as leave, for every person on the contract.
//
// A pause with no end date is the common case: nobody knows when the rain
// stops. Resuming closes it the day before the first day back.

library;

import 'package:flutter/material.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_contract_models.dart';
import '../../../api/hr_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_contract_bits.dart';
import 'hr_form.dart';
import 'hr_setup_widgets.dart';

class HrContractPauseCard extends StatelessWidget {
  final HrContract contract;
  final VoidCallback onChanged;
  const HrContractPauseCard({
    super.key,
    required this.contract,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final s = contract.pauseState;
    final paused = contract.isPausedNow;
    final canChange = contract.canChangePauses;
    // A pause with an end date is still "paused" today — work restarts the
    // morning after it. The card has to say so, or resuming looks like it
    // silently failed because the banner is still up.
    final resumesOn = paused && s.until != null
        ? s.until!.add(const Duration(days: 1))
        : null;
    // A closed contract accrues nothing, so "Work running" would be a lie.
    // With no pauses to look back on there is nothing left to say either.
    final closed = !contract.isActive;
    if (closed && contract.pauses.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: paused ? const Color(0x1AF59E0B) : t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(
          color: paused ? const Color(0x66F59E0B) : t.hairline,
          width: 0.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                closed
                    ? Icons.check_circle_outline
                    : paused
                        ? Icons.pause_circle_outline
                        : Icons.play_circle_outline,
                size: 18,
                color: paused ? const Color(0xFFB45309) : t.muted2,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      closed
                          ? _closedTitle(contract.status)
                          : resumesOn != null
                              ? 'Paused · back on ${hrContractDate(resumesOn)}'
                              : paused
                                  ? 'Work paused'
                                  : s.isScheduled
                                      ? 'Pause booked'
                                      : 'Work running',
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                    ),
                    const SizedBox(height: 2),
                    Text(closed ? _closedNote(contract) : _describe(s),
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
            ],
          ),
          if (canChange) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => paused
                    ? _resume(context, resumesOn)
                    : _pause(context),
                icon: Icon(
                  paused ? Icons.play_arrow_rounded : Icons.pause_rounded,
                  size: 16,
                ),
                // Once a return date is booked the button changes rather
                // than vanishing: the date may still need moving, and
                // "Resume work" would read as though nothing had happened.
                label: Text(paused
                    ? (resumesOn != null ? 'Change resume date' : 'Resume work')
                    : 'Pause work'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  side: BorderSide(color: t.hairline, width: 0.5),
                  foregroundColor: t.ink,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
          if (contract.pauses.isNotEmpty) ...[
            const SizedBox(height: 10),
            Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
            const SizedBox(height: 8),
            for (final p in contract.pauses)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  '${hrContractDate(p.fromDate)} → '
                  '${p.toDate == null ? 'not resumed' : hrContractDate(p.toDate!)}'
                  '${(p.reason ?? '').isEmpty ? '' : ' · ${p.reason}'}',
                  style: RunqText.caption.copyWith(color: t.muted2),
                ),
              ),
          ],
        ],
      ),
    );
  }

  static String _closedTitle(String status) =>
      status == 'cancelled' ? 'Contract cancelled' : 'Work complete';

  /// On a closed contract the card is a record of the pauses, not a control.
  static String _closedNote(HrContract c) {
    final n = c.pauses.length;
    return '$n paused ${n == 1 ? 'stretch' : 'stretches'} on this contract. '
        'Nothing accrues any more.';
  }

  static String _describe(HrPauseState s) {
    if (s.state == 'paused') {
      final since = s.since == null ? '' : hrContractDate(s.since!);
      // The heading already carries the return date, so this says what the
      // pause costs rather than repeating it.
      return s.until == null
          ? 'Nothing accrues since $since, with no date to resume yet.'
          : 'Nothing accrues from $since to ${hrContractDate(s.until!)}.';
    }
    if (s.state == 'pause_scheduled' && s.since != null) {
      return 'Paused from ${hrContractDate(s.since!)}'
          '${s.until == null ? ', until further notice' : ' to ${hrContractDate(s.until!)}'}.';
    }
    return 'Every day counts as worked unless marked otherwise.';
  }

  Future<void> _pause(BuildContext context) async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PauseSheet(contract: contract),
    );
    if (done == true) onChanged();
  }

  Future<void> _resume(BuildContext context, DateTime? scheduled) async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ResumeSheet(contract: contract, scheduled: scheduled),
    );
    if (done == true) onChanged();
  }
}

class _PauseSheet extends StatefulWidget {
  final HrContract contract;
  const _PauseSheet({required this.contract});

  @override
  State<_PauseSheet> createState() => _PauseSheetState();
}

class _PauseSheetState extends State<_PauseSheet> {
  final _reason = TextEditingController();
  late DateTime _from;
  DateTime? _to;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _from = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return HrEditorSheet(
      title: 'Pause work',
      saveLabel: 'Pause',
      saving: _saving,
      canSave: !_saving,
      onSave: _save,
      children: [
        HrFormSection(
          children: [
            HrDateField(
              label: 'Pause from',
              value: _from,
              required: true,
              onChanged: (d) => setState(() => _from = d ?? _from),
            ),
            HrDateField(
              label: 'Until',
              value: _to,
              onChanged: (d) => setState(() => _to = d),
            ),
            HrTextField(
              label: 'Reason',
              controller: _reason,
              hint: 'Rain, site stalled, festival…',
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, size: 14, color: t.muted2),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Nothing is earned between these dates. Leave the end date empty '
                'if you do not know when work restarts — resume it later and the '
                'pause closes the day before.',
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await hrRepo.pauseContract(
        widget.contract.id,
        fromDate: _from,
        toDate: _to,
        reason: _reason.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(context, 'Work paused', kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}

class _ResumeSheet extends StatefulWidget {
  final HrContract contract;

  /// The return date already booked, if any — the sheet opens on it so
  /// "change the date" starts from what is set rather than from today.
  final DateTime? scheduled;
  const _ResumeSheet({required this.contract, this.scheduled});

  @override
  State<_ResumeSheet> createState() => _ResumeSheetState();
}

class _ResumeSheetState extends State<_ResumeSheet> {
  late DateTime _resumeDate;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _resumeDate = widget.scheduled ?? DateTime(now.year, now.month, now.day);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return HrEditorSheet(
      title: 'Resume work',
      saveLabel: 'Resume',
      saving: _saving,
      canSave: !_saving,
      onSave: _save,
      children: [
        HrFormSection(
          children: [
            HrDateField(
              label: 'First day back',
              value: _resumeDate,
              required: true,
              onChanged: (d) => setState(() => _resumeDate = d ?? _resumeDate),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          'Days start counting again from this date. The pause ends the day '
          'before it.',
          style: RunqText.caption.copyWith(color: t.muted2),
        ),
      ],
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final p = await hrRepo.resumeContract(widget.contract.id, resumeDate: _resumeDate);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      // Resuming on the day the pause began removes it outright — it would
      // have covered no days.
      showRunqSnack(context, p.removed ? 'Pause removed' : 'Work resumed',
          kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}
