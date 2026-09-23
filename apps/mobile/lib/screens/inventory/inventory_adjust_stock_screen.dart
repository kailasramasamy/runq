// Adjust Stock — correct an item's on-hand quantity straight from the item
// detail screen, without walking the full Adjustments flow.
//
// The user picks a stock location, says whether the number they type is being
// added, removed, or is the new total, and the screen books the difference:
// create + post in a single tap, exactly what inventory_adjustment_screen.dart
// does for a multi-line draft. Reason defaults by direction and stays
// editable, so the GL lands where it should.
//
// Everything here works on the location's *total*, not on one lot. Someone
// counting a shelf counts what is on it; which lots that splits into is the
// ledger's problem, not theirs. The screen owns that translation: a
// withdrawal is spread across the location's lots in FEFO order and posted as
// one adjustment with a line per lot touched, which the ledger records
// individually while the GL books a single journal entry for the document.
//
// A full screen rather than a bottom sheet: location, mode, quantity, reason
// and a confirm button leave nothing for the keyboard to sit on.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'inventory_adjustment_common.dart';
import 'widgets/adjust_stock_widgets.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';
import 'widgets/warehouse_picker.dart';

/// Opens the editor. Returns true when stock was adjusted.
Future<bool> openAdjustStock(
  BuildContext context, {
  required InvItemDetail item,
  required List<InvItemStockRow> stock,
}) async {
  final done = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      builder: (_) => InventoryAdjustStockScreen(item: item, stock: stock),
    ),
  );
  return done == true;
}

class InventoryAdjustStockScreen extends ConsumerStatefulWidget {
  const InventoryAdjustStockScreen({
    super.key,
    required this.item,
    required this.stock,
  });
  final InvItemDetail item;
  final List<InvItemStockRow> stock;
  @override
  ConsumerState<InventoryAdjustStockScreen> createState() =>
      _InventoryAdjustStockScreenState();
}

class _InventoryAdjustStockScreenState
    extends ConsumerState<InventoryAdjustStockScreen> {
  final _qty = TextEditingController();
  final _batch = TextEditingController();

  /// The reason itself, when "Other" is picked. Every listed reason is a
  /// category the backend understands; this one only means what it says here,
  /// so it posts as the adjustment's note and the audit trail prints it.
  final _otherReason = TextEditingController();

  /// One entry per warehouse the item is held in, pooled across its lots.
  /// See `groupHoldings`.
  late List<AdjustHolding> _holdings = groupHoldings(widget.stock);

  /// True while we are fetching the stock the caller couldn't hand us.
  bool _loadingStock = false;

  /// Selected location, or null when adjusting one the item isn't held in yet.
  AdjustHolding? _holding;
  String? _warehouseId;
  String? _reason;
  AdjustMode _mode = AdjustMode.add;

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (_holdings.isNotEmpty) {
      _select(_holdings.first);
    } else {
      _loadStock();
    }
  }

  /// The item detail screen hands over whatever its stock query had resolved
  /// when Adjust was tapped — an empty list while it is still in flight, or
  /// if it failed. Empty is indistinguishable from "nothing on hand", and a
  /// Set-to measured against that phantom zero posts the typed figure as a
  /// plain Add: ask for 30 on an item holding 100 and the ledger reads 130.
  /// So when nothing arrives, go and fetch it before anyone can type.
  Future<void> _loadStock() async {
    setState(() => _loadingStock = true);
    var fetched = const <InvItemStockRow>[];
    try {
      fetched = await ref.read(invItemStockProvider(widget.item.id).future);
    } on ApiException {
      // Nothing to recover: the screen falls back to its no-stock shape,
      // which only offers Add, and the post itself will report any failure.
    }
    if (!mounted) return;
    setState(() {
      _holdings = groupHoldings(fetched);
      _loadingStock = false;
    });
    if (_holdings.isNotEmpty) {
      _select(_holdings.first);
    } else {
      _applyDefaultWarehouse();
    }
  }

  /// Most plants run one warehouse, so picking it every time is a tap that
  /// can only be got wrong. Falls back to the sole warehouse when none is
  /// flagged default. Mirrors inventory_adjustment_screen.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final active = whs.where((w) => w.isActive).toList();
    if (active.isEmpty) return;
    final pick = active.firstWhere((w) => w.isDefault, orElse: () => active.first);
    setState(() => _warehouseId = pick.id);
  }

  @override
  void dispose() {
    _qty.dispose();
    _batch.dispose();
    _otherReason.dispose();
    super.dispose();
  }

  void _select(AdjustHolding? holding) {
    setState(() {
      _holding = holding;
      _warehouseId = holding?.warehouseId;
      _qty.clear();
      _reason = null;
      // Nothing is on hand at a fresh location, so "remove" and "set to"
      // have nothing to act on — only stock arriving makes sense there.
      if (holding == null) _mode = AdjustMode.add;
    });
    if (holding == null) _applyDefaultWarehouse();
  }

  void _setMode(AdjustMode m) {
    if (!_modeAllowed(m)) return;
    setState(() {
      _mode = m;
      // Set-to opens on the current figure so the user edits a number rather
      // than recalling it; the delta modes are typed from scratch.
      _qty.text = m == AdjustMode.setTo ? invFmtQty(_currentQty) : '';
      _reason = null;
    });
  }

  /// Remove and Set-to both measure against a quantity already on hand, so
  /// they need a stock row to measure against. At a location the item isn't
  /// held in there is none, and a Set-to there would quietly become an Add of
  /// the typed figure — the one way this screen can post a number nobody
  /// asked for. Only Add is offered until a holding is selected.
  bool _modeAllowed(AdjustMode m) => m == AdjustMode.add || _holding != null;

  double get _currentQty => _holding?.qty ?? 0;

  /// What `_currentQty` is counting, when that is less than the item's total.
  /// The figure is now the whole location, so the only way it can differ from
  /// the item total is stock sitting in another warehouse.
  String? get _qtyScope =>
      _holding != null && _holdings.length > 1 ? 'in this location' : null;

  /// "120 on hand", qualified by scope so the figure can be reconciled
  /// against the item's total rather than read as contradicting it.
  String get _onHandPhrase {
    final scope = _qtyScope;
    return '${invFmtQty(_currentQty)} on hand${scope == null ? '' : ' $scope'}';
  }
  double? get _entered => double.tryParse(_qty.text.trim());
  double? get _delta {
    final n = _entered;
    if (n == null || n < 0) return null;
    return switch (_mode) {
      AdjustMode.add => n,
      AdjustMode.remove => -n,
      AdjustMode.setTo => n - _currentQty,
    };
  }

  double get _resultQty => _currentQty + (_delta ?? 0);

  /// Direction follows the mode, not the typed delta.
  ///
  /// Add / Remove already state the direction outright, and switching mode
  /// clears the quantity box — so deriving this from the delta left Remove
  /// showing inbound reasons (Found, Opening Balance) until a number was
  /// typed, hiding Damage and Extra for Damages behind a keystroke. Only
  /// Set-to is genuinely ambiguous, and there the delta decides.
  bool get _isOutbound => switch (_mode) {
    AdjustMode.add => false,
    AdjustMode.remove => true,
    AdjustMode.setTo => (_delta ?? 0) < 0,
  };
  String get _unit => widget.item.unit ?? '';

  /// A picked reason only survives while it fits the direction — flipping
  /// from a shortfall to a surplus must not post "damage" inbound.
  String get _effectiveReason {
    final allowed = _isOutbound ? invOutboundReasonOrder : invInboundReasonOrder;
    if (_reason != null && allowed.contains(_reason)) return _reason!;
    if (_holding == null && !_isOutbound) return 'opening_balance';
    return invDefaultReason(_isOutbound);
  }

  /// The lot an Add opens. Stock arriving is new stock, so on a batch-tracked
  /// item it gets a lot of its own: named here, or minted by the server as
  /// `ADJ-000039-01` when left blank. Merging it into an existing lot would
  /// leave the two indistinguishable afterwards — 20 L added to a milk
  /// consignment left the batch claiming 128 L from one collection when only
  /// 108 came from there.
  String? get _newBatchNo {
    if (!widget.item.trackBatches) return null;
    final typed = _batch.text.trim();
    return typed.isEmpty ? null : typed;
  }

  /// True when this posting should start a lot of its own. Only an Add ever
  /// does; withdrawals draw from lots that already exist.
  bool get _opensNewBatch =>
      widget.item.trackBatches && _mode == AdjustMode.add;

  /// Quantities are `numeric(18,3)` in the ledger, so anything under half a
  /// milli-unit is float dust rather than stock.
  static const _epsilon = 0.0005;

  /// Rounds to the ledger's precision, so a draw computed by subtraction
  /// cannot post 19.999999999 against a lot holding 20.
  double _toLedgerQty(double n) => double.parse(n.toStringAsFixed(3));

  /// The lines this adjustment posts.
  ///
  /// An addition is one line. A withdrawal is spread across the location's
  /// lots in the order the server sent them, which is FEFO — soonest expiry
  /// first, undated last, oldest intake breaking the tie — so the adjust
  /// screen consumes stock the same way dispatch and manufacturing do.
  /// Draining a lot exactly is what empties it; the remainder rolls to the
  /// next. Returns empty when the lots cannot cover the draw, which
  /// `_canSave` has already ruled out.
  List<InvAdjustmentLineInput> _lines() {
    final d = _delta;
    if (d == null || d == 0) return const [];
    if (d > 0) {
      return [
        InvAdjustmentLineInput(
          itemId: widget.item.id,
          batchNo: _newBatchNo,
          qtyDelta: d,
        ),
      ];
    }
    final out = <InvAdjustmentLineInput>[];
    var left = -d;
    for (final lot in _holding?.batches ?? const <InvItemStockRow>[]) {
      if (left <= _epsilon) break;
      final take = _toLedgerQty(lot.qty <= left ? lot.qty : left);
      if (take <= _epsilon) continue;
      out.add(InvAdjustmentLineInput(
        itemId: widget.item.id,
        batchNo: lot.batchNo.isEmpty ? null : lot.batchNo,
        qtyDelta: -take,
      ));
      left -= take;
    }
    return left > _epsilon ? const [] : out;
  }

  bool get _isOther => _effectiveReason == invOtherReason;

  bool get _canSave {
    final d = _delta;
    if (d == null || d == 0 || _resultQty < 0) return false;
    if (d < 0 && _lines().isEmpty) return false;
    if (_warehouseId == null || _loadingStock) return false;
    if (!_modeAllowed(_mode)) return false;
    // "Other" with no explanation is worse than a wrong category: it books
    // to write-off carrying nothing anyone can audit later.
    if (_isOther && _otherReason.text.trim().isEmpty) return false;
    return !_saving;
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    if (!await _confirmStockUnchanged()) {
      if (mounted) setState(() => _saving = false);
      return;
    }
    final result = _resultQty;
    final adj = await _post();
    if (!mounted) return;
    setState(() => _saving = false);
    if (adj == null) return;
    invalidateStockViews(ref);
    ref.invalidate(invItemDetailProvider(widget.item.id));
    ref.invalidate(invItemStockProvider(widget.item.id));
    ref.invalidate(invAdjustmentListProvider(null));
    Navigator.of(context).pop(true);
    RunqSnack.success(
      context,
      '${adj.adjNo} posted — on hand now ${invFmtQty(result)} $_unit'.trim(),
    );
  }

  /// Re-reads stock immediately before posting, and stops if it moved.
  ///
  /// The lines were worked out from what was on hand when the screen opened.
  /// If something shipped in between, a line can ask a lot for more than it
  /// holds — the server rejects that, so nothing corrupt can post — but a
  /// Set-to is worse than a failed post: "set to 20" against a stale 220 is a
  /// different movement from "set to 20" against 180, and it would post
  /// silently. So the figure is re-checked and the user re-confirms against
  /// the real one rather than the screen guessing on their behalf.
  Future<bool> _confirmStockUnchanged() async {
    List<InvItemStockRow> fresh;
    try {
      fresh = await ref.refresh(invItemStockProvider(widget.item.id).future);
    } on ApiException {
      // Couldn't check. The post itself still validates against live stock,
      // so let it through rather than blocking on a flaky read.
      return true;
    }
    if (!mounted) return false;
    final holdings = groupHoldings(fresh);
    final match = holdings.where((h) => h.warehouseId == _warehouseId).firstOrNull;
    // No row for this warehouse means nothing is held there — which is a
    // quantity of zero, not an unknown. Reading the missing row as "changed"
    // blocked every Add at a location the item had never been stocked in,
    // on a toast that said stock moved from 0 to 0.
    final now = match?.qty ?? 0;
    final was = _currentQty;
    if ((now - was).abs() <= _epsilon) {
      // Same total, but the lots underneath may have been re-cut; redraw from
      // what is there now so the split matches the live pool.
      setState(() {
        _holdings = holdings;
        _holding = match;
      });
      return true;
    }
    setState(() {
      _holdings = holdings;
      _holding = match;
      if (_holding == null) _mode = AdjustMode.add;
      if (_mode == AdjustMode.setTo) _qty.text = invFmtQty(_currentQty);
    });
    RunqSnack.warning(
      context,
      'Stock moved while you were typing',
      description:
          'It was ${invFmtQty(was)} $_unit, now ${invFmtQty(_currentQty)} $_unit. '
          'Check the number and post again.'.trim(),
    );
    return false;
  }

  /// Create + post as one action. A rejected post would otherwise leave an
  /// unpostable draft behind, so it is cancelled the way the adjustment
  /// screen does.
  Future<InvAdjustment?> _post() async {
    InvAdjustment? created;
    try {
      created = await inventoryRepo.createAdjustment(
        warehouseId: _warehouseId!,
        reason: _effectiveReason,
        adjustmentDate: DateTime.now().toIso8601String().substring(0, 10),
        notes: _isOther
            ? _otherReason.text.trim()
            : 'Adjusted from item detail',
        lines: _lines(),
      );
      await inventoryRepo.postAdjustment(created.id);
      return created;
    } catch (e) {
      final draft = created;
      if (draft != null) {
        await inventoryRepo
            .cancelAdjustment(draft.id, 'Auto-cancelled — posting failed')
            .catchError((_) => draft);
      }
      if (mounted) {
        RunqSnack.error(context, "Couldn't adjust stock", description: snackErrorText(e));
      }
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Adjust Stock',
        onBack: () => Navigator.of(context).pop(),
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          _itemHeader(t),
          const SizedBox(height: 18),
          const InvFieldLabel('Location'),
          ..._locationSection(),
          const SizedBox(height: 18),
          const InvFieldLabel('What is this quantity?'),
          AdjustModeToggle(
            mode: _mode,
            onChanged: _setMode,
            disabled: {
              for (final m in AdjustMode.values)
                if (!_modeAllowed(m)) m,
            },
          ),
          if (_holding == null) ...[
            const SizedBox(height: 6),
            Text(
              _loadingStock
                  ? 'Checking what is on hand…'
                  : 'Nothing is on hand here yet, so only stock arriving can be booked.',
              style: RunqText.caption.copyWith(color: RT(context).muted2),
            ),
          ],
          const SizedBox(height: 14),
          _qtyField(t),
          const SizedBox(height: 18),
          const InvFieldLabel('Reason'),
          AdjustReasonChips(
            isOutbound: _isOutbound,
            value: _effectiveReason,
            onChanged: (r) => setState(() => _reason = r),
          ),
          if (_isOther) ...[
            const SizedBox(height: 12),
            _otherReasonField(t),
          ],
        ],
      ),
      bottomNavigationBar: _bottomBar(t),
    );
  }

  Widget _itemHeader(RunqTokens t) => InvCard(
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // The unit qualifies the item, so it sits with the name and
              // is stated once. Every number on this screen is in it.
              Text.rich(
                TextSpan(children: [
                  TextSpan(
                    text: widget.item.name,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                  ),
                  if (_unit.isNotEmpty)
                    TextSpan(
                      text: '  $_unit',
                      style: RunqText.caption.copyWith(color: t.muted2),
                    ),
                ]),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if ((widget.item.sku ?? '').isNotEmpty)
                Text(
                  widget.item.sku!,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        // The figure every mode measures against — the selected holding, not
        // the item's total. With stock in more than one lot those differ,
        // and "Set to 30" means thirty *here*, so say which "here" it is.
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              invFmtQty(_currentQty),
              style: RunqText.h4.copyWith(color: t.ink),
            ),
            if (_qtyScope != null)
              Text(
                _qtyScope!,
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
          ],
        ),
      ],
    ),
  );

  List<Widget> _locationSection() {
    return [
      // With no stock anywhere there is nothing to choose between, so the
      // dropdown would offer a single "somewhere else" row above the picker
      // that actually does the work. Go straight to the picker.
      if (_holdings.isNotEmpty)
        AdjustLocationField(
          holdings: _holdings,
          selected: _holding,
          newLocationLabel: 'Another warehouse',
          onChanged: _select,
        ),
      if (_holding == null) ...[
        if (_holdings.isNotEmpty) const SizedBox(height: 10),
        WarehousePicker(
          value: _warehouseId,
          allowAll: false,
          dense: true,
          onChanged: (id) => setState(() => _warehouseId = id),
        ),
      ],
      if (_opensNewBatch) ...[
        const SizedBox(height: 10),
        TextField(
          controller: _batch,
          textCapitalization: TextCapitalization.characters,
          style: RunqText.body.copyWith(color: RT(context).ink),
          cursorColor: InvColors.brand(context),
          decoration: invInputDecoration(
            context,
            hint: invSuggestBatchNo(
              sku: widget.item.sku,
              itemName: widget.item.name,
              on: DateTime.now(),
            ),
          ),
          onChanged: (_) => setState(() {}),
        ),
      ],
    ];
  }

  Widget _qtyField(RunqTokens t) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      InvFieldLabel(_mode.fieldLabel),
      TextField(
        controller: _qty,
        autofocus: _holdings.isNotEmpty,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: RunqText.h4.copyWith(color: t.ink),
        cursorColor: InvColors.brand(context),
        decoration: invInputDecoration(
          context,
          hint: '0',
          suffix: _unit.isEmpty
              ? null
              : Padding(
                  padding: const EdgeInsets.only(right: 12, top: 12),
                  child: Text(
                    _unit,
                    style: RunqText.caption.copyWith(color: t.muted2),
                  ),
                ),
        ),
        onChanged: (_) => setState(() {}),
      ),
    ],
  );

  /// Free text that *is* the reason. Nothing downstream can validate it, so
  /// the save button stays dead until it says something.
  Widget _otherReasonField(RunqTokens t) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const InvFieldLabel('What happened?'),
      TextField(
        controller: _otherReason,
        textCapitalization: TextCapitalization.sentences,
        maxLength: 120,
        style: RunqText.body.copyWith(color: t.ink),
        cursorColor: InvColors.brand(context),
        decoration: invInputDecoration(
          context,
          hint: 'e.g. Sample pulled for FSSAI inspection',
        ).copyWith(counterText: ''),
        onChanged: (_) => setState(() {}),
      ),
      Text(
        'Shown on the stock movement trail in place of a reason.',
        style: RunqText.caption.copyWith(color: t.muted2),
      ),
    ],
  );

  /// The whole point of the screen: spell out the before → after, so a typo
  /// or a wrong mode is caught before it hits the ledger.
  ///
  /// Lives in the bottom bar, not the form. It used to sit under the quantity
  /// field — which is precisely where the keypad covers it, so the one figure
  /// that proves the number is right was hidden for every keystroke that
  /// could get it wrong. The bar rises with the keypad, so the result now
  /// sits directly above the keys being pressed.
  Widget _previewCard(RunqTokens t) {
    final d = _delta;
    if (d == null || d == 0) {
      return Text(
        '$_onHandPhrase right now',
        style: RunqText.caption.copyWith(color: t.muted2),
      );
    }
    if (_resultQty < 0) {
      return Text(
        "Can't remove more than the $_onHandPhrase",
        style: RunqText.caption.copyWith(color: InvColors.error),
      );
    }
    final color = d < 0 ? InvColors.error : InvColors.success;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(d < 0 ? Icons.south_rounded : Icons.north_rounded, size: 15, color: color),
            const SizedBox(width: 6),
            Text(
              '${d < 0 ? 'Removing' : 'Adding'} ${invFmtQty(d.abs())}',
              style: RunqText.bodyStrong.copyWith(color: color),
            ),
            const Spacer(),
            Text(
              '${invFmtQty(_currentQty)} → ${invFmtQty(_resultQty)}',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
        ),
        if (_splitNote != null) ...[
          const SizedBox(height: 4),
          Text(
            _splitNote!,
            style: RunqText.micro.copyWith(color: t.muted2),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ],
    );
  }

  /// Which lots a withdrawal is about to come out of, when it is more than
  /// one. The user asked for a total and does not choose lots — but the
  /// ledger will record this split, and it is the kind of thing that should
  /// not be a surprise afterwards. Silent for a single lot, where the movement
  /// and the lot are the same thing.
  String? get _splitNote {
    final lines = _lines();
    if (lines.length < 2) return null;
    final parts = lines.map(
      (l) => '${l.batchNo ?? 'unbatched'} ${invFmtQty(l.qtyDelta.abs())}',
    );
    return 'from ${parts.join('  ·  ')}';
  }

  /// `resizeToAvoidBottomInset` only shrinks the Scaffold *body* — a
  /// bottomNavigationBar still sits *under* the keypad, which is where the
  /// result strip went the first time. Lift the whole bar by the inset
  /// ourselves, the way `GstActionBar` does.
  Widget _bottomBar(RunqTokens t) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _previewCard(t),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _canSave ? _save : null,
                style: FilledButton.styleFrom(
                  backgroundColor: InvColors.brand(context),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(_buttonLabel(), style: RunqText.bodyStrong.copyWith(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  /// The button repeats the action in words — the last chance to notice the
  /// number is going the wrong way.
  ///
  /// Set-to names the target, not the movement it works out to. The delta is
  /// what posts, but it is not what was asked for: setting a lot of 120 to 20
  /// put "Remove 100" on the button under a field reading 20, which reads as
  /// the screen having misunderstood the entry. The preview directly above
  /// still spells the movement out (Removing 100 · 120 → 20), so the
  /// direction is stated either way.
  String _buttonLabel() {
    final d = _delta;
    if (d == null || d == 0) return 'Post adjustment';
    final target = _entered;
    if (_mode == AdjustMode.setTo && target != null) {
      return 'Set to ${invFmtQty(target)} $_unit'.trim();
    }
    return d < 0
        ? 'Remove ${invFmtQty(d.abs())} $_unit'.trim()
        : 'Add ${invFmtQty(d)} $_unit'.trim();
  }
}
