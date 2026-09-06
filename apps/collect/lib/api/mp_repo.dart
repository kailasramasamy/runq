import 'dart:io';
import 'dart:typed_data';
import 'api_client.dart';
import 'mp_models.dart';
import 'mp_running_models.dart';

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
    bool assignedOnly = false,
  }) async {
    final res = await _api.get(
      '$_base/nodes${_qs({
        'nodeType': nodeType,
        'search': search,
        'limit': limit,
        'assignedOnly': assignedOnly ? 'true' : null,
      })}',
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

  /// A farmer's per-cycle milk collection statement, with the server's own
  /// download name (farmer · cycle · VMCC) — the client can't build that name
  /// itself, since a farmer isn't allowed to read /nodes.
  Future<({Uint8List bytes, String filename})> farmerPourStatementPdf({
    required String farmerId,
    required String from,
    required String to,
    String? label,
  }) async {
    final qs = _qs({'from': from, 'to': to, 'label': label, 'format': 'pdf'});
    final res = await _api.getBytes('$_base/farmers/$farmerId/pour-statement$qs');
    return (
      bytes: Uint8List.fromList(res.bytes),
      filename: res.filename ?? 'statement.pdf',
    );
  }

  /// One VMCC's own settlement bills, newest first. Role scoping already limits
  /// an operator to their own centre; [nodeId] is what makes it right for an
  /// owner operating a centre through the switcher, who is tenant-wide.
  /// Settlement bills, filtered by centre ([nodeId]) or by cycle ([cycleId]).
  /// By cycle it is the per-VMCC breakdown of a bulk-settled CC's payout — the
  /// only record of that cycle's money, since it has no farmer lines.
  Future<List<MpVmccBill>> vmccBills({
    String? nodeId,
    String? cycleId,
    int limit = 24,
  }) async {
    final res = await _api.get(
      '$_base/billing/bills${_qs({
        'vmccNodeId': nodeId,
        'cycleId': cycleId,
        'limit': '$limit',
      })}',
    );
    return _list(res).map(MpVmccBill.fromJson).toList();
  }

  /// A VMCC's bill statement for one cycle — the day-and-shift supply behind
  /// the amount, rendered server-side so app and web hand over the same paper.
  /// Addressed by the cycle's real dates: cadence is tenant-set, so a bill's
  /// window doesn't always fall on a half-month.
  Future<({Uint8List bytes, String filename})> vmccBillStatementPdf({
    required String nodeId,
    required String from,
    required String to,
  }) async {
    final qs = _qs({'vmccNodeId': nodeId, 'from': from, 'to': to, 'format': 'pdf'});
    final res = await _api.getBytes('$_base/billing/vmcc-detail$qs');
    return (
      bytes: Uint8List.fromList(res.bytes),
      filename: res.filename ?? 'bill.pdf',
    );
  }

  /// Printable rate chart (matrix/CLR/flat + bonus slabs) as a PDF, with the
  /// server's own download name. Reuses GET /rate-charts/:id/print.
  Future<({Uint8List bytes, String filename})> rateChartPdf(String id) async {
    final res = await _api.getBytes('$_base/rate-charts/$id/print?format=pdf');
    return (
      bytes: Uint8List.fromList(res.bytes),
      filename: res.filename ?? 'rate-chart.pdf',
    );
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
    String? farmerId,
    String? onDate,
  }) async {
    final res = await _api.get(
      '$_base/rate-charts/resolve${_qs({'milkType': milkTypeToApi(milkType), 'fat': fat, 'snf': snf, 'clr': clr, 'cycleQtyLitres': cycleQtyLitres, 'scopeNodeId': scopeNodeId, 'farmerId': farmerId, 'onDate': onDate})}',
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
  /// Slots at a node still holding undispatched milk, oldest first. Drives the
  /// dispatch badge — one server-side aggregate rather than an availability call
  /// per day, because the lookback is the node's whole history.
  Future<List<MpPendingDispatch>> pendingDispatch(String nodeId) async {
    final res = await _api.get('$_base/consignments/pending-dispatch${_qs({'nodeId': nodeId})}');
    return _list(res).map(MpPendingDispatch.fromJson).toList();
  }

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

  /// Per-milk-type quality band thresholds; [nodeId] null → tenant defaults.
  Future<QualityBands> qualityBands({String? nodeId}) async {
    final res = await _api.get('$_base/quality-bands${_qs({'nodeId': nodeId})}');
    return QualityBands.fromJson(_one(res) ?? const {});
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

  /// Per-day received rollup at a CC node (one row per collection date).
  Future<List<MpReceivedDay>> receivedDaily({
    required String nodeId,
    required String from,
    required String to,
    String kind = 'vmcc_to_cc',
  }) async {
    final res = await _api.get(
      '$_base/reports/received-daily${_qs({'nodeId': nodeId, 'kind': kind, 'from': from, 'to': to})}',
    );
    return _list(res).map(MpReceivedDay.fromJson).toList();
  }

  /// Per-day qty-weighted QC rollup of recorded pours at a node, optionally
  /// scoped to one farmer — backs the VMCC QC trend chart.
  Future<List<MpPourDay>> poursDaily({
    required String nodeId,
    required String from,
    required String to,
    String? farmerId,
  }) async {
    final res = await _api.get(
      '$_base/reports/pours-daily${_qs({'nodeId': nodeId, 'from': from, 'to': to, 'farmerId': farmerId})}',
    );
    return _list(res).map(MpPourDay.fromJson).toList();
  }

  /// What a VMCC supplied per (day, shift, milk type) through the CC's manual
  /// receipts, priced from its rate chart. Newest day first, PM before AM.
  Future<List<MpSuppliedLine>> suppliedDaily({
    required String nodeId,
    required String from,
    required String to,
  }) async {
    final res = await _api.get(
      '$_base/reports/supplied-daily${_qs({'nodeId': nodeId, 'from': from, 'to': to})}',
    );
    return _list(res).map(MpSuppliedLine.fromJson).toList();
  }

  // ── running cycle balance ───────────────────────────────────────────────────
  /// What the open (still-collecting) window would pay if it were billed today.
  /// Pass [nodeId] alone for the whole centre (a CC also returns its VMCCs);
  /// add [farmerId] to narrow it to one farmer's card.
  ///
  /// Advances and goods sold to the farmer are already netted off server-side,
  /// by the same rule the real bill uses — nothing here re-derives them.
  Future<MpRunningBalance> runningBalance({
    required String nodeId,
    String? farmerId,
  }) async {
    final res = await _api.get(
      '$_base/payouts/running${_qs({'nodeId': nodeId, 'farmerId': farmerId})}',
    );
    return MpRunningBalance.fromJson(_one(res) ?? const {});
  }

  // ── farmer ledger ───────────────────────────────────────────────────────────
  /// [balance] is the blended amount owed; [advanceDue] / [feedLoanDue] are the
  /// server's split of it by what the debt is against — the same buckets the
  /// next cycle's deductions recover from, so the client never re-derives them.
  Future<MpFarmerLedger> farmerLedger({
    String? farmerId,
  }) async {
    final res = await _api.get(
      '$_base/payouts/ledger${_qs({'farmerId': farmerId})}',
    );
    final m = _one(res) ?? const {};
    final entries = ((m['entries'] as List?) ?? [])
        .map((e) => MpLedgerEntry.fromJson(e as Map<String, dynamic>))
        .toList();
    final out = (m['outstanding'] as Map<String, dynamic>?) ?? const {};
    return (
      balance: (m['balance'] as num?)?.toDouble() ?? 0.0,
      saleDue: (out['farmerSale'] as num?)?.toDouble() ?? 0.0,
      advanceDue: (out['advance'] as num?)?.toDouble() ?? 0.0,
      feedLoanDue: (out['feedLoan'] as num?)?.toDouble() ?? 0.0,
      entries: entries,
    );
  }

  /// Goods sold to a farmer over a window. A farmer token is forced to their own
  /// rows server-side, so [farmerId] is only meaningful for operators.
  Future<List<MpFarmerSale>> farmerSales({
    String? farmerId,
    String? from,
    String? to,
    bool includeReversed = false,
    int limit = 200,
  }) async {
    final res = await _api.get(
      '$_base/farmer-sales${_qs({
        'farmerId': farmerId,
        'from': from,
        'to': to,
        if (includeReversed) 'includeReversed': true,
        'limit': limit,
      })}',
    );
    return _list(res).map(MpFarmerSale.fromJson).toList();
  }

  /// Record goods sold TO a farmer. Bulk-milk litres come off the centre's
  /// available-to-dispatch; either way the amount is recovered on the farmer's
  /// next cycle, ahead of advances.
  Future<void> createFarmerSale(Map<String, dynamic> body) async {
    await _api.post('$_base/farmer-sales', body);
  }

  /// Correct a recorded sale. Rejected once a cycle has recovered it.
  Future<void> updateFarmerSale(String id, Map<String, dynamic> body) async {
    await _api.patch('$_base/farmer-sales/$id', body);
  }

  /// Drop a sale outright (the same-day mis-key fix). Rejected once recovered.
  Future<void> deleteFarmerSale(String id) async {
    await _api.delete('$_base/farmer-sales/$id');
  }

  /// The counter catalogue — what may be sold besides bulk milk.
  Future<List<MpSellableItem>> sellableItems() async {
    final res = await _api.get('$_base/farmer-sales/items');
    return _list(res).map(MpSellableItem.fromJson).toList();
  }

  /// The farmer's payout statements — server-authoritative lines joined with
  /// their cycle's window and status (GET /payouts/my-lines).
  Future<List<MpPayoutLine>> farmerPayoutLines({
    String? farmerId,
    int limit = 24,
  }) async {
    final res = await _api.get(
      '$_base/payouts/my-lines${_qs({'farmerId': farmerId, 'limit': limit})}',
    );
    return _list(res).map(MpPayoutLine.fromJson).toList();
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

  /// Undo a dispatch that hasn't been received — the litres go back onto the
  /// source node's availability. Server refuses once the load has landed.
  Future<MpConsignment?> cancelDispatch(String id) async {
    final res = await _api.post('$_base/consignments/$id/cancel-dispatch', const {});
    final m = _one(res);
    return m == null ? null : MpConsignment.fromJson(m);
  }

  /// Undo a receipt — the load returns to in-transit at this node's door. A
  /// manual receipt is withdrawn outright. Server refuses once the milk has
  /// been sent onward or used in production.
  Future<MpConsignment?> cancelReceipt(String id) async {
    final res = await _api.post('$_base/consignments/$id/cancel-receipt', const {});
    final m = _one(res);
    return m == null ? null : MpConsignment.fromJson(m);
  }

  /// Delete a manually-entered receipt (server rejects unless it's a direct
  /// receive that isn't yet locked for dispatch).
  Future<void> deleteReceipt(String id) => _api.delete('$_base/consignments/$id');

  // ── rejections ────────────────────────────────────────────────────────────
  /// Refuse a farmer's milk at the gate. No pour is created for these litres,
  /// so nothing accrues and there is nothing to deduct later.
  Future<MpRejection?> rejectAtGate(Map<String, dynamic> body) async {
    final res = await _api.post('$_base/rejections/gate', body);
    final m = _one(res);
    return m == null ? null : MpRejection.fromJson(m);
  }

  /// Refuse part of a load already taken in. The receipt drops to what was
  /// kept, so the litres never join the pool or the plant's raw-milk stock.
  Future<MpRejection?> rejectConsignment(String id, Map<String, dynamic> body) async {
    final res = await _api.post('$_base/rejections/consignment/$id', body);
    final m = _one(res);
    return m == null ? null : MpRejection.fromJson(m);
  }

  Future<List<MpRejection>> rejections({
    String? nodeId,
    String? fromNodeId,
    String? collectionDate,
    String? from,
    String? to,
  }) async {
    final res = await _api.get(
      '$_base/rejections${_qs({'nodeId': nodeId, 'fromNodeId': fromNodeId, 'collectionDate': collectionDate, 'from': from, 'to': to})}',
    );
    return _list(res).map(MpRejection.fromJson).toList();
  }

  /// Rejection rate over a window, grouped by source node, farmer or reason.
  Future<List<MpRejectionStat>> rejectionStats({
    required String from,
    required String to,
    String? nodeId,
    String groupBy = 'node',
  }) async {
    final res = await _api.get(
      '$_base/rejections/stats${_qs({'from': from, 'to': to, 'nodeId': nodeId, 'groupBy': groupBy})}',
    );
    return _list(res).map(MpRejectionStat.fromJson).toList();
  }

  /// A farmer's refused milk over a window, charge by charge — what their
  /// payment breakdown lists under the deduction.
  Future<List<MpRejectionLine>> farmerRejectionLines({
    String? farmerId,
    required String from,
    required String to,
  }) async {
    final res = await _api.get(
      '$_base/rejections/farmer-lines${_qs({'farmerId': farmerId, 'from': from, 'to': to})}',
    );
    return _list(res).map(MpRejectionLine.fromJson).toList();
  }

  /// Undo everything refused off one load — the unit the operator sees on the
  /// card, rather than the individual rejection rows behind it.
  Future<void> undoConsignmentRejections(String id) =>
      _api.post('$_base/rejections/consignment/$id/reverse', const {});

  /// Take a rejection back: litres return to the receipt and every charge is
  /// contra'd on its farmer's ledger.
  Future<MpRejection?> reverseRejection(String id) async {
    final res = await _api.post('$_base/rejections/$id/reverse', const {});
    final m = _one(res);
    return m == null ? null : MpRejection.fromJson(m);
  }

  // ── single-site fast track ────────────────────────────────────────────────
  /// Preview the whole VMCC→CC→plant chain without writing anything. Only
  /// returns centres whose plant is flagged single-site and that this operator
  /// can work end to end.
  Future<MpFastTrackPlan> fastTrackPlan(
    String collectionDate, {
    String? shift,
    List<String>? vmccNodeIds,
  }) async {
    final res = await _api.post('$_base/consignments/fast-track/plan', {
      'collectionDate': collectionDate,
      'shift': ?shift,
      'vmccNodeIds': ?vmccNodeIds,
    });
    return MpFastTrackPlan.fromJson(_one(res) ?? const {});
  }

  /// Commit the chain. The server re-plans first, so what runs is what's on
  /// hand now — not what the preview showed minutes ago.
  Future<MpFastTrackResult> fastTrackRun(
    String collectionDate, {
    String? shift,
    List<String>? vmccNodeIds,
  }) async {
    final res = await _api.post('$_base/consignments/fast-track/run', {
      'collectionDate': collectionDate,
      'shift': ?shift,
      'vmccNodeIds': ?vmccNodeIds,
    });
    return MpFastTrackResult.fromJson(_one(res) ?? const {});
  }

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
