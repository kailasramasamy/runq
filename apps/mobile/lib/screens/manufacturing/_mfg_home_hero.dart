// Hero KPI card + "This week" analytics card for manufacturing_home_screen.dart.
// Kept in a separate file to stay under the 500-line-per-file rule; included
// via `part of`.

part of 'manufacturing_home_screen.dart';

// ── Hero card (Active BOMs / Draft WOs / Scheduled today / In-progress) ──

class _HeroCard extends StatelessWidget {
  final AsyncValue<MfgDashboard> dashboard;
  const _HeroCard({required this.dashboard});

  @override
  Widget build(BuildContext context) {
    final d = dashboard.maybeWhen(data: (v) => v, orElse: () => null);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          gradient: MfgColors.heroGradientSoft,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: MfgColors.roseDeep.withValues(alpha: 0.16),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _HeroBigKpi(
                      label: 'Active BOMs',
                      value: d == null ? '–' : '${d.activeBomCount}',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroBigKpi(
                      label: 'Draft WOs',
                      value: d == null ? '–' : '${d.draftWoCount}',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Scheduled',
                      value: d == null ? '–' : '${d.scheduledTodayCount}',
                      sub: 'today',
                      onTap: () {
                        final today = DateTime.now().toIso8601String().substring(0, 10);
                        context.push('/manufacturing/wos?scheduledFrom=$today&scheduledTo=$today');
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroMiniKpi(
                      label: 'Completed',
                      value: d == null ? '–' : '${d.completedTodayCount}',
                      sub: 'today',
                      onTap: () => context.push('/manufacturing/wos?status=completed'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _ModulePill(),
                const Spacer(),
                Text(
                  _todayLabel(),
                  style: RunqText.micro.copyWith(color: const Color(0xCCFFFFFF)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _todayLabel() {
    final d = DateTime.now();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }
}

class _ModulePill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 5, 8, 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.factory_outlined, size: 13, color: Colors.white),
          const SizedBox(width: 6),
          Text(
            'Manufacturing',
            style: RunqText.caption.copyWith(
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroBigKpi extends StatelessWidget {
  final String label;
  final String value;
  const _HeroBigKpi({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: RunqText.micro.copyWith(
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
              color: Colors.white.withValues(alpha: 0.85),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: RunqText.h1.copyWith(
              color: Colors.white,
              height: 1.1,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroMiniKpi extends StatelessWidget {
  const _HeroMiniKpi({
    required this.label,
    required this.value,
    required this.sub,
    this.onTap,
  });
  final String label;
  final String value;
  final String sub;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bg = Colors.black.withValues(alpha: 0.28);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: RunqText.micro.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                  color: Colors.white.withValues(alpha: 0.78),
                ),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: RunqText.h3.copyWith(
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  height: 1.1,
                ),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                sub,
                style: RunqText.micro.copyWith(
                  color: Colors.white.withValues(alpha: 0.65),
                ),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── "This week" analytics card ────────────────────────────────────────────

/// Week-to-date output, laid out as a header, a KPI band and a ranked BOM
/// list. The three figures used to be left-packed chips with fixed gaps, so
/// they bunched at one edge and left the rest of the card empty; they now sit
/// in an even band, ordered plan → actual → the variance between them.
class _ThisWeekCard extends StatelessWidget {
  final MfgDashboard dashboard;
  const _ThisWeekCard({required this.dashboard});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: MfgCard(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _header(context, t),
            const SizedBox(height: 12),
            _kpiBand(t),
            if (dashboard.topBomsThisWeek.isNotEmpty) ...[
              const SizedBox(height: 12),
              Divider(height: 1, thickness: 0.5, color: t.hairline),
              const SizedBox(height: 10),
              _topBoms(t),
            ],
          ],
        ),
      ),
    );
  }

  Widget _header(BuildContext context, RunqTokens t) {
    final brand = MfgColors.brand(context);
    final pending = dashboard.wosCompletedPendingClose;
    // Nothing pending is good news, not a call to action — don't dress a zero
    // up in brand colour as though it needs attention.
    final tone = pending > 0 ? brand : t.muted;
    return Row(
      children: [
        Text('This week', style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const Spacer(),
        GestureDetector(
          onTap: () => context.push(
            '/manufacturing/reports/wo-summary?status=completed',
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('$pending pending close',
                  style: RunqText.caption.copyWith(color: tone)),
              const SizedBox(width: 2),
              Icon(Icons.chevron_right_rounded, size: 16, color: tone),
            ],
          ),
        ),
      ],
    );
  }

  Widget _kpiBand(RunqTokens t) {
    final varPct = dashboard.weekVariancePct;
    final varLabel = varPct == null
        ? '—'
        : '${varPct >= 0 ? '+' : ''}${varPct.toStringAsFixed(1)}%';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          _WeekKpi(
            label: 'Planned',
            value: dashboard.todayPlannedOutput.toStringAsFixed(1),
          ),
          _KpiDivider(),
          _WeekKpi(
            label: 'Actual',
            value: dashboard.todayActualOutput.toStringAsFixed(1),
          ),
          _KpiDivider(),
          _WeekKpi(
            label: 'Variance',
            value: varLabel,
            valueColor: varPct == null
                ? null
                : (varPct < 0 ? MfgColors.error : MfgColors.success),
          ),
        ],
      ),
    );
  }

  Widget _topBoms(RunqTokens t) {
    final top = dashboard.topBomsThisWeek.take(3).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('TOP BOMS', style: RunqText.micro.copyWith(color: t.muted2)),
        const SizedBox(height: 6),
        for (var i = 0; i < top.length; i++)
          _TopBomRow(rank: i + 1, bom: top[i]),
      ],
    );
  }
}

class _WeekKpi extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _WeekKpi({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: RunqText.micro.copyWith(color: t.muted)),
          const SizedBox(height: 3),
          Text(
            value,
            style: RunqText.bodyStrong.copyWith(color: valueColor ?? t.ink),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _KpiDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        width: 1,
        height: 26,
        color: RT(context).hairline,
        margin: const EdgeInsets.symmetric(horizontal: 10),
      );
}

/// A ranked run count. Leads with the BOM's name rather than its code — on
/// the floor "Buffalo Curd" identifies a line, "BOM-BUF-CURD-400G" doesn't.
class _TopBomRow extends StatelessWidget {
  final int rank;
  final MfgTopBom bom;
  const _TopBomRow({required this.rank, required this.bom});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        children: [
          SizedBox(
            width: 16,
            child: Text('$rank',
                style: RunqText.micro.copyWith(color: t.muted2),
                textAlign: TextAlign.center),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              bom.bomName.isNotEmpty ? bom.bomName : bom.bomCode,
              style: RunqText.caption.copyWith(color: t.ink),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${bom.runs} run${bom.runs == 1 ? '' : 's'}',
            style: RunqText.caption.copyWith(color: t.muted, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
