import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/api/mp_models.dart';
import 'package:dhenu/providers/farmer_providers.dart';

void main() {
  test('15-day cadence labels the current cycle 16-31 Jul on 17 Jul 2026', () {
    final p = buildCyclePeriods(
      const MpCycleConfig(cycleDays: 15, cycleAnchorDate: '2026-06-01'),
      DateTime(2026, 7, 17),
      6,
    );
    expect(p.first.label, '16–31 Jul');
    expect(p.first.start, '2026-07-16');
    expect(p.first.end, '2026-07-31');
  });

  test('no cadence falls back to the month label', () {
    final p = buildCyclePeriods(const MpCycleConfig(), DateTime(2026, 7, 17), 6);
    expect(p.first.label, 'Jul 2026');
  });
}
