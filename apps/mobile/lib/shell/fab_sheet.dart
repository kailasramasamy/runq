import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/bill_intake.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../widgets/invoice_create_sheet.dart';

/// One row in the centre-FAB action sheet. Public so module-specific
/// builders (Finance + HR) can hand their list to [FabSheet] without
/// duplicating the row visuals.
class FabAction {
  final IconData icon;
  final String title, sub;
  final Color tint;
  final void Function(BuildContext) onTap;
  const FabAction({
    required this.icon,
    required this.title,
    required this.sub,
    required this.tint,
    required this.onTap,
  });
}

/// Action set surfaced when the user is in Finance mode. Original quick
/// actions — bill, invoice, payment, vendor pay, expenses.
List<FabAction> financeFabActions() => [
      FabAction(
        icon: Icons.receipt_long_outlined,
        title: 'Add a bill',
        sub: 'Scan or upload',
        tint: RunqColors.indigo,
        onTap: (ctx) => startBillIntake(ctx),
      ),
      FabAction(
        icon: Icons.send_outlined,
        title: 'Create invoice',
        sub: 'From a PO, blank, or upload',
        tint: const Color(0xFF06B6D4),
        onTap: (ctx) => showInvoiceCreateSheet(ctx),
      ),
      FabAction(
        icon: Icons.payments_outlined,
        title: 'Record payment',
        sub: 'Mark a payment received',
        tint: RunqColors.greenInk,
        onTap: (ctx) => ctx.push('/invoices'),
      ),
      FabAction(
        icon: Icons.account_balance_wallet_outlined,
        title: 'Pay a vendor',
        sub: 'From any bank account',
        tint: RunqColors.amberInk,
        onTap: (ctx) => ctx.push('/bills'),
      ),
      FabAction(
        icon: Icons.savings_outlined,
        title: 'Expenses',
        sub: 'Record + view out-of-pocket spends',
        tint: const Color(0xFF7C3AED),
        onTap: (ctx) => ctx.push('/expenses'),
      ),
    ];

/// Action set surfaced when the user is in HR mode. Mirrors the most
/// common employee + manager workflows in one tap. Uses the HR teal
/// palette (with one cyan/green accent for visual rhythm) to keep the
/// sheet on-brand for HR.
List<FabAction> hrFabActions() => [
      FabAction(
        icon: Icons.fingerprint_rounded,
        title: 'Check in / out',
        sub: 'Stamp today\'s attendance',
        tint: const Color(0xFF0891B2), // HR teal
        onTap: (ctx) => ctx.push('/hr/time'),
      ),
      FabAction(
        icon: Icons.event_available_outlined,
        title: 'Apply for leave',
        sub: 'CL · EL · SL — quick request',
        tint: const Color(0xFF06B6D4),
        onTap: (ctx) => ctx.push('/hr/leaves'),
      ),
      FabAction(
        icon: Icons.receipt_outlined,
        title: 'Submit expense',
        sub: 'Out-of-pocket claim',
        tint: RunqColors.greenInk,
        onTap: (ctx) => ctx.push('/hr/expense-claims/new'),
      ),
      FabAction(
        icon: Icons.description_outlined,
        title: 'My latest payslip',
        sub: 'View this month\'s breakdown',
        tint: const Color(0xFF155E75), // HR teal deep
        onTap: (ctx) => ctx.push('/hr/pay'),
      ),
    ];

class FabSheet extends StatelessWidget {
  final double progress;
  final VoidCallback onClose;
  final List<FabAction> actions;
  const FabSheet({
    super.key,
    required this.progress,
    required this.onClose,
    required this.actions,
  });

  @override
  Widget build(BuildContext context) {
    if (progress == 0) return const SizedBox.shrink();

    final media = MediaQuery.of(context);
    final t = RT(context);

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
  final FabAction action;
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

