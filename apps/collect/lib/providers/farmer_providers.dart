import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../utils/format.dart';
import 'mp_context_provider.dart';

/// The farmer id the farmer views resolve to: the admin's "view as" selection
/// when set, else null (a real farmer login → the server self-scopes). Threaded
/// into the repo calls below so an admin sees the selected farmer's data.
final _farmerScopeId = Provider<String?>((ref) => ref.watch(mpViewAsFarmerProvider)?.id);

/// A collection date (ISO) the Collections tab should open expanded — set when
/// Home's AM/PM card is tapped, and cleared by the day row that consumes it so
/// the same day can be re-focused later. Null means "no pending focus".
final farmerFocusDateProvider = StateProvider<String?>((ref) => null);

/// This month's pours for the resolved farmer (server auto-scopes when null).
final farmerMonthPoursProvider = FutureProvider<List<MpPour>>((ref) async {
  final now = DateTime.now();
  final from = '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
  final to = todayIso();
  return mpRepo.pours(
      farmerId: ref.watch(_farmerScopeId), from: from, to: to, status: 'recorded', limit: 500);
});

/// Today's pours for the resolved farmer.
final farmerTodayPoursProvider = FutureProvider<List<MpPour>>((ref) async {
  return mpRepo.pours(
      farmerId: ref.watch(_farmerScopeId), collectionDate: todayIso(), status: 'recorded', limit: 10);
});

/// Rolling 14-day pours — drives the week-over-week quality nudge (P3.1).
final farmerRecentPoursProvider = FutureProvider<List<MpPour>>((ref) async {
  return mpRepo.pours(
      farmerId: ref.watch(_farmerScopeId), from: isoDaysAgo(13), to: todayIso(),
      status: 'recorded', limit: 500);
});

/// Rolling 30-day pours — the single source for the quality streak so Home
/// and Rewards always show the same number (no cycle/month window skew).
final farmerStreakPoursProvider = FutureProvider<List<MpPour>>((ref) async {
  return mpRepo.pours(
      farmerId: ref.watch(_farmerScopeId), from: isoDaysAgo(29), to: todayIso(),
      status: 'recorded', limit: 500);
});

/// Ledger for the resolved farmer (balance + all entries).
final farmerLedgerProvider =
    FutureProvider<({double balance, List<MpLedgerEntry> entries})>((ref) async {
  return mpRepo.farmerLedger(farmerId: ref.watch(_farmerScopeId));
});

/// Server payout lines for the resolved farmer — the authoritative per-cycle
/// net amounts and paid status shown in Payments history.
final farmerPayoutLinesProvider = FutureProvider<List<MpPayoutLine>>((ref) async {
  return mpRepo.farmerPayoutLines(farmerId: ref.watch(_farmerScopeId));
});

/// The milk types this farmer actually supplies — those poured this month,
/// most-recently-poured first (volume breaks a tie), else their default type.
/// A farmer supplying cow and buffalo is priced by two different charts, so the
/// rate chart screen needs every type, not just the one they last poured.
final farmerMilkTypesProvider = Provider<List<MilkType>>((ref) {
  final pours = ref.watch(farmerMonthPoursProvider).asData?.value ?? const <MpPour>[];
  final self = ref.watch(farmerSelfProvider).asData?.value;
  final latest = <MilkType, String>{};
  final volume = <MilkType, double>{};
  for (final p in pours) {
    final seen = latest[p.milkType];
    if (seen == null || p.collectionDate.compareTo(seen) > 0) {
      latest[p.milkType] = p.collectionDate;
    }
    volume[p.milkType] = (volume[p.milkType] ?? 0) + p.qtyLitres;
  }
  if (latest.isEmpty) return [self?.defaultMilkType ?? MilkType.cowA1];
  return latest.keys.toList()
    ..sort((a, b) {
      final byDate = latest[b]!.compareTo(latest[a]!);
      return byDate != 0 ? byDate : volume[b]!.compareTo(volume[a]!);
    });
});

/// The farmer's most recent pour of [milkType] this month, or null.
final farmerLastPourProvider = FutureProvider.family<MpPour?, MilkType>((ref, milkType) async {
  final pours = await ref.watch(farmerMonthPoursProvider.future);
  final ofType = pours.where((p) => p.milkType == milkType).toList();
  if (ofType.isEmpty) return null;
  return ofType.reduce((a, b) =>
      a.collectionDate.compareTo(b.collectionDate) >= 0 ? a : b);
});

/// The chart that actually prices this farmer's [milkType], resolved
/// server-side — the same chain a pour uses (farmer override → VMCC override →
/// node-scoped → tenant-wide). Context comes from their last pour of that type
/// (readings, node); with no such pour yet it probes with the primary VMCC and
/// nominal mid-range FAT/SNF. When nothing resolves (e.g. no pour yet at a
/// lactometer VMCC, so the FAT/SNF probe misses its CLR chart), falls back to
/// the newest active chart for that milk type.
final activeRateChartDetailProvider =
    FutureProvider.family<MpRateChartDetail?, MilkType>((ref, milkType) async {
  final last = await ref.watch(farmerLastPourProvider(milkType).future);
  final self = await ref.watch(farmerSelfProvider.future);
  final useClr = last != null && last.fat == null && last.clr != null;
  try {
    final res = await mpRepo.resolveRate(
      milkType: milkType,
      fat: useClr ? null : (last?.fat ?? 4.0),
      snf: useClr ? null : (last?.snf ?? 8.0),
      clr: useClr ? last.clr : null,
      scopeNodeId: last?.nodeId ?? self?.primaryNodeId,
      // the pour's farmerId, else the signed-in (or viewed-as) farmer's own id
      // — _farmerScopeId is null for real farmer logins, so don't use it here
      farmerId: last?.farmerId ?? self?.id,
    );
    if (res != null) return mpRepo.rateChart(res.rateChartId);
  } on ApiException catch (e) {
    if (e.statusCode != 404) rethrow; // network/auth errors surface normally
  }
  final charts = await mpRepo.rateCharts(milkType: milkTypeToApi(milkType), limit: 50);
  final active = charts.where((c) => c.isActive).toList();
  return active.isEmpty ? null : mpRepo.rateChart(active.first.id);
});

/// Rate resolution for the farmer's most recent pour of [milkType] — null if
/// they have none. Passes the pour's node and the farmer so overrides price it
/// correctly.
final farmerLastRateResolutionProvider =
    FutureProvider.family<MpRateResolution?, MilkType>((ref, milkType) async {
  final last = await ref.watch(farmerLastPourProvider(milkType).future);
  if (last == null) return null;
  final useClr = last.fat == null && last.clr != null;
  if (!useClr && (last.fat == null || last.snf == null)) return null;
  try {
    return await mpRepo.resolveRate(
      milkType: last.milkType,
      fat: useClr ? null : last.fat,
      snf: useClr ? null : last.snf,
      clr: useClr ? last.clr : null,
      scopeNodeId: last.nodeId,
      farmerId: last.farmerId,
    );
  } on ApiException catch (e) {
    if (e.statusCode != 404) rethrow;
    return null; // chart since deactivated — hide the "last rate" strip
  }
});

/// The resolved farmer's own master row. When an admin is "viewing as" a farmer
/// this is that farmer; otherwise the server scopes to the signed-in farmer.
/// Drives the profile header (friendly code as Farmer ID, member-since).
final farmerSelfProvider = FutureProvider<MpFarmer?>((ref) async {
  final viewAs = ref.watch(mpViewAsFarmerProvider);
  if (viewAs != null) return viewAs;
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
  // `>= 1` is load-bearing, not defensive noise: _monthCycles steps by n, so a 0
  // would spin forever and hang the app. The API caps it at 1–31, but a hand-run
  // SQL update on the settings row bypasses that.
  if (n != null && n >= 1) {
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
  return mpRepo.pours(
      farmerId: ref.watch(_farmerScopeId), from: p.start, to: p.end, status: 'recorded', limit: 500);
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

/// The signed-in farmer's recorded pours over the last [days] — backs their
/// quality report. Deliberately the plain farmer-scoped pours list, not the
/// /reports rollup: that endpoint exists because a VMCC pools thousands of
/// pours, whereas one farmer's 90 days is ~180 rows, and QcReportView already
/// buckets samples into qty-weighted days itself. Keeps farmers off the report
/// routes entirely.
final farmerQcPoursProvider =
    FutureProvider.family<List<MpPour>, int>((ref, days) async {
  return mpRepo.pours(
    farmerId: ref.watch(_farmerScopeId),
    from: isoDaysAgo(days - 1),
    to: todayIso(),
    status: 'recorded',
    limit: 500,
  );
});
