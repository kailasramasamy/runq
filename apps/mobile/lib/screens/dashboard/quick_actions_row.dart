import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../services/bill_intake.dart';
import '../../widgets/invoice_quick_sheet.dart';

class _QA {
  final IconData icon;
  final String label;
  final Color tint;
  final void Function(BuildContext) onTap;
  const _QA(this.icon, this.label, this.tint, this.onTap);
}

class QuickActionsRow extends ConsumerWidget {
  const QuickActionsRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(dashboardSummaryProvider);
    final inboxCount = ref.watch(inboxCountProvider);

    final reconCount = summary.maybeWhen(data: (s) => s.unreconciledTxnCount, orElse: () => 0);
    final inboxBadge = inboxCount.maybeWhen(data: (n) => n, orElse: () => 0);

    final items = <_QA>[
      _QA(Icons.receipt_long_outlined, 'Bill', RunqColors.indigo, (ctx) => startBillIntake(ctx)),
      _QA(Icons.send_outlined, 'Invoice', const Color(0xFF06B6D4), (ctx) => showInvoiceQuickSheet(ctx)),
      _QA(Icons.account_balance_outlined, 'Reconcile', RunqColors.greenInk, (ctx) => ctx.push('/banking')),
      _QA(Icons.inbox_outlined, 'Inbox', RunqColors.amberInk, (ctx) => ctx.push('/inbox')),
    ];
    final badges = <int>[0, 0, reconCount, inboxBadge];
    final badgeTints = <Color>[
      Colors.transparent, Colors.transparent,
      const Color(0xFFF97316), // orange for recon
      RunqColors.redInk,        // red for inbox
    ];

    return Row(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          Expanded(
            child: _Tile(
              qa: items[i],
              badge: badges[i],
              badgeColor: badgeTints[i],
              onTap: () => items[i].onTap(context),
            ),
          ),
          if (i < items.length - 1) const SizedBox(width: 10),
        ],
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  final _QA qa;
  final int badge;
  final Color badgeColor;
  final VoidCallback onTap;
  const _Tile({required this.qa, required this.badge, required this.badgeColor, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 14, 6, 12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _IconBlock(icon: qa.icon, tint: qa.tint, badge: badge, badgeColor: badgeColor, surface: t.surface),
            const SizedBox(height: 10),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                qa.label,
                style: RunqText.bodyStrong.copyWith(color: t.ink, height: 1.2),
                maxLines: 1,
                overflow: TextOverflow.visible,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IconBlock extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final int badge;
  final Color badgeColor;
  final Color surface;
  const _IconBlock({
    required this.icon,
    required this.tint,
    required this.badge,
    required this.badgeColor,
    required this.surface,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 44, height: 44,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 22, color: tint),
          ),
          if (badge > 0)
            Positioned(
              right: -6, top: -6,
              child: _Badge(count: badge, color: badgeColor, ringColor: surface),
            ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final int count;
  final Color color, ringColor;
  const _Badge({required this.count, required this.color, required this.ringColor});

  @override
  Widget build(BuildContext context) {
    final label = count > 99 ? '99+' : '$count';
    return Container(
      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: ringColor, width: 2),
      ),
      child: Center(
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: RunqText.tabular(size: 11, w: FontWeight.w700, color: Colors.white).copyWith(height: 1.0),
        ),
      ),
    );
  }
}
