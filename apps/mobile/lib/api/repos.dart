import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'api_client.dart';
import 'api_config.dart';
import 'models.dart';

Map<String, dynamic> _data(dynamic res) {
  if (res is Map && res['data'] is Map) return (res['data'] as Map).cast<String, dynamic>();
  if (res is Map) return res.cast<String, dynamic>();
  return {};
}

List<Map<String, dynamic>> _dataList(dynamic res) {
  if (res is Map && res['data'] is List) return (res['data'] as List).cast<Map<String, dynamic>>();
  if (res is List) return res.cast<Map<String, dynamic>>();
  return [];
}

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class DashboardRepo {
  Future<DashboardSummary> summary() async {
    final res = await apiClient.get('/dashboard/summary');
    return DashboardSummary.fromJson(_data(res));
  }

  Future<CashTrend> cashTrend({int days = 14}) async {
    final res = await apiClient.get('/dashboard/cash-trend?days=$days');
    return CashTrend.fromJson(_data(res));
  }

  Future<GstReadiness?> gstReadiness() async {
    try {
      final res = await apiClient.get('/gst/readiness');
      return GstReadiness.fromJson(_data(res));
    } on ApiException {
      return null;
    }
  }

  Future<List<ActivityEntry>> activity({int limit = 20}) async {
    final res = await apiClient.get('/dashboard/activity?limit=$limit');
    return _dataList(res).map(ActivityEntry.fromJson).toList();
  }
}

class InvoicesRepo {
  Future<InvoiceSummary> summary() async {
    final res = await apiClient.get('/ar/invoices/summary');
    return InvoiceSummary.fromJson(_data(res));
  }

  Future<PaginatedResponse<Invoice>> list({
    String? status,
    String? search,
    DateTime? dateFrom,
    DateTime? dateTo,
    int page = 1,
    int limit = 50,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    if (search != null && search.isNotEmpty) qp['search'] = search;
    if (dateFrom != null) qp['dateFrom'] = _isoDate(dateFrom);
    if (dateTo != null) qp['dateTo'] = _isoDate(dateTo);
    final res = await apiClient.get('/ar/invoices?${Uri(queryParameters: qp).query}');
    return PaginatedResponse.fromJson((res as Map).cast<String, dynamic>(), Invoice.fromJson);
  }

  Future<InvoiceWithDetails> detail(String id) async {
    final res = await apiClient.get('/ar/invoices/$id');
    return InvoiceWithDetails.fromJson(_data(res));
  }

  Future<List<InvoiceReceipt>> receipts(String id) async {
    final res = await apiClient.get('/ar/invoices/$id/receipts');
    return _dataList(res).map(InvoiceReceipt.fromJson).toList();
  }

  Future<void> send(String id, {String? channel, String? note}) async {
    await apiClient.post('/ar/invoices/$id/send', {
      if (channel != null) 'channel': channel,
      if (note != null) 'note': note,
    });
  }

  Future<void> markPaid(String id, {required double amount, required String paymentMethod, String? referenceNumber, DateTime? receiptDate}) async {
    await apiClient.post('/ar/invoices/$id/mark-paid', {
      'amount': amount,
      'paymentMethod': paymentMethod,
      if (referenceNumber != null) 'referenceNumber': referenceNumber,
      'receiptDate': (receiptDate ?? DateTime.now()).toIso8601String().substring(0, 10),
    });
  }
}

class BillsRepo {
  Future<BillsSummary> summary() async {
    final res = await apiClient.get('/ap/purchase-invoices/summary');
    return BillsSummary.fromJson(_data(res));
  }

  Future<PaginatedResponse<Bill>> list({
    String? status,
    String? search,
    DateTime? dateFrom,
    DateTime? dateTo,
    int page = 1,
    int limit = 50,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (status != null && status.isNotEmpty) qp['status'] = status;
    if (search != null && search.isNotEmpty) qp['search'] = search;
    if (dateFrom != null) qp['dateFrom'] = _isoDate(dateFrom);
    if (dateTo != null) qp['dateTo'] = _isoDate(dateTo);
    final res = await apiClient.get('/ap/purchase-invoices?${Uri(queryParameters: qp).query}');
    return PaginatedResponse.fromJson((res as Map).cast<String, dynamic>(), Bill.fromJson);
  }

  Future<BillWithDetails> detail(String id) async {
    final res = await apiClient.get('/ap/purchase-invoices/$id');
    return BillWithDetails.fromJson(_data(res));
  }

  Future<ExtractedBill> extract(File file) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/ap/purchase-invoices/extract');
    final req = http.MultipartRequest('POST', uri);
    if (apiClient.token != null) req.headers['Authorization'] = 'Bearer ${apiClient.token}';
    req.files.add(await http.MultipartFile.fromPath('file', file.path));
    final streamed = await req.send().timeout(const Duration(seconds: 90));
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(statusCode: res.statusCode, message: 'Extraction failed', body: _safeJson(res.body));
    }
    return ExtractedBill.fromJson(_data(jsonDecode(res.body)));
  }

  Future<Map<String, dynamic>> commitScan(Map<String, dynamic> extracted, {String? vendorId}) async {
    final res = await apiClient.post('/ap/purchase-invoices/scan-commit', {
      'extracted': extracted,
      if (vendorId != null) 'vendorId': vendorId,
    });
    return _data(res);
  }
}

class BankingRepo {
  Future<List<BankAccount>> accounts() async {
    final res = await apiClient.get('/banking/accounts');
    return _dataList(res).map(BankAccount.fromJson).toList();
  }

  Future<PaginatedResponse<BankTxn>> transactions(String accountId, {int page = 1, int limit = 50, String? reconStatus}) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (reconStatus != null) qp['reconStatus'] = reconStatus;
    final res = await apiClient.get('/banking/accounts/$accountId/transactions?${Uri(queryParameters: qp).query}');
    return PaginatedResponse.fromJson((res as Map).cast<String, dynamic>(), BankTxn.fromJson);
  }

  Future<int> categorize(String accountId) async {
    final res = await apiClient.post('/banking/accounts/$accountId/categorize');
    final data = _data(res);
    return ((data['rulesMatched'] as num?)?.toInt() ?? 0) + ((data['aiMatched'] as num?)?.toInt() ?? 0);
  }
}

class ApprovalsRepo {
  Future<List<ApprovalInstance>> pending() async {
    final res = await apiClient.get('/workflows/pending-approvals');
    return _dataList(res).map(ApprovalInstance.fromJson).toList();
  }

  Future<void> decide({required String stepId, required String instanceId, required bool approve, String? comment}) async {
    await apiClient.put('/workflows/steps/$stepId/decide?instanceId=$instanceId', {
      'decision': approve ? 'approved' : 'rejected',
      if (comment != null) 'comment': comment,
    });
  }
}

class AgentRepo {
  Stream<AgentEvent> chat({required List<Map<String, String>> messages, required String token}) async* {
    final uri = Uri.parse('${ApiConfig.baseUrl}/agent/chat');
    final req = http.Request('POST', uri)
      ..headers['Content-Type'] = 'application/json'
      ..headers['Authorization'] = 'Bearer $token'
      ..headers['Accept'] = 'text/event-stream'
      ..body = jsonEncode({'messages': messages});

    final streamed = await req.send();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      throw ApiException(statusCode: streamed.statusCode, message: 'Agent request failed (${streamed.statusCode})');
    }
    var buffer = '';
    await for (final chunk in streamed.stream.transform(utf8.decoder)) {
      buffer += chunk;
      final lines = buffer.split('\n');
      buffer = lines.removeLast();
      for (final raw in lines) {
        final line = raw.trim();
        if (!line.startsWith('data: ')) continue;
        final json = line.substring(6).trim();
        if (json.isEmpty) continue;
        try {
          yield AgentEvent.fromJson(jsonDecode(json) as Map<String, dynamic>);
        } catch (_) {/* skip malformed */}
      }
    }
    if (buffer.trim().startsWith('data: ')) {
      try {
        yield AgentEvent.fromJson(jsonDecode(buffer.trim().substring(6)) as Map<String, dynamic>);
      } catch (_) {}
    }
  }
}

class AgentEvent {
  final String type;
  final String? text, toolName, summary, message;
  AgentEvent({required this.type, this.text, this.toolName, this.summary, this.message});

  factory AgentEvent.fromJson(Map<String, dynamic> j) => AgentEvent(
        type: (j['type'] ?? 'unknown').toString(),
        text: j['text'] as String?,
        toolName: j['toolName'] as String?,
        summary: j['summary'] as String?,
        message: j['message'] as String?,
      );
}

Map<String, dynamic>? _safeJson(String s) {
  try {
    final v = jsonDecode(s);
    return v is Map<String, dynamic> ? v : null;
  } catch (_) {
    return null;
  }
}

final dashboardRepo = DashboardRepo();
final invoicesRepo = InvoicesRepo();
final billsRepo = BillsRepo();
final bankingRepo = BankingRepo();
final approvalsRepo = ApprovalsRepo();
final agentRepo = AgentRepo();
