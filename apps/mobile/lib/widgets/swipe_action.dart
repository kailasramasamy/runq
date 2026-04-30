import 'package:flutter/material.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';

/// Single Slidable action button — colored block with stacked icon + label.
/// Use inside an `ActionPane`'s `children` list.
class SwipeAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Future<void> Function() onTap;

  const SwipeAction({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Padding(
        // Match the row's bottom gap so the action panel doesn't kiss the
        // next card.
        padding: const EdgeInsets.only(left: 6),
        child: Material(
          color: color,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: () async {
              // Close the slidable BEFORE running the action and wait for the
              // close animation to finish — flutter_slidable paints its
              // action pane in an Overlay, which sits above modal routes.
              // Without awaiting, the pane bleeds through any sheet/dialog
              // the action opens (e.g. tinting buttons washed-purple).
              await Slidable.of(context)?.close();
              await onTap();
            },
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: Colors.white, size: 20),
                  const SizedBox(height: 6),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: RunqText.caption.copyWith(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      height: 1.1,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Result of the payment-method bottom sheet — the picked method ID and the
/// optional reference (UTR for UPI/bank, cheque #, last-4 for card, etc.).
class PaymentMethodResult {
  final String method;
  final String? reference;
  const PaymentMethodResult({required this.method, this.reference});
}

class _PaymentMethod {
  final String id;
  final String label;
  final IconData icon;
  /// Label for the reference text field on step 2. Null = no reference needed
  /// for this method (e.g. cash) and step 2 just shows a Confirm button.
  final String? referenceLabel;
  const _PaymentMethod(this.id, this.label, this.icon, this.referenceLabel);
}

const _kMethods = <_PaymentMethod>[
  _PaymentMethod('upi', 'UPI', Icons.phone_android_rounded, 'UTR / transaction ID'),
  _PaymentMethod('bank_transfer', 'Bank transfer', Icons.account_balance_rounded, 'Transaction reference'),
  _PaymentMethod('cash', 'Cash', Icons.payments_rounded, null),
  _PaymentMethod('cheque', 'Cheque', Icons.description_rounded, 'Cheque number'),
  _PaymentMethod('card', 'Card', Icons.credit_card_rounded, 'Last 4 digits'),
];

/// Bottom sheet for marking an invoice or bill paid. Two steps inside one
/// sheet: (1) pick a payment method, (2) optionally enter a reference for
/// that method. Returns the selection or null if the user cancels.
Future<PaymentMethodResult?> showPaymentMethodSheet(
  BuildContext context,
  double amount,
) async {
  return showModalBottomSheet<PaymentMethodResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PaymentMethodSheet(amount: amount),
  );
}

class _PaymentMethodSheet extends StatefulWidget {
  final double amount;
  const _PaymentMethodSheet({required this.amount});

  @override
  State<_PaymentMethodSheet> createState() => _PaymentMethodSheetState();
}

class _PaymentMethodSheetState extends State<_PaymentMethodSheet> {
  _PaymentMethod? _picked;
  final _refCtrl = TextEditingController();

  @override
  void dispose() {
    _refCtrl.dispose();
    super.dispose();
  }

  void _confirm() {
    final ref = _refCtrl.text.trim();
    Navigator.of(context).pop(PaymentMethodResult(
      method: _picked!.id,
      reference: ref.isEmpty ? null : ref,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.sheet,
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20, 14, 20,
            18 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              if (_picked == null)
                _PickerStep(
                  amount: widget.amount,
                  onPick: (m) => setState(() => _picked = m),
                )
              else
                _ReferenceStep(
                  amount: widget.amount,
                  method: _picked!,
                  refCtrl: _refCtrl,
                  onBack: () => setState(() {
                    _picked = null;
                    _refCtrl.clear();
                  }),
                  onConfirm: _confirm,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PickerStep extends StatelessWidget {
  final double amount;
  final ValueChanged<_PaymentMethod> onPick;
  const _PickerStep({required this.amount, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Mark ${formatINR(amount)} paid',
            style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 4),
        Text('How was this paid?',
            style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 14),
        for (final m in _kMethods) ...[
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => onPick(m),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  border: Border.all(color: t.hairline, width: 0.5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: t.brandSubtle,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(m.icon, color: t.brand, size: 18),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(m.label,
                          style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    ),
                    Icon(Icons.chevron_right_rounded,
                        color: t.muted2, size: 20),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _ReferenceStep extends StatelessWidget {
  final double amount;
  final _PaymentMethod method;
  final TextEditingController refCtrl;
  final VoidCallback onBack;
  final VoidCallback onConfirm;
  const _ReferenceStep({
    required this.amount,
    required this.method,
    required this.refCtrl,
    required this.onBack,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasRef = method.referenceLabel != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            InkWell(
              onTap: onBack,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Icon(Icons.arrow_back_rounded, color: t.ink, size: 22),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: t.brandSubtle,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(method.icon, color: t.brand, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(method.label,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  Text('${formatINR(amount)} · paid',
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        if (hasRef) ...[
          TextField(
            controller: refCtrl,
            autofocus: true,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => onConfirm(),
            decoration: InputDecoration(
              labelText: '${method.referenceLabel} (optional)',
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 6),
          Text('Helps you reconcile against bank or counter records.',
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 16),
        ] else ...[
          Text('No reference needed for cash payments.',
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 16),
        ],
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton(
            onPressed: onConfirm,
            child: const Text('Confirm payment'),
          ),
        ),
      ],
    );
  }
}
