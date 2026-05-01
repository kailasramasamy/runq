import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'api_client.dart';
import 'api_config.dart';
import 'models.dart';

// Sentinel for "field not provided" in PATCH bodies — lets a caller pass
// `null` to mean "clear this field" without colliding with "leave alone".
const Object _unset = Object();

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

  /// Mark an invoice paid. The API server currently hardcodes the receipt's
  /// `paymentMethod` to 'bank_transfer' (DB enum is single-valued), so the
  /// user-picked method is stashed into `notes` to preserve intent until the
  /// schema grows real method values.
  Future<void> markPaid(
    String id, {
    required String paymentMethod,
    String? referenceNumber,
    DateTime? paymentDate,
  }) async {
    const labels = {
      'upi': 'UPI',
      'bank_transfer': 'Bank transfer',
      'cash': 'Cash',
      'cheque': 'Cheque',
      'card': 'Card',
    };
    final label = labels[paymentMethod] ?? paymentMethod;
    final note = referenceNumber == null || referenceNumber.isEmpty
        ? 'Paid via $label'
        : 'Paid via $label · ref $referenceNumber';
    await apiClient.post('/ar/invoices/$id/mark-paid', {
      'paymentDate': (paymentDate ?? DateTime.now()).toIso8601String().substring(0, 10),
      if (referenceNumber != null) 'referenceNumber': referenceNumber,
      'notes': note,
    });
  }

  /// Soft-cancel a draft invoice. Sets status='cancelled'; keeps the row for
  /// audit. Mirrors admin's "Discard". Allowed only on draft.
  Future<void> discard(String id) async {
    await apiClient.delete('/ar/invoices/$id');
  }

  /// Hard delete — physically removes the row. Allowed only on draft +
  /// cancelled and only when no receipts/credit notes/GL postings reference
  /// it; the API enforces both checks.
  Future<void> hardDelete(String id) async {
    await apiClient.delete('/ar/invoices/$id/hard');
  }

  /// UPI deep link + QR payload for the outstanding balance. Throws if the
  /// tenant hasn't configured a UPI ID in settings.
  Future<UpiLinkData> upiLink(String id) async {
    final res = await apiClient.get('/ar/invoices/$id/upi-link');
    return UpiLinkData.fromJson(_data(res));
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

  /// Partial update for a draft bill. Server PUT accepts any subset of
  /// (invoiceNumber, invoiceDate, dueDate, items, subtotal, taxAmount,
  /// totalAmount, notes, reverseCharge, tdsSection). Restricted to draft
  /// status server-side; we mirror that constraint in the UI.
  Future<BillWithDetails> update(
    String id, {
    String? invoiceNumber,
    DateTime? invoiceDate,
    DateTime? dueDate,
    List<Map<String, dynamic>>? items,
    double? subtotal,
    double? taxAmount,
    double? totalAmount,
    String? notes,
    bool? reverseCharge,
    String? tdsSection,
  }) async {
    final body = <String, dynamic>{};
    if (invoiceNumber != null) body['invoiceNumber'] = invoiceNumber;
    if (invoiceDate != null) body['invoiceDate'] = _isoDate(invoiceDate);
    if (dueDate != null) body['dueDate'] = _isoDate(dueDate);
    if (items != null) body['items'] = items;
    if (subtotal != null) body['subtotal'] = subtotal;
    if (taxAmount != null) body['taxAmount'] = taxAmount;
    if (totalAmount != null) body['totalAmount'] = totalAmount;
    if (notes != null) body['notes'] = notes;
    if (reverseCharge != null) body['reverseCharge'] = reverseCharge;
    if (tdsSection != null) body['tdsSection'] = tdsSection;
    final res = await apiClient.put('/ap/purchase-invoices/$id', body);
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

  /// Commit a (possibly user-edited) extracted bill. Pass the original
  /// `aiOutput` from [extract] so the server can record the user's
  /// correction diff for downstream learning. Pass [extractionId] so the
  /// server can bind the staged S3 file to the new bill as an attachment.
  Future<Map<String, dynamic>> commitScan(
    Map<String, dynamic> extracted, {
    String? vendorId,
    Map<String, dynamic>? aiOutput,
    String? extractionId,
  }) async {
    final res = await apiClient.post('/ap/purchase-invoices/scan-commit', {
      'extracted': extracted,
      if (vendorId != null) 'vendorId': vendorId,
      if (aiOutput != null) 'aiOutput': aiOutput,
      if (extractionId != null) 'extractionId': extractionId,
    });
    return _data(res);
  }

  /// Approve a draft bill — moves it from draft to approved status,
  /// posts to GL, and makes it eligible for payment.
  Future<void> approve(String id) async {
    await apiClient.post('/ap/purchase-invoices/$id/approve', const {});
  }

  /// Delete a bill. Server dispatches based on status:
  ///   - draft → permanent removal (bill, items, attached scanned file)
  ///   - anything else → soft cancel (status flip, audit preserved)
  Future<void> remove(String id) async {
    await apiClient.delete('/ap/purchase-invoices/$id');
  }

  /// Run duplicate detection against existing bills for the same vendor.
  /// Returns matches grouped by reason (exact invoice #, similar amount/date,
  /// same amount within 30 days). Empty list = no duplicates found.
  Future<List<DuplicateMatch>> checkDuplicates({
    required String vendorId,
    required String invoiceNumber,
    required DateTime invoiceDate,
    required double totalAmount,
  }) async {
    final res = await apiClient.post('/ap/purchase-invoices/check-duplicates', {
      'vendorId': vendorId,
      'invoiceNumber': invoiceNumber,
      'invoiceDate': _isoDate(invoiceDate),
      'totalAmount': totalAmount,
    });
    final matches = _data(res)['matches'] as List? ?? const [];
    return matches.cast<Map<String, dynamic>>().map(DuplicateMatch.fromJson).toList();
  }

  /// Attachments (the original scanned PDF/image) bound to a bill.
  Future<List<BillAttachment>> attachments(String billId) async {
    final res = await apiClient.get('/common/attachments/purchase_invoice/$billId');
    return _dataList(res).map(BillAttachment.fromJson).toList();
  }

  /// Download an attachment's raw bytes via the authenticated download
  /// endpoint. Caller is responsible for writing to disk / opening.
  Future<List<int>> downloadAttachment(String id) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/common/attachments/$id/download');
    final headers = <String, String>{};
    if (apiClient.token != null) headers['Authorization'] = 'Bearer ${apiClient.token}';
    final res = await http.get(uri, headers: headers);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(statusCode: res.statusCode, message: 'Could not download attachment');
    }
    return res.bodyBytes;
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

class PoRepo {
  Future<PoUpload> upload(File file, {String source = 'share_sheet', Map<String, dynamic>? sourceMetadata}) async {
    final fields = <String, String>{'source': source};
    if (sourceMetadata != null) fields['sourceMetadata'] = jsonEncode(sourceMetadata);
    final res = await apiClient.upload(
      '/ar/po-uploads/',
      file,
      fields: fields,
      mimeType: _guessMime(file.path),
    );
    return PoUpload.fromJson(_data(res));
  }

  Future<PoDraftDetail> getDraft(String uploadId) async {
    final res = await apiClient.get('/ar/po-drafts/$uploadId');
    return PoDraftDetail.fromJson(_data(res));
  }

  Future<PoUpload> getUpload(String uploadId) async {
    final res = await apiClient.get('/ar/po-uploads/$uploadId');
    return PoUpload.fromJson(_data(res));
  }

  Future<PoApproveResult> approve(String uploadId) async {
    final res = await apiClient.post('/ar/po-drafts/$uploadId/approve');
    return PoApproveResult.fromJson(_data(res));
  }

  Future<void> discard(String uploadId) async {
    await apiClient.delete('/ar/po-uploads/$uploadId');
  }

  Future<PoDraftDetail> updateLine(
    String uploadId,
    String lineId, {
    Object? matchedItemId = _unset,
    double? quantity,
    double? rate,
  }) async {
    final body = <String, dynamic>{};
    if (matchedItemId != _unset) body['matchedItemId'] = matchedItemId;
    if (quantity != null) body['quantity'] = quantity;
    if (rate != null) body['rate'] = rate;
    final res = await apiClient.patch('/ar/po-drafts/$uploadId/lines/$lineId', body);
    return PoDraftDetail.fromJson(_data(res));
  }

  Future<List<ItemSummary>> searchItems(String query) async {
    final qp = <String, String>{'limit': '20'};
    if (query.trim().isNotEmpty) qp['search'] = query.trim();
    final res = await apiClient.get('/masters/items?${Uri(queryParameters: qp).query}');
    return _dataList(res).map(ItemSummary.fromJson).toList();
  }

  String? _guessMime(String path) {
    final ext = path.toLowerCase().split('.').last;
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      case 'csv': return 'text/csv';
      case 'txt': return 'text/plain';
      case 'xls': return 'application/vnd.ms-excel';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default: return null;
    }
  }
}

class GstRepo {
  Future<List<GstReturn>> list({String? returnType, String? status}) async {
    final qp = <String, String>{};
    if (returnType != null) qp['returnType'] = returnType;
    if (status != null) qp['status'] = status;
    final q = qp.isEmpty ? '' : '?${Uri(queryParameters: qp).query}';
    final res = await apiClient.get('/gst/returns$q');
    return _dataList(res).map(GstReturn.fromJson).toList();
  }

  Future<GstReturnDetail> get(String id) async {
    final res = await apiClient.get('/gst/returns/$id');
    return GstReturnDetail.fromJson(_data(res));
  }

  Future<GstReturn> generateGstr1(String period) async {
    final res = await apiClient.post('/gst/returns/generate', {'period': period});
    return GstReturn.fromJson(_data(res));
  }

  Future<GstReturn> generateGstr3b(String period) async {
    final res = await apiClient.post('/gst/returns/generate-3b', {'period': period});
    return GstReturn.fromJson(_data(res));
  }

  Future<void> delete(String id) async {
    await apiClient.delete('/gst/returns/$id');
  }

  Future<List<GstReturnError>> validate(String id) async {
    final res = await apiClient.post('/gst/returns/$id/validate', const {});
    final list = _data(res)['errors'] as List? ?? const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(GstReturnError.fromJson)
        .toList();
  }

  Future<GspOtpRequest> requestOtp(String gstin, String username) async {
    final res = await apiClient.post(
      '/gst/auth/request-otp',
      {'gstin': gstin, 'username': username},
    );
    return GspOtpRequest.fromJson(_data(res));
  }

  Future<void> verifyOtp({
    required String gstin,
    required String username,
    required String otp,
    required String txn,
  }) async {
    await apiClient.post('/gst/auth/verify-otp', {
      'gstin': gstin,
      'username': username,
      'otp': otp,
      'txn': txn,
    });
  }

  Future<void> forceLogout(String gstin, String username) async {
    await apiClient.post(
      '/gst/auth/force-logout',
      {'gstin': gstin, 'username': username},
    );
  }

  Future<Map<String, dynamic>> upload(String id) async {
    final ret = await gstRepo.get(id);
    final endpoint = ret.ret.returnType == 'gstr3b'
        ? '/gst/returns/$id/upload-3b'
        : '/gst/returns/$id/upload';
    final res = await apiClient.post(endpoint, const {});
    return _data(res);
  }

  Future<Map<String, dynamic>> file(String id, String evc) async {
    final res = await apiClient.post('/gst/returns/$id/file', {'evc': evc});
    return _data(res);
  }

  Future<void> pull2b(String period) async {
    await apiClient.post('/gst/2b/pull', {'period': period});
  }

  Future<Gstr2bSummary> reconcile2b(String period) async {
    final res = await apiClient.post('/gst/2b/reconcile', {'period': period});
    return Gstr2bSummary.fromJson(_data(res));
  }

  Future<List<Gstr2bMatch>> matches2b(String period, {String? status}) async {
    final qp = <String, String>{'period': period};
    if (status != null) qp['status'] = status;
    final res = await apiClient.get(
      '/gst/2b/matches?${Uri(queryParameters: qp).query}',
    );
    return _dataList(res).map(Gstr2bMatch.fromJson).toList();
  }

  Future<Gstr2bSummary> summary2b(String period) async {
    final res = await apiClient.get('/gst/2b/summary?period=$period');
    return Gstr2bSummary.fromJson(_data(res));
  }
}

final dashboardRepo = DashboardRepo();
final invoicesRepo = InvoicesRepo();
final billsRepo = BillsRepo();
final bankingRepo = BankingRepo();
final approvalsRepo = ApprovalsRepo();
final agentRepo = AgentRepo();
final poRepo = PoRepo();
final gstRepo = GstRepo();
final supportRepo = SupportRepo();

// ── Support agent (in-app help chat) ──────────────────────────────────

class SupportConversationSummary {
  final String id;
  final String? subject;
  final String? preview;
  final String status;
  final DateTime lastMessageAt;
  SupportConversationSummary({
    required this.id,
    required this.subject,
    required this.preview,
    required this.status,
    required this.lastMessageAt,
  });
  factory SupportConversationSummary.fromJson(Map<String, dynamic> j) => SupportConversationSummary(
        id: j['id'] as String,
        subject: j['subject'] as String?,
        preview: j['preview'] as String?,
        status: j['status'] as String,
        lastMessageAt: DateTime.parse(j['lastMessageAt'] as String),
      );
}

class SupportMessage {
  final String id;
  final String role;       // user | agent | human
  final String content;
  final DateTime createdAt;
  SupportMessage({required this.id, required this.role, required this.content, required this.createdAt});
  factory SupportMessage.fromJson(Map<String, dynamic> j) => SupportMessage(
        id: j['id'] as String,
        role: j['role'] as String,
        content: j['content'] as String,
        createdAt: DateTime.parse(j['createdAt'] as String),
      );
}

class SupportStreamEvent {
  final String type;       // conversation | text_delta | tool_use_start | tool_result | escalated | done | error
  final String? text;
  final String? toolName;
  final String? conversationId;
  final String? message;
  final String? summary;
  SupportStreamEvent({required this.type, this.text, this.toolName, this.conversationId, this.message, this.summary});

  factory SupportStreamEvent.fromJson(Map<String, dynamic> j) => SupportStreamEvent(
        type: (j['type'] ?? 'unknown').toString(),
        text: j['text'] as String?,
        toolName: j['toolName'] as String?,
        conversationId: j['id'] as String? ?? (j['result'] is Map ? (j['result'] as Map)['conversationId'] as String? : null),
        message: j['message'] as String?,
        summary: j['summary'] as String?,
      );
}

class SupportRepo {
  Future<List<SupportConversationSummary>> list({required String token}) async {
    final res = await http.get(
      Uri.parse('${ApiConfig.baseUrl}/support/conversations'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (res.statusCode != 200) throw ApiException(statusCode: res.statusCode, message: 'Failed to load conversations');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final data = (body['data'] as List).cast<Map<String, dynamic>>();
    return data.map(SupportConversationSummary.fromJson).toList();
  }

  Future<List<SupportMessage>> messages({required String token, required String conversationId}) async {
    final res = await http.get(
      Uri.parse('${ApiConfig.baseUrl}/support/conversations/$conversationId'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (res.statusCode != 200) throw ApiException(statusCode: res.statusCode, message: 'Failed to load messages');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    final msgs = (data['messages'] as List).cast<Map<String, dynamic>>();
    return msgs.map(SupportMessage.fromJson).toList();
  }

  /// Streams a turn — either creates a new conversation (if [conversationId]
  /// is null) or appends to an existing one. Yields parsed SSE events.
  Stream<SupportStreamEvent> stream({
    required String token,
    required String message,
    String? conversationId,
  }) async* {
    final path = conversationId == null
        ? '/support/conversations/stream'
        : '/support/conversations/$conversationId/stream';
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final req = http.Request('POST', uri)
      ..headers['Content-Type'] = 'application/json'
      ..headers['Authorization'] = 'Bearer $token'
      ..headers['Accept'] = 'text/event-stream'
      ..body = jsonEncode({'message': message});

    final streamed = await req.send();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      throw ApiException(statusCode: streamed.statusCode, message: 'Support request failed (${streamed.statusCode})');
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
          yield SupportStreamEvent.fromJson(jsonDecode(json) as Map<String, dynamic>);
        } catch (_) {/* skip malformed */}
      }
    }
    if (buffer.trim().startsWith('data: ')) {
      try {
        yield SupportStreamEvent.fromJson(jsonDecode(buffer.trim().substring(6)) as Map<String, dynamic>);
      } catch (_) {}
    }
  }

  Future<void> resolve({required String token, required String conversationId}) async {
    await http.post(
      Uri.parse('${ApiConfig.baseUrl}/support/conversations/$conversationId/resolve'),
      headers: {'Authorization': 'Bearer $token'},
    );
  }

  /// Build the WebSocket URL for a specific conversation. Caller is responsible
  /// for opening + closing the channel and reconnecting on disconnect.
  Uri wsUrl({required String token, required String conversationId}) {
    final base = ApiConfig.baseUrl.replaceFirst(RegExp(r'^http'), 'ws');
    return Uri.parse('$base/support/ws?conversationId=$conversationId&token=$token');
  }
}
