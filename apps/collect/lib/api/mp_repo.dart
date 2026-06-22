import 'dart:io';
import 'dart:typed_data';
import 'api_client.dart';
import 'mp_models.dart';

/// Typed wrappers over `/milk-procurement/*`. The API envelopes are:
///   list   → { data: [...], meta }
///   single → { data: {...} }
/// We unwrap `data` here so screens deal only in models.
class MpRepo {
  MpRepo([ApiClient? client]) : _api = client ?? apiClient;
  final ApiClient _api;

  static const _base = '/milk-procurement';

  List<Map<String, dynamic>> _list(Object? res) {
    final data = (res is Map) ? res['data'] : null;
    if (data is List) return data.cast<Map<String, dynamic>>();
    return const [];
  }

  Map<String, dynamic>? _one(Object? res) {
    final data = (res is Map) ? res['data'] : null;
    return data is Map ? data.cast<String, dynamic>() : null;
  }

  String _qs(Map<String, Object?> params) {
    final parts = <String>[];
    params.forEach((k, v) {
      if (v != null && v != '') {
        parts.add('$k=${Uri.encodeQueryComponent(v.toString())}');
      }
    });
    return parts.isEmpty ? '' : '?${parts.join('&')}';
  }

  // ── nodes ─────────────────────────────────────────────────────────────────
  Future<List<MpNode>> nodes({
    String? nodeType,
    String? search,
    int limit = 100,
  }) async {
    final res = await _api.get(
      '$_base/nodes${_qs({'nodeType': nodeType, 'search': search, 'limit': limit})}',
    );
    return _list(res).map(MpNode.fromJson).toList();
  }

  Future<MpNode?> node(String id) async {
    final res = await _api.get('$_base/nodes/$id');
    final m = _one(res);
    return m == null ? null : MpNode.fromJson(m);
  }

  // ── farmers ───────────────────────────────────────────────────────────────
  Future<List<MpFarmer>> farmers({
    String? nodeId,
    String? search,
    int limit = 200,
  }) async {
    final res = await _api.get(
      '$_base/farmers${_qs({'nodeId': nodeId, 'search': search, 'limit': limit})}',
    );
    return _list(res).map(MpFarmer.fromJson).toList();
  }

  Future<MpFarmer?> createFarmer(Map<String, dynamic> body) async {
    final res = await _api.post('$_base/farmers', body);
    final m = _one(res);
    return m == null ? null : MpFarmer.fromJson(m);
  }

  Future<MpFarmer?> updateFarmer(String id, Map<String, dynamic> body) async {
    final res = await _api.put('$_base/farmers/$id', body);
    final m = _one(res);
    return m == null ? null : MpFarmer.fromJson(m);
  }

  /// Native-script suggestion for [name] in [lang] (current app locale code).
  /// Returns null when transliteration is unavailable (AI off / unmapped).
  Future<String?> transliterateName(String name, String lang) async {
    final res = await _api.post('$_base/farmers/transliterate', {'name': name, 'lang': lang});
    final v = _one(res)?['nameNative'];
    return (v is String && v.trim().isNotEmpty) ? v : null;
  }

  /// A farmer's per-cycle milk collection statement as PDF bytes (for sharing).
  Future<Uint8List> farmerPourStatementPdf({
    required String farmerId,
    required String from,
    required String to,
    String? label,
  }) async {
    final qs = _qs({'from': from, 'to': to, 'label': label, 'format': 'pdf'});
    final bytes = await _api.getBytes('$_base/farmers/$farmerId/pour-statement$qs');
    return Uint8List.fromList(bytes);
  }

  /// Extract Aadhaar card fields from [image] via AI OCR.
  /// Returns the `data` map on success, or null if the request fails.
  Future<Map<String, dynamic>?> extractAadhaar(File image) async {
    final ext = image.path.split('.').last.toLowerCase();
    final mimeType = switch (ext) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => 'image/jpeg',
    };
    try {
      final res = await _api.upload(
        '$_base/farmers/extract-aadhaar',
        image,
        fileField: 'file',
        mimeType: mimeType,
      );
      return _one(res);
    } catch (_) {
      return null;
    }
  }

  Future<void> uploadFarmerDoc(
    String farmerId,
    File file, {
    required String kind,
  }) async {
    final ext = file.path.split('.').last.toLowerCase();
    final mimeType = switch (ext) {
      'pdf' => 'application/pdf',
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => 'image/jpeg',
    };
    await _api.upload(
      '$_base/farmers/$farmerId/attachments',
      file,
      fileField: 'file',
      fields: {'kind': kind},
      mimeType: mimeType,
    );
  }

  // ── rate charts ─────────────────────────────────────────────────────────────
  Future<List<MpRateChart>> rateCharts({
    String? milkType,
    int limit = 50,
  }) async {
    final res = await _api.get(
      '$_base/rate-charts${_qs({'milkType': milkType, 'limit': limit})}',
    );
    return _list(res).map(MpRateChart.fromJson).toList();
  }

  Future<MpRateChartDetail?> rateChart(String id) async {
    final res = await _api.get('$_base/rate-charts/$id');
    final m = _one(res);
    return m == null ? null : MpRateChartDetail.fromJson(m);
  }

  /// Resolve the rate for a pour preview.
  ///
  /// Analyzer mode: provide [fat] and [snf].
  /// Lactometer mode: provide [clr] and omit fat/snf.
  /// Exactly one of ([fat]+[snf]) or [clr] should be supplied.
  Future<MpRateResolution?> resolveRate({
    required MilkType milkType,
    double? fat,
    double? snf,
    double? clr,
    double? cycleQtyLitres,
    String? scopeNodeId,
    String? onDate,
  }) async {
    final res = await _api.get(
      '$_base/rate-charts/resolve${_qs({'milkType': milkTypeToApi(milkType), 'fat': fat, 'snf': snf, 'clr': clr, 'cycleQtyLitres': cycleQtyLitres, 'scopeNodeId': scopeNodeId, 'onDate': onDate})}',
    );
    final m = _one(res);
    return m == null ? null : MpRateResolution.fromJson(m);
  }

  // ── pours ─────────────────────────────────────────────────────────────────
  Future<List<MpPour>> pours({
    String? nodeId,
    String? farmerId,
    String? collectionDate,
    String? from,
    String? to,
    String? shift,
    String? status,
    int limit = 100,
  }) async {
    final res = await _api.get(
      '$_base/pours${_qs({'nodeId': nodeId, 'farmerId': farmerId, 'collectionDate': collectionDate, 'from': from, 'to': to, 'shift': shift, 'status': status, 'limit': limit})}',
    );
    return _list(res).map(MpPour.fromJson).toList();
  }

  /// Record a pour. [body] is the raw RecordPourInput map (built by the caller
  /// or replayed from the offline queue). Returns the server pour.
  Future<MpPour?> recordPour(Map<String, dynamic> body) async {
    final res = await _api.post('$_base/pours', body);
    final m = _one(res);
    return m == null ? null : MpPour.fromJson(m);
  }

  /// Reverse (delete) a recorded pour — node-scoped server-side.
  Future<MpPour?> reversePour(String id) async {
    final res = await _api.post('$_base/pours/$id/reverse', const {});
    final m = _one(res);
    return m == null ? null : MpPour.fromJson(m);
  }

  // ── shift close (per-slot collection close + dispatch gate) ─────────────────
  /// Which shifts are closed for a node on a date. BMC nodes report both shifts.
  Future<MpShiftStatus> shiftStatus(String nodeId, String date) async {
    final res = await _api.get(
      '$_base/shifts/status${_qs({'nodeId': nodeId, 'date': date})}',
    );
    return MpShiftStatus.fromJson(_one(res) ?? const {});
  }

  /// Close collection for a slot. Omit [shift] for a BMC node (closes the day).
  Future<MpShiftStatus> closeShift(
    String nodeId,
    String collectionDate, {
    String? shift,
  }) async {
    final res = await _api.post('$_base/shifts/close', {
      'nodeId': nodeId,
      'collectionDate': collectionDate,
      'shift': ?shift,
    });
    return MpShiftStatus.fromJson(_one(res) ?? const {});
  }

  /// Reopen a closed slot — rejected server-side once any dispatch exists.
  Future<MpShiftStatus> reopenShift(
    String nodeId,
    String collectionDate, {
    String? shift,
  }) async {
    final res = await _api.post('$_base/shifts/reopen', {
      'nodeId': nodeId,
      'collectionDate': collectionDate,
      'shift': ?shift,
    });
    return MpShiftStatus.fromJson(_one(res) ?? const {});
  }

  // ── config ────────────────────────────────────────────────────────────────
  /// Tenant collection/payout cadence (farmer/operator readable).
  Future<MpCycleConfig> cycleConfig() async {
    final res = await _api.get('$_base/config/cycle');
    return MpCycleConfig.fromJson(_one(res) ?? const {});
  }

  /// Tenant support contacts shown on the Help & Support screen (all personas).
  Future<MpSupportConfig> supportConfig() async {
    final res = await _api.get('$_base/config/support');
    return MpSupportConfig.fromJson(_one(res) ?? const {});
  }

  // ── operator (self) ─────────────────────────────────────────────────────────
  /// The signed-in operator's own comp terms + this month's earning, per node.
  Future<List<MpOperatorSelf>> operatorSelf() async {
    final res = await _api.get('$_base/operators/me');
    return _list(res).map(MpOperatorSelf.fromJson).toList();
  }

  // ── operator payouts (CC/PP manager pays VMCC operators) ────────────────────
  /// What each operator in the manager's subtree is owed for the period
  /// (per-litre commission or fixed salary + rent), with already-paid flagged.
  Future<List<MpOperatorPayoutLine>> operatorPayoutCompute({
    required String from,
    required String to,
    String? nodeId,
  }) async {
    final res = await _api.get(
      '$_base/operator-payouts/compute${_qs({'from': from, 'to': to, 'nodeId': nodeId})}',
    );
    final m = _one(res) ?? const {};
    return ((m['lines'] as List?) ?? [])
        .map((e) => MpOperatorPayoutLine.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Record one operator paid for a period (amounts recomputed server-side).
  Future<void> markOperatorPaid({
    required String operatorId,
    required String periodStart,
    required String periodEnd,
    String? paidOn,
    String? reference,
  }) async {
    await _api.post('$_base/operator-payouts', {
      'operatorId': operatorId,
      'periodStart': periodStart,
      'periodEnd': periodEnd,
      'paidOn': ?paidOn,
      'reference': ?reference,
    });
  }

  // ── reports ───────────────────────────────────────────────────────────────
  Future<MpCollectionSummary?> collectionSummary({
    required String from,
    required String to,
    String? nodeId,
  }) async {
    final res = await _api.get(
      '$_base/reports/collection${_qs({'from': from, 'to': to, 'nodeId': nodeId})}',
    );
    final m = _one(res);
    return m == null ? null : MpCollectionSummary.fromJson(m);
  }

  // ── farmer ledger ───────────────────────────────────────────────────────────
  Future<({double balance, List<MpLedgerEntry> entries})> farmerLedger({
    String? farmerId,
  }) async {
    final res = await _api.get(
      '$_base/payouts/ledger${_qs({'farmerId': farmerId})}',
    );
    final m = _one(res) ?? const {};
    final entries = ((m['entries'] as List?) ?? [])
        .map((e) => MpLedgerEntry.fromJson(e as Map<String, dynamic>))
        .toList();
    final balance = m['balance'] == null
        ? 0.0
        : (m['balance'] as num).toDouble();
    return (balance: balance, entries: entries);
  }

  /// Record an advance / feed-loan / repayment / adjustment for a farmer.
  Future<MpLedgerEntry?> addLedgerEntry(Map<String, dynamic> body) async {
    final res = await _api.post('$_base/payouts/ledger', body);
    final m = _one(res);
    return m == null ? null : MpLedgerEntry.fromJson(m);
  }

  // ── consignments ──────────────────────────────────────────────────────────
  Future<List<MpConsignment>> consignments({
    String? kind,
    String? toNodeId,
    String? fromNodeId,
    String? status,
    String? collectionDate,
    String? from,
    String? to,
    int limit = 100,
  }) async {
    final res = await _api.get(
      '$_base/consignments${_qs({'kind': kind, 'toNodeId': toNodeId, 'fromNodeId': fromNodeId, 'status': status, 'collectionDate': collectionDate, 'from': from, 'to': to, 'limit': limit})}',
    );
    return _list(res).map(MpConsignment.fromJson).toList();
  }

  Future<MpAvailability?> availability(
    String nodeId,
    String collectionDate, {
    String? shift,
  }) async {
    final res = await _api.get(
      '$_base/consignments/available${_qs({'nodeId': nodeId, 'collectionDate': collectionDate, 'shift': shift})}',
    );
    final m = _one(res);
    return m == null ? null : MpAvailability.fromJson(m);
  }

  Future<MpConsignment?> dispatchConsignment(Map<String, dynamic> body) async {
    final res = await _api.post('$_base/consignments', body);
    final m = _one(res);
    return m == null ? null : MpConsignment.fromJson(m);
  }

  Future<MpConsignment?> receiveConsignment(
    String id,
    Map<String, dynamic> body,
  ) async {
    final res = await _api.post('$_base/consignments/$id/receive', body);
    final m = _one(res);
    return m == null ? null : MpConsignment.fromJson(m);
  }

  /// Ad-hoc receive: record milk that arrived without a dispatch entry (operator
  /// forgot to dispatch, or doesn't use the app). Creates a received consignment.
  Future<MpConsignment?> directReceive(Map<String, dynamic> body) async {
    final res = await _api.post('$_base/consignments/direct-receive', body);
    final m = _one(res);
    return m == null ? null : MpConsignment.fromJson(m);
  }

  /// Correct an already-received consignment's receipt figures (fix a just-made
  /// entry). Recomputes variance server-side.
  Future<MpConsignment?> editReceipt(String id, Map<String, dynamic> body) async {
    final res = await _api.post('$_base/consignments/$id/edit-receipt', body);
    final m = _one(res);
    return m == null ? null : MpConsignment.fromJson(m);
  }

  /// Delete a manually-entered receipt (server rejects unless it's a direct
  /// receive that isn't yet locked for dispatch).
  Future<void> deleteReceipt(String id) => _api.delete('$_base/consignments/$id');

  // ── QC tests ──────────────────────────────────────────────────────────────
  Future<List<MpQcTest>> qcTests({
    String? subjectType,
    String? subjectId,
    String? verdict,
  }) async {
    final res = await _api.get(
      '$_base/qc-tests${_qs({'subjectType': subjectType, 'subjectId': subjectId, 'verdict': verdict})}',
    );
    return _list(res).map(MpQcTest.fromJson).toList();
  }

  Future<MpQcTest?> createQcTest(Map<String, dynamic> body) async {
    final res = await _api.post('$_base/qc-tests', body);
    final m = _one(res);
    return m == null ? null : MpQcTest.fromJson(m);
  }

  // ── payout cycles ─────────────────────────────────────────────────────────
  Future<List<MpPayoutCycle>> payoutCycles({
    String? status,
    String? scopeNodeId,
    int limit = 50,
  }) async {
    final res = await _api.get(
      '$_base/payouts/cycles${_qs({'status': status, 'scopeNodeId': scopeNodeId, 'limit': limit})}',
    );
    return _list(res).map(MpPayoutCycle.fromJson).toList();
  }

  Future<MpPayoutCycle?> payoutCycle(String id) async {
    final res = await _api.get('$_base/payouts/cycles/$id');
    final m = _one(res);
    return m == null ? null : MpPayoutCycle.fromJson(m);
  }

  /// Generate a node-scoped cycle from recorded pours in the period.
  Future<MpPayoutCycle?> createCycle({
    required String periodStart,
    required String periodEnd,
    required String scopeNodeId,
  }) async {
    final res = await _api.post('$_base/payouts/cycles', {
      'periodStart': periodStart,
      'periodEnd': periodEnd,
      'scopeNodeId': scopeNodeId,
    });
    final m = _one(res);
    return m == null ? null : MpPayoutCycle.fromJson(m);
  }

  Future<MpPayoutCycle?> lockCycle(String id) async {
    final res = await _api.post('$_base/payouts/cycles/$id/lock', const {});
    final m = _one(res);
    return m == null ? null : MpPayoutCycle.fromJson(m);
  }

  Future<MpPayoutCycle?> payCycle(String id) async {
    final res = await _api.post('$_base/payouts/cycles/$id/pay', const {});
    final m = _one(res);
    return m == null ? null : MpPayoutCycle.fromJson(m);
  }

  /// Mark one farmer's line paid/unpaid (operational disbursement flag).
  Future<void> markLinePaid(String cycleId, String lineId, bool paid) async {
    await _api.post('$_base/payouts/cycles/$cycleId/lines/$lineId/paid', {
      'paid': paid,
    });
  }

  /// Mark every line in a cycle paid/unpaid.
  Future<void> markAllPaid(String cycleId, bool paid) async {
    await _api.post('$_base/payouts/cycles/$cycleId/mark-all-paid', {
      'paid': paid,
    });
  }
}

final mpRepo = MpRepo();
