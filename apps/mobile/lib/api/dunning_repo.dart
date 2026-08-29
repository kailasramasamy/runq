import 'api_client.dart';
import 'dunning_models.dart';

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) {
    return (res['data'] as Map).cast<String, dynamic>();
  }
  if (res is Map) return res.cast<String, dynamic>();
  return {};
}

List<Map<String, dynamic>> _dataList(dynamic res) {
  if (res is Map && res['data'] is List) {
    return (res['data'] as List).cast<Map<String, dynamic>>();
  }
  if (res is List) return res.cast<Map<String, dynamic>>();
  return [];
}

class DunningRepo {
  /// Every invoice with a balance, due or not — so the aging screen's total
  /// reconciles with the Receivables KPI. `daysOverdue` comes back negative
  /// for the not-yet-due ones.
  Future<List<OverdueInvoice>> open() async {
    final res = await apiClient.get('/ar/dunning/open');
    return _dataList(res).map(OverdueInvoice.fromJson).toList();
  }

  Future<List<DunningRule>> rules() async {
    final res = await apiClient.get('/ar/dunning/rules');
    return _dataList(res).map(DunningRule.fromJson).toList();
  }

  Future<RenderedDunningMessage> render({
    required String customerId,
    required String channel,
  }) async {
    final res = await apiClient.post('/ar/dunning/render', {
      'customerId': customerId,
      'channel': channel,
    });
    return RenderedDunningMessage.fromJson(_data(res));
  }

  /// Queues a dunning send. The API logs each row, kicks off delivery in the
  /// background, and returns immediately — actual send/failure outcomes are
  /// recorded later on the dunning_log row, not in this response. Callers
  /// should treat a successful return as "queued for delivery", not "sent".
  Future<ReminderResult> sendReminders({
    required List<String> invoiceIds,
    required String ruleId,
    String channel = 'email',
  }) async {
    final res = await apiClient.post('/ar/dunning/send-reminders', {
      'invoiceIds': invoiceIds,
      'ruleId': ruleId,
      'channel': channel,
    });
    return ReminderResult.fromJson(_data(res));
  }
}

class ReminderResult {
  final int logged;
  final int queued;
  const ReminderResult({required this.logged, required this.queued});

  factory ReminderResult.fromJson(Map<String, dynamic> j) => ReminderResult(
        logged: (j['logged'] as num?)?.toInt() ?? 0,
        queued: (j['queued'] as num?)?.toInt() ?? 0,
      );
}

final dunningRepo = DunningRepo();
