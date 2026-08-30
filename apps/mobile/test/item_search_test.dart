import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/utils/item_search.dart';

typedef _Row = ({String name, String? sku});

List<String> _names(List<_Row> rows, String q) => [
  for (final r in rankedItemMatches(
    rows,
    q,
    name: (r) => r.name,
    sku: (r) => r.sku,
  ))
    r.name,
];

void main() {
  group('itemMatchRank', () {
    test('non-matching query returns null', () {
      expect(itemMatchRank(name: 'Desi Ghee', sku: 'DG1', query: 'paneer'),
          isNull);
    });

    test('every word must land, in any order', () {
      expect(itemMatchRank(name: 'Milk Cow A2 1L', sku: null, query: 'cow milk'),
          isNotNull);
      expect(itemMatchRank(name: 'Milk Cow A2 1L', sku: null, query: 'cow goat'),
          isNull);
    });

    test('a word may land on the SKU instead of the name', () {
      expect(itemMatchRank(name: 'Desi Ghee', sku: 'GH-500', query: 'ghee 500'),
          isNotNull);
    });

    test('exact SKU outranks every name match', () {
      final sku = itemMatchRank(name: 'Curd Pouch', sku: 'dg1', query: 'dg1')!;
      final name = itemMatchRank(name: 'Dg1', sku: null, query: 'dg1')!;
      expect(sku, lessThan(name));
    });

    test('prefix outranks a mid-word hit', () {
      final prefix = itemMatchRank(name: 'Ghee Jar', sku: null, query: 'ghee')!;
      final mid = itemMatchRank(name: 'Fresh Ghee', sku: null, query: 'ghee')!;
      expect(prefix, lessThan(mid));
    });

    test('initials match a single-word query', () {
      expect(itemMatchRank(name: 'Desi Ghee Bottle', sku: null, query: 'dgb'),
          isNotNull);
    });

    test('initials are not tried once the query has a space', () {
      expect(itemMatchRank(name: 'Desi Ghee Bottle', sku: null, query: 'd gb'),
          isNull);
    });

    test('single letter is too short for an initials match', () {
      expect(itemMatchRank(name: 'Desi Ghee Bottle', sku: null, query: 'z'),
          isNull);
    });

    test('case and stray whitespace are ignored', () {
      expect(itemMatchRank(name: 'Desi  Ghee', sku: null, query: '  DESI ghee '),
          isNotNull);
    });
  });

  group('rankedItemMatches', () {
    final rows = <_Row>[
      (name: 'Fresh Ghee Jar', sku: 'FGJ'),
      (name: 'Ghee 500ml', sku: 'GH500'),
      (name: 'Amul Ghee', sku: 'AG1'),
      (name: 'Paneer 200g', sku: 'PN200'),
    ];

    test('orders prefix before word-start before contains', () {
      expect(_names(rows, 'ghee'), [
        'Ghee 500ml', // name prefix
        'Amul Ghee', // word start, alphabetical against the next
        'Fresh Ghee Jar',
      ]);
    });

    test('drops non-matches', () {
      expect(_names(rows, 'ghee'), isNot(contains('Paneer 200g')));
    });

    test('an exact SKU comes first', () {
      expect(_names(rows, 'gh500').first, 'Ghee 500ml');
    });

    test('empty query is a pass-through in the original order', () {
      expect(_names(rows, '   '), [for (final r in rows) r.name]);
    });

    test('ties inside a band break on name, not input order', () {
      final shuffled = <_Row>[
        (name: 'Zeta Ghee', sku: null),
        (name: 'Alpha Ghee', sku: null),
      ];
      expect(_names(shuffled, 'ghee'), ['Alpha Ghee', 'Zeta Ghee']);
    });
  });
}
