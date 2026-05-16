// Self-contained dashboard sections for the HR manager home. Each
// widget reads its own provider so the home file stays declarative —
// the manager body just drops these in sequence.
//
// Visibility rules:
//   - All sections hide cleanly when there's nothing to show.
//   - Loading + error states render as compact placeholders so the page
//     isn't dominated by spinners.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../api/hr_models.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_widgets.dart';

class _SectionLabel extends StatelessWidget {
  final String label;
  final Widget? trailing;
  const _SectionLabel(this.label, {this.trailing});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
      child: Row(
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(
                color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
              )),
          const Spacer(),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

// ─── Who's out today ──────────────────────────────────────────────────────

class HrWhoIsOutSection extends ConsumerWidget {
  const HrWhoIsOutSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrWhoIsOutTodayProvider);
    final rows = async.asData?.value ?? const [];
    if (rows.isEmpty) return const SizedBox.shrink();
    final top = rows.take(3).toList();
    final extra = rows.length - top.length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel(
            'Who\'s out today',
            trailing: extra > 0
                ? Text('+$extra more',
                    style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600))
                : null,
          ),
          Container(
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: RunqShadows.card,
            ),
            child: Column(
              children: [
                for (var i = 0; i < top.length; i++) ...[
                  _WhoOutRow(req: top[i].req),
                  if (i < top.length - 1)
                    Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 60),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WhoOutRow extends StatelessWidget {
  final HrLeaveRequest req;
  const _WhoOutRow({required this.req});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final isMulti = req.fromDate != req.toDate;
    final returnsDay = req.toDate.add(const Duration(days: 1));
    final backLabel = !isMulti
        ? null
        : 'back ${returnsDay.day} ${m[returnsDay.month - 1]}';
    return InkWell(
      onTap: () => context.push('/hr/people/${req.employeeId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            HrAvatar(
              name: req.employeeName,
              photoUrl: req.employeePhotoUrl,
              employeeId: req.employeeId,
              size: 36,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(req.employeeName,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      req.typeName,
                      if (backLabel != null) backLabel,
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
                  ),
                ],
              ),
            ),
            HrStatusBadge(
              status: 'on_leave',
              label: '${req.totalDays.toStringAsFixed(req.totalDays % 1 == 0 ? 0 : 1)}d',
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Celebrations (birthdays + work anniversaries this week) ──────────────

class HrCelebrationsSection extends ConsumerWidget {
  const HrCelebrationsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrCelebrationsProvider);
    final rows = async.asData?.value ?? const [];
    if (rows.isEmpty) return const SizedBox.shrink();
    final top = rows.take(4).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SectionLabel('Celebrations this week'),
          Container(
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: RunqShadows.card,
            ),
            child: Column(
              children: [
                for (var i = 0; i < top.length; i++) ...[
                  _CelebrationRow(item: top[i]),
                  if (i < top.length - 1)
                    Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 60),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CelebrationRow extends StatelessWidget {
  final HrCelebration item;
  const _CelebrationRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isBday = item.kind == 'birthday';
    final emoji = isBday ? '🎂' : '🎉';
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final occursLabel = item.daysAway == 0
        ? 'Today'
        : item.daysAway == 1
            ? 'Tomorrow'
            : '${item.occursOn.day} ${m[item.occursOn.month - 1]}';
    final title = isBday
        ? 'Birthday'
        : '${item.years}-year anniversary';
    final phone = item.employee.phone;
    return InkWell(
      onTap: () => context.push('/hr/people/${item.employee.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            HrAvatar(
              name: item.employee.displayName,
              photoUrl: item.employee.photoUrl,
              employeeId: item.employee.id,
              size: 36,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$emoji  ${item.employee.displayName}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13),
                  ),
                  const SizedBox(height: 2),
                  Text('$title · $occursLabel',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                ],
              ),
            ),
            if (phone != null && phone.isNotEmpty)
              IconButton(
                tooltip: 'Send wish',
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.waving_hand_outlined, color: HrColors.brand(context), size: 18),
                onPressed: () async {
                  // Open WhatsApp pre-filled. Falls back to SMS if WA isn't
                  // installed — that's a graceful degrade for a tap-meant-
                  // -for-greeting flow.
                  final greeting = isBday
                      ? 'Happy birthday, ${item.employee.firstName}! 🎂'
                      : 'Happy ${item.years}-year work anniversary, ${item.employee.firstName}! 🎉';
                  final wa = Uri.parse('https://wa.me/${phone.replaceAll(RegExp(r'[^0-9]'), '')}?text=${Uri.encodeComponent(greeting)}');
                  if (await canLaunchUrl(wa)) {
                    await launchUrl(wa, mode: LaunchMode.externalApplication);
                  }
                },
              ),
          ],
        ),
      ),
    );
  }
}

// ─── People moments (joiners + exits this month) ──────────────────────────

class HrPeopleMomentsSection extends ConsumerWidget {
  const HrPeopleMomentsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(hrPeopleMomentsProvider);
    final data = async.asData?.value;
    if (data == null) return const SizedBox.shrink();
    final joiners = data.joinersThisMonth;
    final exits = data.exitsThisMonth;
    if (joiners.isEmpty && exits.isEmpty) return const SizedBox.shrink();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    final mLabel = months[DateTime.now().month - 1];
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel('People moments · $mLabel'),
          Row(
            children: [
              Expanded(
                child: _MomentTile(
                  icon: Icons.trending_up_rounded,
                  tint: const Color(0xFF16A34A),
                  label: 'NEW JOINERS',
                  count: joiners.length,
                  topNames: joiners.take(2).map((e) => e.displayName).toList(),
                  onTap: joiners.isEmpty
                      ? null
                      : () => context.push('/hr/people'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MomentTile(
                  icon: Icons.trending_down_rounded,
                  tint: const Color(0xFFDC2626),
                  label: 'EXITS',
                  count: exits.length,
                  topNames: exits.take(2).map((e) => e.displayName).toList(),
                  onTap: exits.isEmpty
                      ? null
                      : () => context.push('/hr/people'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MomentTile extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final String label;
  final int count;
  final List<String> topNames;
  final VoidCallback? onTap;
  const _MomentTile({
    required this.icon,
    required this.tint,
    required this.label,
    required this.count,
    required this.topNames,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final disabled = count == 0;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 30, height: 30,
                  decoration: BoxDecoration(
                    color: tint.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 16, color: tint),
                ),
                const SizedBox(width: 8),
                Text(label,
                    style: TextStyle(
                      color: t.muted2, fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.4,
                    )),
              ],
            ),
            const SizedBox(height: 8),
            Text('$count',
                style: TextStyle(
                  color: disabled ? t.muted2 : tint,
                  fontSize: 22, fontWeight: FontWeight.w800,
                )),
            const SizedBox(height: 2),
            Text(
              topNames.isEmpty ? 'No one this month' : topNames.join(', '),
              maxLines: 2, overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Attendance trend sparkline (7-day) ───────────────────────────────────

class HrAttendanceTrendSection extends ConsumerWidget {
  const HrAttendanceTrendSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrAttendanceTrend7dProvider);
    final pts = async.asData?.value ?? const [];
    final hasData = pts.any((p) => p.total > 0);
    if (!hasData) return const SizedBox.shrink();
    final avg = pts
            .where((p) => p.total > 0)
            .map((p) => p.ratio)
            .fold<double>(0, (s, r) => s + r) /
        pts.where((p) => p.total > 0).length;
    final avgPct = (avg * 100).round();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel('Attendance trend · last 7 days'),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: RunqShadows.card,
            ),
            child: Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Avg present',
                        style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                    Text('$avgPct%',
                        style: TextStyle(
                          color: HrColors.brand(context),
                          fontSize: 22, fontWeight: FontWeight.w800,
                        )),
                  ],
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: CustomPaint(painter: _SparklinePainter(pts, HrColors.brand(context))),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  final List<HrAttendanceTrendPoint> points;
  final Color color;
  _SparklinePainter(this.points, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final maxR = points.map((p) => p.ratio).fold<double>(0, (a, b) => a > b ? a : b);
    final scale = maxR == 0 ? 1.0 : maxR;
    final step = points.length > 1 ? size.width / (points.length - 1) : size.width;
    final path = Path();
    final fill = Path();
    for (var i = 0; i < points.length; i++) {
      final x = i * step;
      final y = size.height - (points[i].ratio / scale) * size.height;
      if (i == 0) {
        path.moveTo(x, y);
        fill.moveTo(x, size.height);
        fill.lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fill.lineTo(x, y);
      }
    }
    fill.lineTo(size.width, size.height);
    fill.close();

    canvas.drawPath(
      fill,
      Paint()..color = color.withValues(alpha: 0.12),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    // Dots
    for (var i = 0; i < points.length; i++) {
      final x = i * step;
      final y = size.height - (points[i].ratio / scale) * size.height;
      canvas.drawCircle(Offset(x, y), 2.5, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _SparklinePainter old) =>
      old.points != points || old.color != color;
}

// ─── Document expiries (next 90 days) ─────────────────────────────────────

class HrExpiringDocsSection extends ConsumerWidget {
  const HrExpiringDocsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrExpiringDocsProvider);
    final rows = async.asData?.value ?? const [];
    if (rows.isEmpty) return const SizedBox.shrink();
    final top = rows.take(4).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SectionLabel(
            'Document expiries',
            trailing: rows.length > top.length
                ? Text('+${rows.length - top.length} more',
                    style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600))
                : null,
          ),
          Container(
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: RunqShadows.card,
            ),
            child: Column(
              children: [
                for (var i = 0; i < top.length; i++) ...[
                  _ExpiringRow(doc: top[i]),
                  if (i < top.length - 1)
                    Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 60),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ExpiringRow extends StatelessWidget {
  final HrExpiringDoc doc;
  const _ExpiringRow({required this.doc});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final days = doc.daysLeft;
    // Tone the chip by urgency.
    final (chipBg, chipInk, chipText) = days < 0
        ? (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D), '${-days}d overdue')
        : days <= 7
            ? (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D), '$days days')
            : days <= 30
                ? (const Color(0xFFFEF3C7), const Color(0xFF78350F), '$days days')
                : (const Color(0xFFF1F5F9), const Color(0xFF475569), '$days days');
    final kindLabel = doc.kind == null ? 'Document' : doc.kind!.label;
    return InkWell(
      onTap: () => context.push('/hr/people/${doc.employeeId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            HrAvatar(
              name: doc.employeeName,
              photoUrl: doc.employeePhotoUrl,
              employeeId: doc.employeeId,
              size: 36,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(doc.employeeName,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text('$kindLabel · ${doc.employeeCode}',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: chipBg, borderRadius: BorderRadius.circular(999)),
              child: Text(chipText,
                  style: TextStyle(color: chipInk, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}
