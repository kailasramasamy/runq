import 'api_client.dart';
import 'to_pay_models.dart';

class ToPayRepo {
  /// [month] is 'YYYY-MM'; null returns everything still outstanding.
  Future<ToPay> fetch({String? month}) async {
    final res = await apiClient.get(month == null ? '/to-pay' : '/to-pay?month=$month');
    final body = res is Map && res['data'] is Map ? res['data'] : res;
    return ToPay.fromJson(body is Map ? body.cast<String, dynamic>() : {});
  }
}

final toPayRepo = ToPayRepo();

/// One farmer's line in a milk payout cycle, as the To-pay breakdown shows it.
class MilkPayee {
  final String name, code, vmccNodeId;
  final String? vmccName;
  final double net;
  final bool paid;
  const MilkPayee({
    required this.name, required this.code, required this.vmccNodeId,
    required this.net, required this.paid, this.vmccName,
  });
}

/// A cycle's farmer lines. A line is paid once stamped or tied to a payment;
/// lines settled through a VMCC bill are reported as [viaBill].
Future<List<({MilkPayee payee, bool viaBill})>> fetchMilkCyclePayees(String cycleId) async {
  final res = await apiClient.get('/milk-procurement/payouts/cycles/$cycleId');
  final body = res is Map && res['data'] is Map ? res['data'] as Map : const {};
  final cyclePaid = body['status'] == 'paid';
  return [
    for (final l in (body['lines'] as List? ?? const []))
      if (l is Map)
        (
          payee: MilkPayee(
            name: (l['farmerName'] ?? '').toString(),
            code: (l['farmerCode'] ?? '').toString(),
            vmccNodeId: (l['vmccNodeId'] ?? '').toString(),
            vmccName: l['vmccName']?.toString(),
            net: double.tryParse('${l['netAmount']}') ?? 0,
            paid: cyclePaid || l['paidAt'] != null || l['paymentId'] != null,
          ),
          viaBill: l['billId'] != null,
        ),
  ];
}
