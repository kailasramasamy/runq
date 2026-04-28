import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../utils/format_inr.dart';

const _darkAmberGradient = LinearGradient(
  begin: Alignment(-0.7, -1),
  end: Alignment(0.7, 1),
  colors: [Color(0xFF3F1D08), Color(0xFF7C3503)],
);

const _darkGreenGradient = LinearGradient(
  begin: Alignment(-0.7, -1),
  end: Alignment(0.7, 1),
  colors: [Color(0xFF052E1B), Color(0xFF0E4D2E)],
);

class SpotlightCards extends ConsumerWidget {
  const SpotlightCards({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(dashboardSummaryProvider);
    return SizedBox(
      height: 168,
      child: summary.when(
        data: (s) => _buildList(context, s),
        loading: () => const Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: RunqColors.indigo)),
        ),
        error: (_, __) => const SizedBox(),
      ),
    );
  }

  Widget _buildList(BuildContext context, DashboardSummary s) {
    return Consumer(
      builder: (ctx, ref, _) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        final gst = ref.watch(gstReadinessProvider).maybeWhen(data: (g) => g, orElse: () => null);
        return _renderTiles(ctx, s, isDark, gst);
      },
    );
  }

  Widget _renderTiles(BuildContext context, DashboardSummary s, bool isDark, GstReadiness? gst) {
    final tiles = <Widget>[];
    if (s.overdueAmount > 0) {
      tiles.add(_SpotlightCard(
        gradient: isDark ? _darkAmberGradient : RunqColors.overdueGradient,
        inkColor: isDark ? const Color(0xFFFCD34D) : const Color(0xFF92400E),
        icon: Icons.timer_outlined,
        pillLabel: 'OVERDUE',
        headline: formatINR(s.overdueAmount, compact: true),
        sub: '${s.overdueCount} ${s.overdueCount == 1 ? 'invoice' : 'invoices'}',
        cta: 'Send reminder →',
        ctaIcon: Icons.chat_bubble_outline_rounded,
        onTap: () => context.push('/invoices?status=overdue'),
      ));
    }
    if (s.upcomingAmount > 0) {
      tiles.add(_SpotlightCard(
        gradient: isDark ? _darkGreenGradient : RunqColors.gstGradient,
        inkColor: isDark ? const Color(0xFF6EE7B7) : const Color(0xFF047857),
        icon: Icons.event_note_outlined,
        pillLabel: 'DUE THIS WEEK',
        headline: formatINR(s.upcomingAmount, compact: true),
        sub: '${s.upcomingCount} ${s.upcomingCount == 1 ? 'bill' : 'bills'}',
        cta: 'Pay vendors →',
        onTap: () => context.push('/bills'),
      ));
    }
    if (gst != null && !gst.filedExternally) {
      tiles.add(_GstCard(gst: gst, isDark: isDark));
    }
    tiles.add(_CashAskAgentCard(cash: s.cashPosition));

    return ListView.separated(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: tiles.length,
      separatorBuilder: (_, __) => const SizedBox(width: 12),
      itemBuilder: (_, i) => tiles[i],
    );
  }
}

class _SpotlightCard extends StatelessWidget {
  final Gradient gradient;
  final Color inkColor;
  final IconData icon;
  final String pillLabel, headline, sub, cta;
  final IconData? ctaIcon;
  final VoidCallback? onTap;
  const _SpotlightCard({
    required this.gradient,
    required this.inkColor,
    required this.icon,
    required this.pillLabel,
    required this.headline,
    required this.sub,
    required this.cta,
    this.ctaIcon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.card),
      child: Container(
        width: 220,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(RunqRadii.card),
          border: Border.all(color: inkColor.withValues(alpha: 0.10), width: 0.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 32, height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: inkColor.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 18, color: inkColor),
                ),
                const Spacer(),
                _MicroPill(label: pillLabel, color: inkColor),
              ],
            ),
            const Spacer(),
            Text(headline, style: RunqText.numberLg.copyWith(color: inkColor, fontSize: 24)),
            const SizedBox(height: 4),
            Text(sub,
                style: RunqText.caption.copyWith(color: inkColor.withValues(alpha: 0.78), fontSize: 11),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 10),
            Row(
              children: [
                if (ctaIcon != null) ...[
                  Icon(ctaIcon, size: 12, color: inkColor),
                  const SizedBox(width: 4),
                ],
                Flexible(
                  child: Text(
                    cta,
                    style: RunqText.caption.copyWith(color: inkColor, fontWeight: FontWeight.w600, fontSize: 12),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MicroPill extends StatelessWidget {
  final String label;
  final Color color;
  const _MicroPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: RunqText.micro.copyWith(color: color)),
    );
  }
}

class _CashAskAgentCard extends StatelessWidget {
  final double cash;
  const _CashAskAgentCard({required this.cash});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/agent'),
      borderRadius: BorderRadius.circular(RunqRadii.card),
      child: Container(
        width: 220,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: RunqColors.cashCardGradient,
          borderRadius: BorderRadius.circular(RunqRadii.card),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 32, height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.show_chart_rounded, size: 18, color: Colors.white),
                ),
                const Spacer(),
                _MicroPill(label: 'TODAY', color: Colors.white),
              ],
            ),
            const Spacer(),
            Text(formatINR(cash, compact: true), style: RunqText.numberLg.copyWith(color: Colors.white, fontSize: 24)),
            const SizedBox(height: 4),
            Text('Cash on hand',
                style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.7), fontSize: 11)),
            const SizedBox(height: 10),
            Text('Ask agent →',
                style: RunqText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

class _GstCard extends StatelessWidget {
  final GstReadiness gst;
  final bool isDark;
  const _GstCard({required this.gst, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final score = gst.score;
    final ink = isDark
        ? (score >= 80 ? const Color(0xFF6EE7B7) : score >= 50 ? const Color(0xFFFCD34D) : const Color(0xFFFCA5A5))
        : (score >= 80 ? const Color(0xFF047857) : score >= 50 ? const Color(0xFF92400E) : const Color(0xFFB91C1C));
    final gradient = score >= 80
        ? (isDark ? _darkGreenGradient : RunqColors.gstGradient)
        : score >= 50
            ? (isDark ? _darkAmberGradient : RunqColors.overdueGradient)
            : (isDark ? _darkRedGradient : _lightRedGradient);
    final pillLabel = score >= 80
        ? 'ON TRACK'
        : score >= 50
            ? 'NEEDS WORK'
            : 'AT RISK';

    final days = gst.daysToGstr1;
    final headline = gst.preparing
        ? 'Preparing'
        : days == null
            ? '—'
            : days < 0
                ? 'Overdue'
                : '${days} ${days == 1 ? 'day' : 'days'}';

    final failing = gst.firstFailingSignal;
    final sub = failing != null
        ? 'GSTR-1 ${gst.periodLabel} · ${failing.detail ?? failing.label}'
        : 'GSTR-1 ${gst.periodLabel} · all clear';

    return InkWell(
      onTap: () {/* TODO: route to /gst when screen exists */},
      borderRadius: BorderRadius.circular(RunqRadii.card),
      child: Container(
        width: 220,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(RunqRadii.card),
          border: Border.all(color: ink.withValues(alpha: 0.10), width: 0.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SizedBox(width: 32, height: 32, child: CustomPaint(painter: _RingPainter(score / 100, ink))),
                const Spacer(),
                _MicroPill(label: pillLabel, color: ink),
              ],
            ),
            const Spacer(),
            Text(headline, style: RunqText.numberLg.copyWith(color: ink, fontSize: 24)),
            const SizedBox(height: 4),
            Text(
              sub,
              style: RunqText.caption.copyWith(color: ink.withValues(alpha: 0.78), fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),
            Text(
              failing == null ? 'Review →' : 'Fix & review →',
              style: RunqText.caption.copyWith(color: ink, fontWeight: FontWeight.w600, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

const _darkRedGradient = LinearGradient(
  begin: Alignment(-0.7, -1),
  end: Alignment(0.7, 1),
  colors: [Color(0xFF4C0519), Color(0xFF7F1D1D)],
);

const _lightRedGradient = LinearGradient(
  begin: Alignment(-0.7, -1),
  end: Alignment(0.7, 1),
  colors: [Color(0xFFFEE2E2), Color(0xFFFECACA)],
);

class _RingPainter extends CustomPainter {
  final double progress;
  final Color color;
  _RingPainter(this.progress, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width / 2) - 2;
    final track = Paint()
      ..color = color.withValues(alpha: 0.18)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    final fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 3;
    canvas.drawCircle(center, radius, track);
    final rect = Rect.fromCircle(center: center, radius: radius);
    canvas.drawArc(rect, -1.5708, 6.2832 * progress, false, fg);
    final tp = TextPainter(
      text: TextSpan(
        text: '${(progress * 100).round()}%',
        style: RunqText.micro.copyWith(color: color, fontSize: 9),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(center.dx - tp.width / 2, center.dy - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) => old.progress != progress || old.color != color;
}
