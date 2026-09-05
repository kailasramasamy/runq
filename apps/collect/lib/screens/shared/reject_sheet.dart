import 'package:flutter/material.dart';

import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/sheet_grabber.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';

/// Refusing milk, at whichever point it is caught.
///
/// One sheet for all three — the gate, the CC's receipt and the plant's —
/// because the operator is answering the same three questions each time: how
/// much, why, and where did it go. Only the caller differs in what it does with
/// the answer.
///
/// The reason is a fixed list rather than free text on purpose: "rejection rate
/// by reason" is the report this whole feature exists to produce, and it cannot
/// be built from a thousand spellings of "sour".
Future<bool> showRejectSheet(
  BuildContext context, {
  required Future<void> Function(RejectDraft draft) onSubmit,
  double? maxLitres,
}) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _RejectSheet(onSubmit: onSubmit, maxLitres: maxLitres),
    ),
  );
  return ok == true;
}

/// What the operator answered.
class RejectDraft {
  const RejectDraft({
    required this.qtyLitres,
    required this.reason,
    required this.disposition,
    this.notes,
  });

  final double qtyLitres;
  final RejectionReason reason;
  final String disposition;
  final String? notes;

  /// The half of the request body every caller sends; each adds its own subject.
  Map<String, dynamic> toBody() => {
        'qtyLitres': qtyLitres,
        'reason': rejectionReasonApi[reason],
        'disposition': disposition,
        if (notes != null && notes!.trim().isNotEmpty) 'notes': notes!.trim(),
      };
}

class _RejectSheet extends StatefulWidget {
  const _RejectSheet({required this.onSubmit, this.maxLitres});

  final Future<void> Function(RejectDraft draft) onSubmit;
  final double? maxLitres;

  @override
  State<_RejectSheet> createState() => _RejectSheetState();
}

class _RejectSheetState extends State<_RejectSheet> {
  final _qty = TextEditingController();
  final _notes = TextEditingController();
  RejectionReason? _reason;
  String _disposition = 'returned';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _qty.dispose();
    _notes.dispose();
    super.dispose();
  }

  double? get _qtyValue => double.tryParse(_qty.text.trim());

  /// 'other' with no note is unauditable a month later, when the reason is the
  /// only thing anyone wants to know. Same rule the server and the DB enforce.
  bool get _valid {
    final q = _qtyValue;
    if (q == null || q <= 0) return false;
    if (widget.maxLitres != null && q - widget.maxLitres! > 1e-6) return false;
    if (_reason == null) return false;
    if (_reason == RejectionReason.other && _notes.text.trim().isEmpty) return false;
    return true;
  }

  Future<void> _submit() async {
    setState(() { _saving = true; _error = null; });
    try {
      await widget.onSubmit(RejectDraft(
        qtyLitres: _qtyValue!,
        reason: _reason!,
        disposition: _disposition,
        notes: _notes.text,
      ));
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = friendlyError(context, e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Center(child: SheetGrabber()),
              const SizedBox(height: DhenuSpacing.sm),
              Row(children: [
                Icon(DhenuIcons.warning, size: 20, color: t.gradeC),
                const SizedBox(width: DhenuSpacing.sm),
                Text(l.rejectTitle, style: DhenuText.title.copyWith(color: t.ink)),
              ]),
              const SizedBox(height: DhenuSpacing.lg),
              _qtyField(t, l),
              const SizedBox(height: DhenuSpacing.lg),
              Text(l.rejectReasonLabel, style: DhenuText.label.copyWith(color: t.inkSoft)),
              const SizedBox(height: DhenuSpacing.sm),
              _reasonChips(t, l),
              if (_reason == RejectionReason.other) ...[
                const SizedBox(height: DhenuSpacing.md),
                _notesField(t, l),
              ],
              const SizedBox(height: DhenuSpacing.lg),
              Text(l.rejectDispositionLabel, style: DhenuText.label.copyWith(color: t.inkSoft)),
              const SizedBox(height: DhenuSpacing.sm),
              _dispositionToggle(t, l),
              if (_error != null) ...[
                const SizedBox(height: DhenuSpacing.md),
                Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
              ],
              const SizedBox(height: DhenuSpacing.xl),
              PrimaryAction(
                label: l.rejectSubmit,
                icon: DhenuIcons.warning,
                onPressed: (_valid && !_saving) ? _submit : null,
                loading: _saving,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _qtyField(DhenuTokens t, AppLocalizations l) => TextField(
        controller: _qty,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: DhenuText.number(size: 22, color: t.ink),
        decoration: InputDecoration(
          labelText: l.rejectQtyLabel,
          suffixText: 'L',
          helperText: widget.maxLitres == null
              ? null
              : l.rejectMaxHint(litres(widget.maxLitres!, unit: true)),
        ),
        onChanged: (_) => setState(() {}),
      );

  Widget _notesField(DhenuTokens t, AppLocalizations l) => TextField(
        controller: _notes,
        textCapitalization: TextCapitalization.sentences,
        maxLength: 500,
        style: DhenuText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          labelText: l.rejectNotesLabel,
          helperText: l.rejectNeedsReason,
        ),
        onChanged: (_) => setState(() {}),
      );

  Widget _reasonChips(DhenuTokens t, AppLocalizations l) => Wrap(
        spacing: DhenuSpacing.sm,
        runSpacing: DhenuSpacing.sm,
        children: [
          for (final r in RejectionReason.values)
            ChoiceChip(
              label: Text(_reasonLabel(l, r)),
              selected: _reason == r,
              onSelected: (_) => setState(() => _reason = r),
            ),
        ],
      );

  Widget _dispositionToggle(DhenuTokens t, AppLocalizations l) => Row(
        children: [
          for (final d in const ['returned', 'destroyed'])
            Padding(
              padding: const EdgeInsets.only(right: DhenuSpacing.sm),
              child: ChoiceChip(
                label: Text(d == 'returned' ? l.rejectReturned : l.rejectDestroyed),
                selected: _disposition == d,
                onSelected: (_) => setState(() => _disposition = d),
              ),
            ),
        ],
      );

  String _reasonLabel(AppLocalizations l, RejectionReason r) => switch (r) {
        RejectionReason.sour => l.rejectReasonSour,
        RejectionReason.temperature => l.rejectReasonTemperature,
        RejectionReason.adulterated => l.rejectReasonAdulterated,
        RejectionReason.cobPositive => l.rejectReasonCob,
        RejectionReason.antibiotic => l.rejectReasonAntibiotic,
        RejectionReason.foreignMatter => l.rejectReasonForeign,
        RejectionReason.other => l.rejectReasonOther,
      };
}

/// Refuse part of a load already taken in. Shared by the CC and plant receive
/// screens — both are the same decision at different tiers.
Future<bool> rejectConsignment(
  BuildContext context, {
  required MpConsignment consignment,
  required Future<void> Function() onDone,
}) async {
  final l = AppLocalizations.of(context);
  var refused = 0.0;
  final done = await showRejectSheet(
    context,
    maxLitres: consignment.receiptQty,
    onSubmit: (d) async {
      await mpRepo.rejectConsignment(consignment.id, d.toBody());
      refused = d.qtyLitres;
      await onDone();
    },
  );
  if (done && context.mounted) {
    showDhenuToast(context, l.rejectDoneToast(litres(refused, unit: true)),
        type: DhenuToastType.success);
  }
  return done;
}
