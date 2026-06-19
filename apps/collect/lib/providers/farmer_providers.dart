import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../utils/format.dart';

/// This month's pours for the signed-in farmer (server auto-scopes).
final farmerMonthPoursProvider = FutureProvider<List<MpPour>>((ref) async {
  final now = DateTime.now();
  final from = '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
  final to = todayIso();
  return mpRepo.pours(from: from, to: to, status: 'recorded', limit: 500);
});

/// Today's pours for the signed-in farmer.
final farmerTodayPoursProvider = FutureProvider<List<MpPour>>((ref) async {
  return mpRepo.pours(collectionDate: todayIso(), status: 'recorded', limit: 10);
});

/// Ledger for the signed-in farmer (balance + all entries).
final farmerLedgerProvider =
    FutureProvider<({double balance, List<MpLedgerEntry> entries})>((ref) async {
  return mpRepo.farmerLedger();
});

/// All active cow rate charts (farmer permission allows this).
final activeRateChartsProvider = FutureProvider<List<MpRateChart>>((ref) async {
  final charts = await mpRepo.rateCharts(milkType: 'cow', limit: 50);
  return charts.where((c) => c.isActive).toList();
});

/// Detail (cells + rules) for the first active cow rate chart.
final activeRateChartDetailProvider = FutureProvider<MpRateChartDetail?>((ref) async {
  final charts = await ref.watch(activeRateChartsProvider.future);
  if (charts.isEmpty) return null;
  return mpRepo.rateChart(charts.first.id);
});

/// Rate resolution for the farmer's most recent pour — null if no pour yet.
final farmerLastRateResolutionProvider = FutureProvider<MpRateResolution?>((ref) async {
  final pours = await ref.watch(farmerMonthPoursProvider.future);
  if (pours.isEmpty) return null;
  final last = pours.reduce((a, b) =>
      a.collectionDate.compareTo(b.collectionDate) >= 0 ? a : b);
  if (last.fat == null || last.snf == null) return null;
  return mpRepo.resolveRate(
    milkType: last.milkType,
    fat: last.fat!,
    snf: last.snf!,
  );
});

/// The signed-in farmer's own master row (server scopes to self). Drives the
/// profile header (friendly code as Farmer ID, member-since).
final farmerSelfProvider = FutureProvider<MpFarmer?>((ref) async {
  final list = await mpRepo.farmers(limit: 1);
  return list.isEmpty ? null : list.first;
});

// ── Payout cycle (cadence-aware payments) ───────────────────────────────────

/// A single payout window — current (in-progress) or a past closed cycle.
class MpCyclePeriod {
  final String start; // yyyy-MM-dd, inclusive
  final String end; // yyyy-MM-dd, inclusive
  final String label; // e.g. "1–15 Jun"
  const MpCyclePeriod(this.start, this.end, this.label);

  @override
  bool operator ==(Object other) =>
      other is MpCyclePeriod && other.start == start && other.end == end;
  @override
  int get hashCode => Object.hash(start, end);
}

const _shortMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _rangeLabel(DateTime s, DateTime e) => s.month == e.month
    ? '${s.day}–${e.day} ${_shortMonths[e.month - 1]}'
    : '${s.day} ${_shortMonths[s.month - 1]} – ${e.day} ${_shortMonths[e.month - 1]}';

/// Calendar-aligned cycle windows within one month: 15-day → [1-15],[16-end];
/// 10-day → [1-10],[11-20],[21-end]. The final window absorbs the remainder so
/// cycles never cross months. Returned ascending.
List<MpCyclePeriod> _monthCycles(int year, int month, int n) {
  final daysInMonth = DateTime(year, month + 1, 0).day;
  final threshold = daysInMonth < 30 ? daysInMonth : 30; // merge a 31st-day stub
  final starts = <int>[];
  for (var s = 1; s <= threshold; s += n) {
    starts.add(s);
  }
  return List.generate(starts.length, (i) {
    final end = i < starts.length - 1 ? starts[i + 1] - 1 : daysInMonth;
    final s = DateTime(year, month, starts[i]);
    final e = DateTime(year, month, end);
    return MpCyclePeriod(_isoDate(s), _isoDate(e), _rangeLabel(s, e));
  });
}

/// Most recent [count] cycle windows (index 0 = the cycle containing today).
/// Cycles are calendar-aligned within each month (see [_monthCycles]); falls
/// back to whole calendar months when no cadence is configured.
List<MpCyclePeriod> buildCyclePeriods(MpCycleConfig cfg, DateTime now, int count) {
  final n = cfg.cycleDays;
  if (n != null) {
    final today = _isoDate(DateTime(now.year, now.month, now.day));
    final out = <MpCyclePeriod>[];
    var y = now.year, m = now.month;
    for (var guard = 0; guard < 24 && out.length < count; guard++) {
      for (final c in _monthCycles(y, m, n).reversed) {
        if (c.start.compareTo(today) <= 0) out.add(c); // skip not-yet-started cycles
        if (out.length >= count) break;
      }
      m -= 1;
      if (m == 0) { m = 12; y -= 1; }
    }
    return out;
  }
  return List.generate(count, (i) {
    final m = DateTime(now.year, now.month - i);
    final last = DateTime(m.year, m.month + 1, 0);
    return MpCyclePeriod(_isoDate(m), _isoDate(last), '${_shortMonths[m.month - 1]} ${m.year}');
  });
}

/// Tenant cadence for the signed-in farmer's views.
final cycleConfigProvider = FutureProvider<MpCycleConfig>((ref) => mpRepo.cycleConfig());

/// Tenant support contacts for the Help & Support screen (all personas).
final supportConfigProvider = FutureProvider<MpSupportConfig>((ref) => mpRepo.supportConfig());

/// Recent cycle windows (current + past), cadence-aware.
final farmerCyclePeriodsProvider = FutureProvider<List<MpCyclePeriod>>((ref) async {
  final cfg = await ref.watch(cycleConfigProvider.future);
  return buildCyclePeriods(cfg, DateTime.now(), 6);
});

/// Recorded pours within one cycle window.
final farmerCyclePoursProvider =
    FutureProvider.family<List<MpPour>, MpCyclePeriod>((ref, p) async {
  return mpRepo.pours(from: p.start, to: p.end, status: 'recorded', limit: 500);
});

/// The current (in-progress) cycle window — null until cadence resolves.
final farmerCurrentCyclePeriodProvider = FutureProvider<MpCyclePeriod?>((ref) async {
  final periods = await ref.watch(farmerCyclePeriodsProvider.future);
  return periods.isEmpty ? null : periods.first;
});

/// Recorded pours in the current cycle (drives the home hero).
final farmerCurrentCyclePoursProvider = FutureProvider<List<MpPour>>((ref) async {
  final period = await ref.watch(farmerCurrentCyclePeriodProvider.future);
  if (period == null) return const [];
  return ref.watch(farmerCyclePoursProvider(period).future);
});
