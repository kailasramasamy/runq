// The collections screen must total the same receivables figure as the Money
// hub's KPI: everything outstanding, not just the overdue slice. These guard
// the split that makes those two numbers reconcile.

import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/api/dunning_models.dart';

OverdueInvoice _inv(String id, double balance, int daysOverdue,
        {String customer = 'c1'}) =>
    OverdueInvoice(
      id: id,
      invoiceNumber: id,
      customerId: customer,
      customerName: customer,
      customerPhone: null,
      customerEmail: null,
      dueDate: DateTime(2026, 8, 29).subtract(Duration(days: daysOverdue)),
      totalAmount: balance,
      balanceDue: balance,
      daysOverdue: daysOverdue,
    );

void main() {
  test('not-yet-due invoices land in the current bucket, not 1-30', () {
    final buckets = ArAgingBuckets.from([
      _inv('not-due', 100, -6),
      _inv('due-today', 50, 0),
      _inv('late', 20, 12),
      _inv('older', 5, 45),
      _inv('ancient', 1, 200),
    ]);

    expect(buckets.current, 150); // -6d and 0d are both within terms
    expect(buckets.bucket1to30, 20);
    expect(buckets.bucket31to60, 5);
    expect(buckets.bucket90plus, 1);
    // The hero total has to equal the KPI, so every rupee lands in a bucket.
    expect(buckets.total, 176);
  });

  test('a customer within terms is not chaseable', () {
    final within = CustomerArAging.group([_inv('a', 100, -3)]).single;
    expect(within.totalDue, 100);
    expect(within.overdueDue, 0);
    expect(within.hasOverdue, isFalse);
    expect(within.worstDaysOverdue, 0);

    final mixed =
        CustomerArAging.group([_inv('a', 100, -3), _inv('b', 40, 9)]).single;
    expect(mixed.totalDue, 140);
    expect(mixed.overdueDue, 40); // only the late invoice can be chased
    expect(mixed.hasOverdue, isTrue);
    expect(mixed.worstDaysOverdue, 9);
  });
}
