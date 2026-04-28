import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/bill_intake.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

class _Action {
  final IconData icon;
  final String title, sub;
  final Color tint;
  final void Function(BuildContext) onTap;
  const _Action(this.icon, this.title, this.sub, this.tint, this.onTap);
}

class FabSheet extends StatelessWidget {
  final double progress;
  final VoidCallback onClose;
  const FabSheet({super.key, required this.progress, required this.onClose});

  @override
  Widget build(BuildContext context) {
    if (progress == 0) return const SizedBox.shrink();

    final media = MediaQuery.of(context);
    final t = RT(context);
    final actions = <_Action>[
      _Action(
        Icons.receipt_long_outlined,
        'Add a bill',
        'Scan or upload',
        RunqColors.indigo,
        (ctx) => startBillIntake(ctx),
      ),
      _Action(
        Icons.send_outlined,
        'Create invoice',
        'Send to a customer',
        const Color(0xFF06B6D4),
        (ctx) => ctx.push('/invoices'),
      ),
      _Action(
        Icons.payments_outlined,
        'Record payment',
        'Mark a payment received',
        RunqColors.greenInk,
        (ctx) => ctx.push('/invoices'),
      ),
      _Action(
        Icons.account_balance_wallet_outlined,
        'Pay a vendor',
        'From any bank account',
        RunqColors.amberInk,
        (ctx) => ctx.push('/bills'),
      ),
    ];

    return Positioned(
      left: 0,
      right: 0,
      bottom: media.padding.bottom + 88,
      child: Opacity(
        opacity: progress,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.hero),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: RunqShadows.sheet,
            ),
            padding: const EdgeInsets.all(8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final a in actions)
                  _ActionRow(
                    action: a,
                    onTap: () {
                      onClose();
                      // Run the action after the sheet collapse animation
                      // starts so the chooser/picker overlays the dashboard
                      // smoothly.
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (context.mounted) a.onTap(context);
                      });
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final _Action action;
  final VoidCallback onTap;
  const _ActionRow({required this.action, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: action.tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(action.icon, color: action.tint, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(action.title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(action.sub, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}
