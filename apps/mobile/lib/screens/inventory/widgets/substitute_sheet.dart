// Sending something other than what the invoice billed.
//
// This is the 4am case the app exists for: the pouch the order names has run
// out, the van is loading, and the operator reaches for the next shelf. That
// already happened every time it happened — the only question was whether the
// books heard about it. Before this, the answer was a manual stock adjustment
// on the substitute and an invoice line that stayed open forever.
//
// The sheet deliberately shows options it will not let you pick. A stand-in
// blocked for tax reasons is still on the rack, and hiding it sends someone
// hunting for a SKU they can see; showing it greyed with the reason ends the
// search in one read.

library;

import 'package:flutter/material.dart';

import '../../../api/sales_dispatch_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

/// What the operator settled on for one line.
typedef SubstituteChoice = ({String itemId, String note});

/// Opens the picker. Resolves to the chosen stand-in, or null if the operator
/// backed out or cleared the choice — the caller treats both the same way.
Future<SubstituteChoice?> showSubstituteSheet(
  BuildContext context, {
  required InvDispatchPreviewLine line,
  SubstituteChoice? current,
}) {
  return showModalBottomSheet<SubstituteChoice?>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _SubstituteSheet(line: line, current: current),
  );
}

class _SubstituteSheet extends StatefulWidget {
  const _SubstituteSheet({required this.line, this.current});
  final InvDispatchPreviewLine line;
  final SubstituteChoice? current;

  @override
  State<_SubstituteSheet> createState() => _SubstituteSheetState();
}

class _SubstituteSheetState extends State<_SubstituteSheet> {
  String? _picked;
  late final TextEditingController _note;

  @override
  void initState() {
    super.initState();
    _picked = widget.current?.itemId;
    _note = TextEditingController(text: widget.current?.note ?? '');
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  InvSubstituteOption? get _chosen {
    final id = _picked;
    if (id == null) return null;
    for (final o in widget.line.substitutes) {
      if (o.itemId == id) return o;
    }
    return null;
  }

  /// A price difference is a commercial call, not an error — so it is allowed,
  /// but only against a reason somebody typed.
  bool get _ready {
    final c = _chosen;
    if (c == null) return false;
    return !c.needsNote || _note.text.trim().isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final billed = withUom(
        widget.line.itemName ?? widget.line.description, widget.line.uom);
    return Padding(
      // Lifts the sheet clear of the keyboard the note field summons.
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text('Send instead of $billed', style: RunqText.h4.copyWith(color: t.ink)),
            const SizedBox(height: 2),
            Text(
              'Pick what goes on the van in its place.',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  for (final o in widget.line.substitutes)
                    _OptionTile(
                      option: o,
                      selected: _picked == o.itemId,
                      onTap: () => setState(() {
                        _picked = _picked == o.itemId ? null : o.itemId;
                        _note.clear();
                      }),
                    ),
                ],
              ),
            ),
            if (_chosen?.needsNote ?? false) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _note,
                autofocus: true,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => setState(() {}),
                style: RunqText.body.copyWith(color: t.ink),
                decoration: InputDecoration(
                  labelText: 'Why',
                  hintText: 'Ran out, customer agreed',
                  labelStyle: RunqText.caption.copyWith(color: t.muted),
                  hintStyle: RunqText.body.copyWith(color: t.muted2),
                  filled: true,
                  fillColor: t.bgWarm,
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  border: _border(t.hairline),
                  enabledBorder: _border(t.hairline),
                  focusedBorder: _border(InvColors.brand(context)),
                ),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                if (widget.current != null)
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(null),
                    child: Text('Send the original',
                        style: RunqText.body.copyWith(color: t.muted)),
                  ),
                const Spacer(),
                FilledButton(
                  onPressed: _ready
                      ? () => Navigator.of(context).pop(
                            (itemId: _picked!, note: _note.text.trim()),
                          )
                      : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: InvColors.brand(context),
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  ),
                  child: Text('Use substitute',
                      style: RunqText.bodyStrong.copyWith(color: Colors.white)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.option,
    required this.selected,
    required this.onTap,
  });
  final InvSubstituteOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final blocked = option.blocked;
    return Opacity(
      opacity: blocked ? 0.55 : 1,
      child: InkWell(
        onTap: blocked ? null : onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
          decoration: BoxDecoration(
            color: selected ? InvColors.amberSubtle : t.bgWarm,
            border: Border.all(
              color: selected ? InvColors.amberHairline : t.hairline,
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    selected ? Icons.check_circle : Icons.circle_outlined,
                    size: 18,
                    color: selected ? InvColors.brand(context) : t.muted2,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      withUom(option.itemName, option.uom),
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text('${_n(option.availableQty)} on hand',
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
              if (option.message != null) ...[
                const SizedBox(height: 5),
                Padding(
                  padding: const EdgeInsets.only(left: 26),
                  child: Text(
                    option.message!,
                    style: RunqText.caption.copyWith(
                      color: blocked ? InvColors.error : InvColors.orangeAlert,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

OutlineInputBorder _border(Color c) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: c),
    );

String _n(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);

/// "Farm Fresh Cow Milk 500ml" — a product reference that identifies the SKU.
///
/// Every place these flows name a product, they name it with its pack size.
/// "Farm Fresh Cow Milk" alone is two different things on the shelf, and an
/// operator picking a stand-in at 4am has to be told which one.
String withUom(String name, String? uom) =>
    (uom ?? '').isEmpty ? name : '$name $uom';
