import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/screens/inventory/widgets/item_jump_rail.dart';

void main() {
  group('jumpTickFor', () {
    test('takes the initials of the first two words', () {
      expect(jumpTickFor('Cold Pressed Oils'), 'CP');
    });

    test('punctuation never claims a letter', () {
      expect(jumpTickFor('Milk & Dairy'), 'MD');
      expect(jumpTickFor('Oils / Fats'), 'OF');
      expect(jumpTickFor('Ready-To-Eat'), 'RT');
    });

    test('filler words are skipped', () {
      expect(jumpTickFor('Spices and Masala'), 'SM');
      expect(jumpTickFor('Ghee of India'), 'GI');
    });

    test('a single word gives its first two letters', () {
      expect(jumpTickFor('Ghee'), 'GH');
    });

    test('a one-letter name is left as itself', () {
      expect(jumpTickFor('A'), 'A');
    });

    test('an all-filler name still gets a tick', () {
      expect(jumpTickFor('The And'), 'TA');
    });

    test('nothing usable falls back rather than throwing', () {
      expect(jumpTickFor('&&&'), '?');
      expect(jumpTickFor('   '), '?');
    });

    test('digits are allowed to lead', () {
      expect(jumpTickFor('5L Packs'), '5P');
    });

    test('names that share a first letter stay distinguishable', () {
      expect(jumpTickFor('Dairy'), isNot(jumpTickFor('Dry Goods')));
    });
  });
}
