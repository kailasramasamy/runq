import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/api/mp_models.dart';
import 'package:dhenu/screens/farmer/farmer_insights.dart';

String _daysAgo(DateTime today, int n) {
  final d = today.subtract(Duration(days: n));
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

MpPour _pour(String date, double qty, double line, {double? fat, double? snf}) => MpPour(
      id: date,
      nodeId: 'n',
      farmerId: 'f',
      collectionDate: date,
      shift: Shift.am,
      milkType: MilkType.cowA1,
      qtyLitres: qty,
      ratePerLitre: line / qty,
      lineAmount: line,
      fat: fat,
      snf: snf,
    );

MpRateCell _cell(double fat, double snf, double rate) =>
    MpRateCell(id: '$fat-$snf', fat: fat, snf: snf, ratePerLitre: rate);

void main() {
  group('projectCycleEarnings', () {
    test('run-rates mid-cycle to the window end', () {
      final proj = projectCycleEarnings(
        pours: [_pour('2026-06-01', 50, 500), _pour('2026-06-02', 50, 500)],
        windowStart: '2026-06-01',
        windowEnd: '2026-06-15', // 15-day window
        today: DateTime(2026, 6, 5), // 5 days elapsed
      );
      expect(proj.earnedSoFar, 1000);
      expect(proj.qtySoFar, 100);
      expect(proj.daysElapsed, 5);
      expect(proj.daysTotal, 15);
      expect(proj.projectedGross, closeTo(3000, 0.001)); // 1000 / 5 * 15
      expect(proj.isProjectable, isTrue);
    });

    test('day 1 still projects (days remain)', () {
      final proj = projectCycleEarnings(
        pours: [_pour('2026-06-01', 40, 400)],
        windowStart: '2026-06-01',
        windowEnd: '2026-06-15',
        today: DateTime(2026, 6, 1),
      );
      expect(proj.daysElapsed, 1);
      expect(proj.projectedGross, closeTo(6000, 0.001)); // 400 * 15
      expect(proj.isProjectable, isTrue);
    });

    test('empty cycle is not projectable', () {
      final proj = projectCycleEarnings(
        pours: const [],
        windowStart: '2026-06-01',
        windowEnd: '2026-06-15',
        today: DateTime(2026, 6, 5),
      );
      expect(proj.qtySoFar, 0);
      expect(proj.isProjectable, isFalse);
    });

    test('closed cycle (today past end) clamps and is not projectable', () {
      final proj = projectCycleEarnings(
        pours: [_pour('2026-06-10', 100, 1000)],
        windowStart: '2026-06-01',
        windowEnd: '2026-06-15',
        today: DateTime(2026, 6, 20),
      );
      expect(proj.daysElapsed, 15);
      expect(proj.daysTotal, 15);
      expect(proj.projectedGross, closeTo(1000, 0.001)); // no extrapolation
      expect(proj.isProjectable, isFalse);
    });
  });

  group('averageDailyQty', () {
    test('total litres over distinct days', () {
      final v = averageDailyQty([
        _pour('2026-06-01', 30, 300),
        _pour('2026-06-01', 10, 100), // same day
        _pour('2026-06-02', 60, 600),
      ]);
      expect(v, closeTo(50, 0.001)); // 100 / 2 days
    });

    test('empty → 0', () => expect(averageDailyQty(const []), 0));
  });

  group('computeRateCoaching', () {
    final cells = [
      _cell(3.5, 8.0, 28),
      _cell(3.5, 8.5, 29),
      _cell(4.0, 8.0, 30),
      _cell(4.0, 8.5, 32),
    ];

    test('values the next FAT and SNF step from the current floor', () {
      final c = computeRateCoaching(cells: cells, curFat: 3.6, curSnf: 8.1, dailyQty: 10)!;
      expect(c.currentRate, 28); // floor (3.5, 8.0)
      expect(c.nextSnf, 8.5);
      expect(c.snfDeltaPerLitre, closeTo(1, 0.001)); // 29 - 28
      expect(c.snfDailyGain, closeTo(10, 0.001));
      expect(c.nextFat, 4.0);
      expect(c.fatDeltaPerLitre, closeTo(2, 0.001)); // 30 - 28
      expect(c.fatDailyGain, closeTo(20, 0.001));
      expect(c.hasAny, isTrue);
    });

    test('top of matrix has no upside', () {
      final c = computeRateCoaching(cells: cells, curFat: 4.0, curSnf: 8.5, dailyQty: 10)!;
      expect(c.snfDeltaPerLitre, isNull);
      expect(c.fatDeltaPerLitre, isNull);
      expect(c.hasAny, isFalse);
    });

    test('empty cells → null', () {
      expect(computeRateCoaching(cells: const [], curFat: 4, curSnf: 8.5, dailyQty: 10), isNull);
    });

    test('below the lowest cell → null (unpriced)', () {
      expect(computeRateCoaching(cells: cells, curFat: 3.0, curSnf: 7.5, dailyQty: 10), isNull);
    });
  });

  group('detectQualityNudge', () {
    final today = DateTime(2026, 6, 20);
    // prior window readings (7–13 days ago) at FAT 4.0, recent (0–6 days) at 3.6.
    List<MpPour> withFat(double priorFat, double recentFat) => [
          _pour(_daysAgo(today, 10), 10, 300, fat: priorFat, snf: 8.5),
          _pour(_daysAgo(today, 8), 10, 300, fat: priorFat, snf: 8.5),
          _pour(_daysAgo(today, 3), 10, 300, fat: recentFat, snf: 8.5),
          _pour(_daysAgo(today, 1), 10, 300, fat: recentFat, snf: 8.5),
        ];

    test('flags a FAT drop past threshold', () {
      final n = detectQualityNudge(pours: withFat(4.0, 3.6), today: today)!;
      expect(n.metric, 'FAT');
      expect(n.improved, isFalse);
      expect(n.delta, closeTo(-0.4, 0.001));
    });

    test('flags an improvement (up)', () {
      final n = detectQualityNudge(pours: withFat(3.5, 4.0), today: today)!;
      expect(n.metric, 'FAT');
      expect(n.improved, isTrue);
      expect(n.delta, closeTo(0.5, 0.001));
    });

    test('no nudge when change is below threshold', () {
      expect(detectQualityNudge(pours: withFat(4.0, 3.95), today: today), isNull);
    });

    test('no nudge without enough readings each side', () {
      final pours = [
        _pour(_daysAgo(today, 10), 10, 300, fat: 4.0, snf: 8.5), // only 1 prior
        _pour(_daysAgo(today, 2), 10, 300, fat: 3.5, snf: 8.5),
        _pour(_daysAgo(today, 1), 10, 300, fat: 3.5, snf: 8.5),
      ];
      expect(detectQualityNudge(pours: pours, today: today), isNull);
    });

    test('CLR-only pours (no fat/snf) yield no nudge', () {
      final pours = List.generate(
          4, (i) => _pour(_daysAgo(today, i * 3 + 1), 10, 300)); // fat/snf null
      expect(detectQualityNudge(pours: pours, today: today), isNull);
    });
  });
}
