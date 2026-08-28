// Input pool — what a run would draw on, in the order it would draw it.
//
// On a dairy floor this is the milk pool: cut-open pouches and yesterday's
// balance ahead of the tanker that landed at noon. The ordering comes from the
// server, which builds it with the same merged FEFO queue the backflush walks
// — a pool that sorted its own way would show one thing and the next run would
// take another.
//
// Read-only on purpose. Looking reserves nothing; the screen exists so the
// floor can see whether the next batch breaks into fresh stock before
// committing, and so stock that is in the books but not in the tank has
// somewhere to show itself.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/manufacturing_models.dart';
import '../../api/manufacturing_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../inventory/widgets/inv_primitives.dart' show compactINR;
import '../inventory/widgets/warehouse_picker.dart';
import '_record_production_form_cards.dart';
import '_wo_summary_bom_picker.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';
import '../../utils/format_qty.dart';

class InputPoolScreen extends ConsumerStatefulWidget {
  const InputPoolScreen({super.key});

  @override
  ConsumerState<InputPoolScreen> createState() => _InputPoolScreenState();
}

class _InputPoolScreenState extends ConsumerState<InputPoolScreen> {
  String? _bomId;
  String? _bomCode;
  String? _warehouseId;
  InputPool? _pool;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _applyDefaultWarehouse());
  }

  /// Mirrors Record Production: most plants run out of one warehouse, so the
  /// pick is a tap that can only be got wrong.
  Future<void> _applyDefaultWarehouse() async {
    final whs = await ref.read(invWarehousesProvider.future);
    if (!mounted || _warehouseId != null || whs.isEmpty) return;
    final pick = whs.firstWhere((w) => w.isDefault, orElse: () => whs.first);
    setState(() => _warehouseId = pick.id);
    _load();
  }

  Future<void> _load() async {
    final bomId = _bomId;
    final warehouseId = _warehouseId;
    if (bomId == null || warehouseId == null) return;

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final pool = await manufacturingRepo.inputPool(
        bomId: bomId,
        warehouseId: warehouseId,
      );
      if (!mounted) return;
      setState(() {
        _pool = pool;
        _loading = false;
      });
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _pickBom() async {
    final picked = await showWoSummaryBomPicker(context);
    if (picked == null || !mounted) return;
    setState(() {
      _bomId = picked.id;
      _bomCode = picked.bomCode;
      _pool = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          const MfgPlainAppBar(title: 'Input pool'),
          Expanded(
            child: RefreshIndicator(
              color: MfgColors.brand(context),
              onRefresh: _load,
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                children: [
                  MfgCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        RecordProductionPickerTile(
                          label: 'BOM',
                          value: _bomCode,
                          onTap: _pickBom,
                        ),
                        const SizedBox(height: 10),
                        WarehousePicker(
                          value: _warehouseId,
                          onChanged: (id) {
                            setState(() => _warehouseId = id);
                            _load();
                          },
                          label: 'Warehouse',
                          allowAll: false,
                          dense: true,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Nothing here is reserved — this is what a run would '
                          'draw on, oldest first.',
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  ..._body(context),
                ],
              ),
            ),
          ),
        ]),
      ),
    );
  }

  List<Widget> _body(BuildContext context) {
    if (_bomId == null) {
      return const [
        MfgEmptyState(
          icon: Icons.layers_outlined,
          title: 'Pick a recipe',
          description: 'The pool is shown per BOM — its inputs and everything they '
              'accept instead.',
        ),
      ];
    }
    if (_loading && _pool == null) {
      return [
        const Center(child: Padding(
          padding: EdgeInsets.only(top: 48),
          child: CircularProgressIndicator(),
        )),
      ];
    }
    if (_error != null) {
      return [
        MfgEmptyState(
          icon: Icons.error_outline,
          title: 'Could not load the pool',
          description: _error!,
        ),
      ];
    }
    final pool = _pool;
    if (pool == null || pool.lines.isEmpty) {
      return const [
        MfgEmptyState(
          icon: Icons.layers_outlined,
          title: 'No input lines',
          description: 'This BOM has nothing to pool.',
        ),
      ];
    }
    return [
      for (final line in pool.lines) ...[
        _PoolLineCard(line: line),
        const SizedBox(height: 12),
      ],
    ];
  }
}

class _PoolLineCard extends StatelessWidget {
  final InputPoolLine line;
  const _PoolLineCard({required this.line});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // How far down the queue the next batch reaches — the boundary between
    // milk that needs using and stock the run would not touch.
    var drawn = 0.0;
    final inNextDraw = <bool>[];
    for (final b in line.batches) {
      inNextDraw.add(drawn < line.qtyPerBatch);
      drawn += b.qty;
    }

    return MfgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(
              child: Text(line.inputItemName,
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ),
            Text('${_trim(line.totalQty, line.uom)} ${line.uom}',
                style: RunqText.bodyStrong.copyWith(color: t.ink)),
          ]),
          if (line.substitutes.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              'pooled with ${line.substitutes.map((s) => s.itemName).join(' / ')}',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(children: [
              TextSpan(
                text: '${_trim(line.qtyPerBatch, line.uom)} ${line.uom} per batch — ',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
              TextSpan(
                text: '${line.batchesCovered} full '
                    '${line.batchesCovered == 1 ? 'batch' : 'batches'}',
                style: RunqText.caption.copyWith(
                  color: t.ink,
                  fontWeight: FontWeight.w600,
                ),
              ),
              TextSpan(
                text: ' covered by what is on hand.',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ]),
          ),
          const SizedBox(height: 10),
          if (line.batches.isEmpty)
            Text('Nothing on hand.',
                style: RunqText.caption.copyWith(color: t.muted))
          else
            for (var i = 0; i < line.batches.length; i++) ...[
              if (i > 0) Divider(color: t.hairline, height: 14),
              _BatchRow(
                batch: line.batches[i],
                uom: line.uom,
                inNextDraw: inNextDraw[i],
              ),
            ],
        ],
      ),
    );
  }
}

class _BatchRow extends StatelessWidget {
  final InputPoolBatch batch;
  final String uom;

  /// Falls inside what the next batch would draw, so it reads as "next".
  final bool inNextDraw;

  const _BatchRow({
    required this.batch,
    required this.uom,
    required this.inNextDraw,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Flexible(
                  child: Text(batch.itemName,
                      style: RunqText.body.copyWith(color: t.ink)),
                ),
                if (inNextDraw) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: MfgColors.brand(context).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text('next draw',
                        style: RunqText.caption.copyWith(
                          color: MfgColors.brand(context),
                          fontWeight: FontWeight.w600,
                        )),
                  ),
                ],
              ]),
              const SizedBox(height: 2),
              Text(
                [
                  if (batch.batchNo != null && batch.batchNo!.isNotEmpty)
                    batch.batchNo!,
                  batch.expiryDate == null ? 'No expiry' : 'Exp ${batch.expiryDate}',
                  '${compactINR(batch.unitCost)}/$uom',
                ].join(' · '),
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Text('${_trim(batch.qty)} $uom',
            style: RunqText.body.copyWith(color: t.ink)),
      ],
    );
  }
}

String _trim(double v, [String? unit]) => formatItemQty(v, null, unit: unit);
