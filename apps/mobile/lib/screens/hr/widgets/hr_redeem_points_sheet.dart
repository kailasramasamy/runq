// Bottom sheet for the employee to submit a points-redemption request.
// Opened from the Points balance card in HrEmployeeRewardsView.
//
// Asks for points to redeem (default 500, max = current balance), shows a
// live "= ₹X cash" preview, then POSTs to /hr/rewards/redeem.
// On success, shows a toast and invalidates both providers so the view
// refreshes automatically.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';

/// Opens the redeem-points bottom sheet. Caller passes [maxBalance] so the
/// sheet can enforce the upper bound without a second fetch.
Future<void> showRedeemPointsSheet(
  BuildContext context,
  WidgetRef ref, {
  required int maxBalance,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _RedeemPointsSheet(maxBalance: maxBalance, ref: ref),
  );
}

class _RedeemPointsSheet extends StatefulWidget {
  final int maxBalance;
  final WidgetRef ref;
  const _RedeemPointsSheet({required this.maxBalance, required this.ref});

  @override
  State<_RedeemPointsSheet> createState() => _RedeemPointsSheetState();
}

class _RedeemPointsSheetState extends State<_RedeemPointsSheet> {
  static const _minPoints = 500;
  final _ctrl = TextEditingController(text: '500');
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _ctrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  int get _parsed => int.tryParse(_ctrl.text.trim()) ?? 0;
  bool get _valid => _parsed >= _minPoints && _parsed <= widget.maxBalance;

  Future<void> _submit() async {
    if (!_valid || _submitting) return;
    setState(() => _submitting = true);
    try {
      await hrRepo.redeemPoints(_parsed);
      if (!mounted) return;
      // Capture messenger before pop so we can show toast from parent context.
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      widget.ref.invalidate(hrPointsBalanceProvider);
      widget.ref.invalidate(hrRewardsProvider);
      showRunqSnackOn(messenger, 'Redemption submitted for HR approval',
          kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException
          ? e.message
          : 'Could not submit redemption. Try again.';
      showRunqSnack(context, msg, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final pts = _parsed;
    final cashValue = pts > 0 ? pts : 0; // 1 pt = ₹1

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
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('Redeem points', style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(
              'Available: ${widget.maxBalance} pts  •  Minimum: $_minPoints pts',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 16),
            Text(
              'Points to redeem',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _ctrl,
              keyboardType: TextInputType.number,
              textCapitalization: TextCapitalization.none,
              autofocus: true,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                hintText: '500',
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
              ),
            ),
            const SizedBox(height: 12),
            if (pts > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: HrColors.teal.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: HrColors.teal.withValues(alpha: 0.2),
                    width: 0.5,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(Icons.currency_rupee_rounded, size: 16, color: HrColors.teal),
                    const SizedBox(width: 6),
                    Text(
                      '= ₹$cashValue cash',
                      style: RunqText.bodyStrong.copyWith(color: HrColors.teal),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '(1 pt = ₹1)',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _valid && !_submitting ? _submit : null,
              style: FilledButton.styleFrom(
                backgroundColor: HrColors.teal,
                disabledBackgroundColor: t.hairlineSoft,
                disabledForegroundColor: t.muted2,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _submitting
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Redeem'),
            ),
          ],
        ),
      ),
    );
  }
}
