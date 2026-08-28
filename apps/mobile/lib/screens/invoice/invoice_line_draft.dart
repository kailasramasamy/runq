// One line of an invoice while it is being written.
//
// Immutable, and replaced rather than mutated. The previous version was a
// mutable bag that widgets reached into directly — `line.itemId = picked.id`
// from inside a StatelessWidget, followed by a bare `setState(() {})` to make
// the screen notice. That works until two places edit the same line, and it
// makes an edit sheet that has to be cancellable awkward: the sheet was handed
// the live object and had to keep a hand-copied shadow of it to avoid writing
// changes the user might still discard.
//
// With a value type the sheet simply returns a new draft, and cancelling is
// returning nothing.

library;

class InvoiceLineDraft {
  /// The stored invoice line this came from, on an amendment. Null for a line
  /// being added now. Sent back so the server updates the existing row instead
  /// of replacing it — delivery notes hold a foreign key to that row.
  final String? id;

  /// The catalogue item, when one was picked. Null for a free-typed line.
  final String? itemId;

  /// The item's HSN, carried through to the invoice line.
  ///
  /// Mobile used to omit this, so every invoice raised here stored a null HSN
  /// while the item master had one. Nothing complained until substitution
  /// started comparing tax treatment and refused every swap on the grounds
  /// that the billed line had no HSN to match.
  final String? hsnSacCode;

  final String description;
  final String uom;

  /// Held as typed text, not a number: a half-entered "1." is a legitimate
  /// state for a field someone is still typing into, and parsing on every
  /// keystroke would fight the cursor.
  final String quantity;
  final String unitPrice;

  /// Null means no rate chosen yet. A free-typed line starts unset so the
  /// operator has to pick — including 0% for an exempt item — rather than
  /// silently defaulting to zero and under-charging GST.
  final double? taxRate;

  const InvoiceLineDraft({
    this.id,
    this.itemId,
    this.hsnSacCode,
    this.description = '',
    this.uom = '',
    this.quantity = '',
    this.unitPrice = '',
    this.taxRate,
  });

  double get amount =>
      (double.tryParse(quantity) ?? 0) * (double.tryParse(unitPrice) ?? 0);

  /// Rounded to paise per line, matching the server's per-line CGST/SGST, so
  /// the previewed total ties to the invoice that gets saved.
  double get taxAmount {
    final r = taxRate;
    if (r == null || r <= 0) return 0;
    return (amount * r).roundToDouble() / 100;
  }

  double get total => amount + taxAmount;

  /// A line worth sending: it names something and carries a quantity.
  bool get isComplete => description.trim().isNotEmpty && amount > 0;

  /// `itemId` and `taxRate` take an explicit sentinel because null is a
  /// meaningful value for both — clearing an item, or un-setting a rate —
  /// and the usual `?? this.x` idiom cannot express "set it to null".
  InvoiceLineDraft copyWith({
    String? id,
    Object? itemId = _unset,
    Object? hsnSacCode = _unset,
    String? description,
    String? uom,
    String? quantity,
    String? unitPrice,
    Object? taxRate = _unset,
  }) =>
      InvoiceLineDraft(
        id: id ?? this.id,
        itemId: itemId == _unset ? this.itemId : itemId as String?,
        hsnSacCode:
            hsnSacCode == _unset ? this.hsnSacCode : hsnSacCode as String?,
        description: description ?? this.description,
        uom: uom ?? this.uom,
        quantity: quantity ?? this.quantity,
        unitPrice: unitPrice ?? this.unitPrice,
        taxRate: taxRate == _unset ? this.taxRate : taxRate as double?,
      );

  static const _unset = Object();
}
