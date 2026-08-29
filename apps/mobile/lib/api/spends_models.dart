// Money out, from the two places it can be known: the bank statement, and
// payments captured in the app that the statement hasn't caught up with yet.
library;

import 'reports_models.dart' show numAt, strAt;

class Spend {
  final String id;

  /// 'bank' — on the statement. 'pending' — captured here, awaiting a match.
  final String source;
  final DateTime date;
  final double amount;

  /// Who it went to: vendor, payee, or the bank's own narration.
  final String title;

  /// GL category when reconciliation has assigned one, else the memo/note.
  final String? category;
  final String accountName;
  final String? reference;
  final bool reconciled;

  const Spend({
    required this.id,
    required this.source,
    required this.date,
    required this.amount,
    required this.title,
    required this.category,
    required this.accountName,
    required this.reference,
    required this.reconciled,
  });

  bool get isAwaiting => source == 'pending';

  factory Spend.fromJson(Map<String, dynamic> j) => Spend(
        id: strAt(j['id']) ?? '',
        source: strAt(j['source']) ?? 'bank',
        date: DateTime.tryParse(strAt(j['date']) ?? '') ?? DateTime.now(),
        amount: numAt(j['amount']),
        title: strAt(j['title']) ?? 'Payment',
        category: strAt(j['category']),
        accountName: strAt(j['accountName']) ?? '',
        reference: strAt(j['reference']),
        reconciled: j['reconciled'] == true,
      );
}

/// One page plus the totals for the *whole* filtered set — the header has to
/// state the full spend for the range, not the slice scrolled so far.
class SpendsPage {
  final List<Spend> items;
  final int total;
  final double settled, awaiting;

  const SpendsPage({
    required this.items,
    required this.total,
    required this.settled,
    required this.awaiting,
  });

  double get grandTotal => settled + awaiting;

  factory SpendsPage.fromJson(Map<String, dynamic> j) {
    final data = (j['data'] as List? ?? const [])
        .map((e) => Spend.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
    final meta = (j['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
    final totals = (j['totals'] as Map?)?.cast<String, dynamic>() ?? const {};
    return SpendsPage(
      items: data,
      total: (meta['total'] as num?)?.toInt() ?? data.length,
      settled: numAt(totals['settled']),
      awaiting: numAt(totals['awaiting']),
    );
  }
}
