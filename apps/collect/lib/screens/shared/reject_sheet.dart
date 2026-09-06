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
    // Deliberately NOT padded by viewInsets. Lifting the whole sheet clear of
    // the keyboard pushes a form this tall against the status bar, which reads
    // as a full-screen takeover for what is a three-question sheet. It stays
    // put; the scroll view below carries the keypad's height as scroll room so
    // a covered field can be brought out from under it.
    builder: (_) => _RejectSheet(onSubmit: onSubmit, maxLitres: maxLitres),
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
  final _notesFocus = FocusNode();
  final _notesKey = GlobalKey();
  RejectionReason? _reason;
  String _disposition = 'returned';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Focus lands before the keyboard has finished animating in, so the scroll
    // waits a frame for viewInsets to be real — otherwise it scrolls to where
    // the field sits with no keypad up, which is where it already was.
    _notesFocus.addListener(() {
      if (!_notesFocus.hasFocus) return;
      WidgetsBinding.instance.addPostFrameCallback((_) => _revealNotes());
      // Again once the keypad has settled. Focus moves from the litres field to
      // this one, which swaps a numeric pad for a taller alphabetic one — so the
      // viewport the first scroll aimed at is not the viewport that ends up on
      // screen, and the field slides back under the action bar.
      Future.delayed(const Duration(milliseconds: 320), () {
        if (mounted && _notesFocus.hasFocus) _revealNotes();
      });
    });
  }

  @override
  void dispose() {
    _qty.dispose();
    _notes.dispose();
    _notesFocus.dispose();
    super.dispose();
  }

  /// Choosing 'Other' reveals a field the operator now has to fill, so focus
  /// moves to it and it scrolls into view. Without this the field is simply
  /// appended below the fold — hidden under the pinned action bar, with the
  /// numeric keypad still up, and nothing on screen saying anything happened.
  void _pickReason(RejectionReason r) {
    setState(() => _reason = r);
    if (r != RejectionReason.other) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _notesFocus.requestFocus();
    });
  }

  /// Bring the notes field up to the top of what is still visible. 'Other' is
  /// the one reason that demands typing, and its field sits at the bottom of
  /// the form — exactly where the keypad lands.
  void _revealNotes() {
    final ctx = _notesKey.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(ctx,
        alignment: 0, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
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
    final insets = MediaQuery.of(context).viewInsets.bottom;
    final maxH = (MediaQuery.of(context).size.height - insets) * 0.9;
    return ConstrainedBox(
      // The usable form is capped to what is left ABOVE the keypad, so lifting
      // can never carry the sheet into the status bar; the keypad's own height
      // is then added back, because the sheet's surface has to keep going down
      // behind it.
      constraints: BoxConstraints(maxHeight: maxH + insets),
      child: Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
          ),
          // The home-indicator inset only matters when no keypad is covering it.
          child: SafeArea(
            top: false,
            bottom: insets == 0,
            // Header, body, footer — the ordinary shape of a form sheet, and
            // the only one where the action stays reachable. With everything in
            // one scroll view the button sat below the fold behind the keypad:
            // the form's whole point, unreachable until you dismissed the
            // keyboard you were still typing into.
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _header(t, l),
                Flexible(
                  child: SingleChildScrollView(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    physics: const AlwaysScrollableScrollPhysics(),
                    // Top padding is not decoration: the first field is
                    // outlined, and its floating label rides ON the top border,
                    // so with zero padding the scroll view clips it in half.
                    padding: const EdgeInsets.fromLTRB(
                        DhenuSpacing.lg, DhenuSpacing.sm, DhenuSpacing.lg, DhenuSpacing.lg),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _qtyField(t, l),
                        const SizedBox(height: DhenuSpacing.lg),
                        Text(l.rejectReasonLabel,
                            style: DhenuText.label.copyWith(color: t.inkSoft)),
                        const SizedBox(height: DhenuSpacing.sm),
                        _reasonChips(t, l),
                        if (_reason == RejectionReason.other) ...[
                          const SizedBox(height: DhenuSpacing.md),
                          _notesField(t, l),
                        ],
                        const SizedBox(height: DhenuSpacing.lg),
                        Text(l.rejectDispositionLabel,
                            style: DhenuText.label.copyWith(color: t.inkSoft)),
                        const SizedBox(height: DhenuSpacing.sm),
                        _dispositionToggle(t, l),
                        if (_error != null) ...[
                          const SizedBox(height: DhenuSpacing.md),
                          Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
                        ],
                      ],
                    ),
                  ),
                ),
                _footer(t, l),
                // Runs the sheet's own colour down behind the keypad. Ending at
                // the keypad's top edge let the dimmed page behind show through
                // its rounded corners as a wedge on each side.
                SizedBox(height: insets),
              ],
            ),
          ),
      ),
    );
  }

  /// Grabber, title and a close — fixed, so the sheet still names itself once
  /// the form is scrolled. The X is there because a sheet holding a half-typed
  /// form should be dismissible without guessing that a downward drag works.
  Widget _header(DhenuTokens t, AppLocalizations l) => Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.sm, DhenuSpacing.md),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Center(child: SheetGrabber()),
          const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Icon(DhenuIcons.warning, size: 20, color: t.gradeC),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(child: Text(l.rejectTitle, style: DhenuText.title.copyWith(color: t.ink))),
            IconButton(
              icon: Icon(DhenuIcons.close, size: 20, color: t.inkSoft),
              tooltip: l.commonCancel,
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ]),
        ]),
      );

  /// The action, pinned above the keypad and separated by a hairline so it
  /// reads as a bar rather than the last thing in a list.
  Widget _footer(DhenuTokens t, AppLocalizations l) => Container(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: t.hairline))),
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.md),
        child: PrimaryAction(
          label: l.rejectSubmit,
          icon: DhenuIcons.warning,
          onPressed: (_valid && !_saving) ? _submit : null,
          loading: _saving,
        ),
      );

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
        key: _notesKey,
        controller: _notes,
        focusNode: _notesFocus,
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
              onSelected: (_) => _pickReason(r),
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

/// Put back everything refused off a load. Confirmed, because it cancels the
/// deduction the farmer or centre is carrying for it.
Future<bool> undoRejection(
  BuildContext context, {
  required MpConsignment consignment,
  required Future<void> Function() onDone,
}) async {
  final l = AppLocalizations.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(l.rejectUndo),
      content: Text(l.rejectUndoConfirm(litres(consignment.rejectedQty, unit: true))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.commonCancel)),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.rejectUndo)),
      ],
    ),
  );
  if (ok != true) return false;
  try {
    await mpRepo.undoConsignmentRejections(consignment.id);
    await onDone();
    return true;
  } catch (e) {
    if (context.mounted) {
      showDhenuToast(context, friendlyError(context, e), type: DhenuToastType.error);
    }
    return false;
  }
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
