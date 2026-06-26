import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/api/mp_models.dart';

void main() {
  // Cow A1 bands: FAT 4.0/3.5, SNF 8.5/8.0; buffalo richer to prove the lookup
  // is milk-type keyed, not global.
  final bands = QualityBands.fromJson({
    'cow_a1': {
      'fat': {'goodMin': 4.0, 'watchMin': 3.5},
      'snf': {'goodMin': 8.5, 'watchMin': 8.0},
    },
    'buffalo': {
      'fat': {'goodMin': 6.0, 'watchMin': 5.5},
    },
  });

  group('QualityBands.levelFor', () {
    test('good at/above goodMin', () {
      expect(bands.levelFor(MilkType.cowA1, 'fat', 4.0), QualityLevel.good);
      expect(bands.levelFor(MilkType.cowA1, 'snf', 8.7), QualityLevel.good);
    });

    test('watch between watchMin and goodMin', () {
      expect(bands.levelFor(MilkType.cowA1, 'fat', 3.6), QualityLevel.watch);
      expect(bands.levelFor(MilkType.cowA1, 'snf', 8.0), QualityLevel.watch);
    });

    test('low below watchMin', () {
      expect(bands.levelFor(MilkType.cowA1, 'snf', 7.4), QualityLevel.low);
    });

    test('is milk-type aware: buffalo fat 5.6 is watch, cow same value is good', () {
      expect(bands.levelFor(MilkType.buffalo, 'fat', 5.6), QualityLevel.watch);
      expect(bands.levelFor(MilkType.cowA1, 'fat', 5.6), QualityLevel.good);
    });

    test('null when no band is configured (no coloring)', () {
      expect(bands.levelFor(MilkType.buffalo, 'snf', 9.0), isNull);
      expect(bands.levelFor(MilkType.mixed, 'fat', 4.0), isNull);
      expect(QualityBands.empty.levelFor(MilkType.cowA1, 'fat', 4.0), isNull);
    });
  });
}
