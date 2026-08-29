// Reorder Alerts — items at or below effective reorder level. Redesigned
// per the handoff: count pill in the app bar, 2-col critical/warning
// summary, sectioned list with per-alert tiles showing a stock bar +
// short-by / order-qty / lead-time grid + preferred supplier.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import '../../utils/format_qty.dart';

class InventoryReorderScreen extends ConsumerWidget {
  const InventoryReorderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invReorderAlertsProvider);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Reorder Alerts',
        // Top-level tab — no back arrow (lives inside the shell). When
        // reached via deep-link / push we still want pop-to-previous.
        onBack: Navigator.of(context).canPop() ? () => context.pop() : null,
        trailing: rows.maybeWhen(
          data: (list) => list.isEmpty ? null : _CountPill(count: list.length),
          orElse: () => null,
        ),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invReorderAlertsProvider);
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Failed to load: $e',
                style: RunqText.caption.copyWith(color: t.muted),
                textAlign: TextAlign.center,
              ),
            ),
          ),
          data: (list) {
            if (list.isEmpty) return const _AllGood();
            final critical = list
                .where((a) => a.urgency == 'critical')
                .toList();
            final warning = list.where((a) => a.urgency != 'critical').toList();
            return CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: _SummaryStrip(
                    critical: critical.length,
                    warning: warning.length,
                  ),
                ),
                if (critical.isNotEmpty) ...[
                  SliverToBoxAdapter(
                    child: InvSectionHeader(
                      title: 'Critical (${critical.length})',
                      topPad: 12,
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverList.separated(
                      itemCount: critical.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _AlertTile(alert: critical[i]),
                    ),
                  ),
                ],
                if (warning.isNotEmpty) ...[
                  SliverToBoxAdapter(
                    child: InvSectionHeader(
                      title: 'Warning (${warning.length})',
                      topPad: 12,
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverList.separated(
                      itemCount: warning.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _AlertTile(alert: warning[i]),
                    ),
                  ),
                ],
                const SliverToBoxAdapter(child: SizedBox(height: 120)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.count});
  final int count;
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: InvColors.errorBg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        '$count items',
        style: RunqText.micro.copyWith(
          color: InvColors.error,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class _AllGood extends StatelessWidget {
  const _AllGood();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 80),
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: InvColors.successBg,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(
            Icons.check_circle_outline,
            size: 30,
            color: InvColors.success,
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'All stock above reorder level',
          style: RunqText.bodyStrong.copyWith(color: t.ink),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          'Nothing to reorder right now.',
          style: RunqText.caption.copyWith(color: t.muted2),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

// ── Summary strip (Critical / Warning cards) ─────────────────────────────

class _SummaryStrip extends StatelessWidget {
  const _SummaryStrip({required this.critical, required this.warning});
  final int critical;
  final int warning;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      // IntrinsicHeight — see other strip notes; sliver passes h=Infinity.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _UrgencyCard(
                label: 'Critical',
                value: critical,
                sub: 'Order immediately',
                color: InvColors.error,
                bg: InvColors.errorBg,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _UrgencyCard(
                label: 'Warning',
                value: warning,
                sub: 'Plan to reorder',
                color: InvColors.orangeAlert,
                bg: InvColors.orangeAlertBg,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UrgencyCard extends StatelessWidget {
  const _UrgencyCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.color,
    required this.bg,
  });
  final String label;
  final int value;
  final String sub;
  final Color color;
  final Color bg;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: color.withValues(alpha: 0.22)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label.toUpperCase(),
            style: RunqText.label.copyWith(color: color),
          ),
          const SizedBox(height: 4),
          Text(
            '$value',
            style: RunqText.numberLg.copyWith(
              color: color,
              fontSize: 20,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            style: RunqText.caption.copyWith(
              color: color.withValues(alpha: 0.8),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Alert tile (per handoff) ─────────────────────────────────────────────

class _AlertTile extends StatelessWidget {
  const _AlertTile({required this.alert});
  final InvReorderAlert alert;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isCritical = alert.urgency == 'critical';
    final barColor = isCritical ? InvColors.error : InvColors.orangeAlert;
    // Bar pct: on-hand vs (reorderLevel × 3) so the marker at 1/3 maps to
    // the reorder line and full = 3× reorder.
    final cap = alert.reorderLevel * 3;
    final pct = cap > 0 ? (alert.onHand / cap).clamp(0.0, 1.0) : 0.0;

    return InvCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header — name + sku·wh + urgency pill.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      alert.itemName,
                      style: RunqText.bodyStrong.copyWith(
                        color: t.ink,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if ((alert.itemSku ?? '').isNotEmpty) alert.itemSku!,
                        alert.warehouseName,
                      ].join(' · '),
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              InvUrgencyPill(urgency: alert.urgency),
            ],
          ),
          const SizedBox(height: 10),
          // Stock bar with reorder-line marker at 1/3.
          Row(
            children: [
              Text(
                'ON HAND',
                style: RunqText.micro.copyWith(
                  color: t.muted2,
                  letterSpacing: 0.3,
                ),
              ),
              const Spacer(),
              Text(
                'REORDER LEVEL',
                style: RunqText.micro.copyWith(
                  color: t.muted2,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          _MarkedStockBar(pct: pct, fillColor: barColor),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(
                '${_fmtQty(alert.onHand, alert.itemUnit)} ${alert.itemUnit ?? ''}'
                    .trim(),
                style: RunqText.caption.copyWith(
                  color: barColor,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              Text(
                '${_fmtQty(alert.reorderLevel, alert.itemUnit)} ${alert.itemUnit ?? ''}'
                    .trim(),
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
          // Stats grid divider + 3-col stats.
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Container(height: 1, color: t.hairlineSoft),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _Stat(
                  label: 'SHORT BY',
                  value:
                      '${_fmtQty(alert.shortBy, alert.itemUnit)} ${alert.itemUnit ?? ''}'
                          .trim(),
                  color: barColor,
                ),
              ),
              Expanded(
                child: _Stat(
                  label: 'ORDER QTY',
                  value:
                      '${_fmtQty(alert.reorderQty, alert.itemUnit)} ${alert.itemUnit ?? ''}'
                          .trim(),
                  color: t.ink,
                ),
              ),
              Expanded(
                child: _Stat(
                  label: 'LEAD TIME',
                  value: alert.leadTimeDays != null
                      ? '${alert.leadTimeDays}d'
                      : '—',
                  color: t.ink,
                ),
              ),
            ],
          ),
          if ((alert.supplierName ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Supplier: ${alert.supplierName}',
              style: RunqText.caption.copyWith(color: t.muted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  static String _fmtQty(double q, [String? unit]) =>
      formatItemQty(q, null, unit: unit);
}

class _MarkedStockBar extends StatelessWidget {
  const _MarkedStockBar({required this.pct, required this.fillColor});

  /// Fill ratio 0..1 against the (3× reorder) scale used for marker math.
  final double pct;
  final Color fillColor;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // The track is centred in a taller box so the reorder mark can stand
    // proud of it at both ends. Confined to a six-pixel rail the tick was
    // drawn but not seen, which is the same as not being there.
    return LayoutBuilder(
      builder: (_, c) => SizedBox(
        height: 12,
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              height: 6,
              width: c.maxWidth,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: Stack(
                  children: [
                    Positioned.fill(child: ColoredBox(color: t.bgWarmer)),
                    Positioned(
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: c.maxWidth * pct,
                      child: ColoredBox(color: fillColor),
                    ),
                  ],
                ),
              ),
            ),
            // Reorder-line marker — vertical bar at 1/3 (qty == reorder),
            // drawn over the fill: a mark hidden under the stock that cleared
            // it is missing exactly when the reader wants to see the margin.
            Positioned(
              left: c.maxWidth * (1 / 3) - 1.25,
              top: 0,
              bottom: 0,
              child: Container(
                width: 2.5,
                decoration: BoxDecoration(
                  color: t.ink,
                  borderRadius: BorderRadius.circular(1.25),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: RunqText.caption.copyWith(
            color: color,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}
