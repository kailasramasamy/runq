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

  group('QualityBands.worstLevel (aggregate rows)', () {
    test('takes the most severe band across fat/snf', () {
      // good fat + low snf → low (worst wins)
      expect(bands.worstLevel(MilkType.cowA1, fat: 4.5, snf: 7.4), QualityLevel.low);
      // good fat + watch snf → watch
      expect(bands.worstLevel(MilkType.cowA1, fat: 4.5, snf: 8.1), QualityLevel.watch);
      // both good → good
      expect(bands.worstLevel(MilkType.cowA1, fat: 4.5, snf: 8.9), QualityLevel.good);
    });

    test('ignores metrics with no band, null when none apply', () {
      // buffalo only has a fat band here → snf ignored
      expect(bands.worstLevel(MilkType.buffalo, fat: 5.6, snf: 7.0), QualityLevel.watch);
      expect(bands.worstLevel(MilkType.mixed, fat: 4.0, snf: 8.0), isNull);
    });
  });

  group('MpNode.effectiveMilkType', () {
    MpNode node({MilkType? def, List<MilkType>? allowed}) => MpNode(
        id: 'n', code: 'c', name: 'n', nodeType: 'vmcc',
        defaultMilkType: def, allowedMilkTypes: allowed);

    test('prefers explicit default, then sole allowed, then Cow A1', () {
      expect(node(def: MilkType.buffalo).effectiveMilkType, MilkType.buffalo);
      expect(node(allowed: [MilkType.buffalo]).effectiveMilkType, MilkType.buffalo);
      expect(node().effectiveMilkType, MilkType.cowA1);
    });
  });
}
