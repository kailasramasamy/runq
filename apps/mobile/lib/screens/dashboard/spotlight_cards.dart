import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../providers/data_providers.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../utils/format_inr.dart';

/// Urgency level used to colour the pill inside an attention card.
/// Card backgrounds stay neutral (surface) for visual consistency —
/// urgency is communicated by the pill alone.
enum _Urgency { critical, warning, ok, info }

class SpotlightCards extends ConsumerWidget {
  const SpotlightCards({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(dashboardSummaryProvider);
    return SizedBox(
      height: 168,
      child: summary.when(
        data: (s) => _buildList(context, ref, s),
        loading: () => Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: RT(context).brand)),
        ),
        error: (_, __) => const SizedBox(),
      ),
    );
  }

  Widget _buildList(BuildContext context, WidgetRef ref, DashboardSummary s) {
    final gst = ref.watch(gstReadinessProvider).maybeWhen(data: (g) => g, orElse: () => null);
    final tiles = <Widget>[];

    if (s.overdueAmount > 0) {
      tiles.add(_SpotlightCard(
        icon: Icons.timer_outlined,
        urgency: _Urgency.critical,
        pillLabel: 'OVERDUE',
        headline: formatINR(s.overdueAmount, compact: true),
        sub: '${s.overdueCount} ${s.overdueCount == 1 ? 'invoice' : 'invoices'}',
        cta: 'Send reminder',
        ctaIcon: Icons.chat_bubble_outline_rounded,
        onTap: () => context.push('/invoices?status=overdue'),
      ));
    }
    if (s.upcomingAmount > 0) {
      tiles.add(_SpotlightCard(
        icon: Icons.event_note_outlined,
        urgency: _Urgency.warning,
        pillLabel: 'DUE THIS WEEK',
        headline: formatINR(s.upcomingAmount, compact: true),
        sub: '${s.upcomingCount} ${s.upcomingCount == 1 ? 'bill' : 'bills'}',
        cta: 'Pay vendors',
        onTap: () => context.push('/bills'),
      ));
    }
    if (gst != null && !gst.filedExternally) {
      tiles.add(_GstCard(gst: gst));
    }
    tiles.add(_SpotlightCard(
      icon: Icons.show_chart_rounded,
      urgency: _Urgency.info,
      pillLabel: 'TODAY',
      headline: formatINR(s.cashPosition, compact: true),
      sub: 'Cash on hand',
      cta: 'Ask agent',
      onTap: () => context.push('/agent'),
    ));

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

/// Soft lavender wash so the spotlight cards share the runQ theme without
/// competing with the urgency pills. Two stops, diagonal sweep — readable
/// in both light and dark mode.
LinearGradient _spotlightGradient(BuildContext context) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  return LinearGradient(
    begin: const Alignment(-0.9, -1),
    end: const Alignment(0.9, 1),
    colors: isDark
        ? [
            RunqColors.indigo.withValues(alpha: 0.28),
            RunqColors.indigoDeep.withValues(alpha: 0.10),
          ]
        : [
            const Color(0xFFE0DAFA), // soft violet
            const Color(0xFFF5F1FF), // near-white with violet undertone
          ],
  );
}

/// Maps an urgency level to (background-tint, ink) for the pill.
({Color bg, Color ink}) _pillColors(BuildContext context, _Urgency u) {
  switch (u) {
    case _Urgency.critical:
      return (bg: RunqColors.redBg, ink: RunqColors.redInk);
    case _Urgency.warning:
      return (bg: RunqColors.amberBg, ink: RunqColors.amberInk);
    case _Urgency.ok:
      return (bg: RunqColors.greenBg, ink: RunqColors.greenInk);
    case _Urgency.info:
      return (
        bg: RunqColors.indigo.withValues(alpha: 0.10),
        ink: RunqColors.indigo,
      );
  }
}

class _SpotlightCard extends StatelessWidget {
  final IconData icon;
  final _Urgency urgency;
  final String pillLabel, headline, sub, cta;
  final IconData? ctaIcon;
  final VoidCallback? onTap;
  const _SpotlightCard({
    required this.icon,
    required this.urgency,
    required this.pillLabel,
    required this.headline,
    required this.sub,
    required this.cta,
    this.ctaIcon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final pill = _pillColors(context, urgency);
    return Container(
      width: 220,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: _spotlightGradient(context),
              borderRadius: BorderRadius.circular(RunqRadii.card),
              border: Border.all(color: RunqColors.indigo.withValues(alpha: 0.10), width: 0.5),
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
                      color: t.bgWarm,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(icon, size: 18, color: t.muted),
                  ),
                  const Spacer(),
                  _Pill(label: pillLabel, bg: pill.bg, ink: pill.ink),
                ],
              ),
              const Spacer(),
              Text(headline, style: RunqText.numberLg.copyWith(color: t.ink, fontSize: 24)),
              const SizedBox(height: 4),
              Text(
                sub,
                style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  if (ctaIcon != null) ...[
                    Icon(ctaIcon, size: 12, color: RT(context).brand),
                    const SizedBox(width: 4),
                  ],
                  Flexible(
                    child: Text(
                      cta,
                      style: RunqText.caption.copyWith(color: RT(context).brand, fontWeight: FontWeight.w600, fontSize: 12),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 2),
                  const Icon(Icons.arrow_forward_rounded, size: 12, color: RunqColors.indigo),
                ],
              ),
            ],
          ),
        ),
      ),
    ));
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color bg, ink;
  const _Pill({required this.label, required this.bg, required this.ink});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: RunqText.micro.copyWith(color: ink)),
    );
  }
}

class _GstCard extends StatelessWidget {
  final GstReadiness gst;
  const _GstCard({required this.gst});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final score = gst.score;
    final urgency = score >= 80
        ? _Urgency.ok
        : score >= 50
            ? _Urgency.warning
            : _Urgency.critical;
    final pill = _pillColors(context, urgency);
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
                : '$days ${days == 1 ? 'day' : 'days'}';

    final failing = gst.firstFailingSignal;
    final sub = failing != null
        ? 'GSTR-1 ${gst.periodLabel} · ${failing.detail ?? failing.label}'
        : 'GSTR-1 ${gst.periodLabel} · all clear';

    return Container(
      width: 220,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () {/* TODO: route to /gst when screen exists */},
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: _spotlightGradient(context),
              borderRadius: BorderRadius.circular(RunqRadii.card),
              border: Border.all(color: RunqColors.indigo.withValues(alpha: 0.10), width: 0.5),
            ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SizedBox(width: 32, height: 32, child: CustomPaint(painter: _RingPainter(score / 100, pill.ink))),
                  const Spacer(),
                  _Pill(label: pillLabel, bg: pill.bg, ink: pill.ink),
                ],
              ),
              const Spacer(),
              Text(headline, style: RunqText.numberLg.copyWith(color: t.ink, fontSize: 24)),
              const SizedBox(height: 4),
              Text(
                sub,
                style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Flexible(
                    child: Text(
                      failing == null ? 'Review' : 'Fix & review',
                      style: RunqText.caption.copyWith(color: RT(context).brand, fontWeight: FontWeight.w600, fontSize: 12),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 2),
                  const Icon(Icons.arrow_forward_rounded, size: 12, color: RunqColors.indigo),
                ],
              ),
            ],
          ),
        ),
      ),
    ));
  }
}

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
