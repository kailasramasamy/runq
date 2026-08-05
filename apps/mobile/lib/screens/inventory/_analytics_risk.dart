// Risk + forecast cards for inventory_analytics_screen.dart. Split from
// _analytics_widgets.dart to stay under the 500-line-per-file rule.

part of 'inventory_analytics_screen.dart';

// ── Risk ─────────────────────────────────────────────────────────────────

class _RiskCard extends StatelessWidget {
  final InvStockRisk risk;
  const _RiskCard({required this.risk});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = [...risk.outOfStock, ...risk.critical, ...risk.warning].take(6).toList();
    if (rows.isEmpty) {
      return const _EmptyCard(
        title: 'Stock at risk',
        message: 'Nothing is out of stock or below its reorder level.',
      );
    }
    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Stock at risk',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text('Out of stock first, then below reorder level',
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 12),
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(r.itemName,
                            style: RunqText.caption.copyWith(
                                color: t.ink, fontWeight: FontWeight.w600),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(
                          r.level == 'out'
                              ? '${r.daysOut}d out'
                              : '${_qty(r.onHand)}${r.itemUnit == null ? '' : ' ${r.itemUnit}'}'
                                  ' · reorder at ${r.reorderLevel == null ? '—' : _qty(r.reorderLevel!)}',
                          style: RunqText.micro.copyWith(color: t.muted2),
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _LevelBadge(level: r.level),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Status pill. The label always renders — colour is reinforcement only,
/// never the sole carrier of the meaning.
class _LevelBadge extends StatelessWidget {
  final String level;
  const _LevelBadge({required this.level});

  @override
  Widget build(BuildContext context) {
    final (Color c, String label) = switch (level) {
      'out' => (InvColors.error, 'Out'),
      'critical' => (InvColors.orangeAlert, 'Critical'),
      'warning' => (InvColors.amber, 'Low'),
      _ => (InvColors.success, 'OK'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: RunqText.micro.copyWith(color: c, fontWeight: FontWeight.w700)),
    );
  }
}

// ── Forecast ─────────────────────────────────────────────────────────────

class _ForecastCard extends StatelessWidget {
  final InvForecast forecast;
  const _ForecastCard({required this.forecast});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = forecast.items.take(6).toList();
    if (rows.isEmpty) {
      return const _EmptyCard(
        title: 'Running out next',
        message: 'Nothing is projected to run out in the next 60 days.',
      );
    }
    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Running out next',
              style: RunqText.h3.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text('Projected from recent demand',
              style: RunqText.caption.copyWith(color: t.muted)),
          if (forecast.lateCount > 0) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: InvColors.error.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_rounded, size: 14, color: InvColors.error),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${forecast.lateCount} item${forecast.lateCount == 1 ? '' : 's'} past the order-by date',
                      style: RunqText.micro.copyWith(
                          color: InvColors.error, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const _RowDivider(),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(rows[i].itemName,
                                style: RunqText.bodyStrong.copyWith(color: t.ink),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                          if (!rows[i].hasEnoughHistory) ...[
                            const SizedBox(width: 6),
                            _LevelBadge(level: 'warning'),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        rows[i].reorderByDate == null
                            ? '${_qty(rows[i].runRate)}/day · no lead time set'
                            : 'order by ${rows[i].reorderByDate}',
                        style: RunqText.caption.copyWith(
                          color: rows[i].isLate ? InvColors.error : t.muted2,
                          fontWeight: rows[i].isLate ? FontWeight.w700 : FontWeight.w500,
                        ),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      rows[i].daysOfCover == null
                          ? '—'
                          : '${rows[i].daysOfCover!.round()}d',
                      style: RunqText.h3.copyWith(
                        color: rows[i].isUrgent ? InvColors.error : t.ink,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text('order ${_qty(rows[i].suggestedQty)}',
                        style: RunqText.caption.copyWith(color: t.muted2)),
                  ],
                ),
              ],
            ),
          ],
          const SizedBox(height: 4),
          if (forecast.expiryAtRisk > 0)
            Padding(
              padding: const EdgeInsets.only(top: 2, bottom: 8),
              child: Row(
                children: [
                  Icon(Icons.schedule_rounded, size: 13, color: t.muted2),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('Expiring stock at risk',
                        style: RunqText.micro.copyWith(color: t.muted)),
                  ),
                  Text(_inr(forecast.expiryAtRisk),
                      style: RunqText.caption.copyWith(
                          color: InvColors.orangeAlert, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}



// ── Suggested reorder levels ─────────────────────────────────────────────

/// What the reorder level SHOULD be. The operational alert list only reads
/// a hand-typed level, so a SKU nobody configured never raises an alert no
/// matter how thin it gets — this is the card that says so.
class _ReplenishmentCard extends StatelessWidget {
  final InvReplenishment data;
  const _ReplenishmentCard({required this.data});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = data.rows.take(6).toList();
    if (rows.isEmpty) {
      return const _EmptyCard(
        title: 'Suggested reorder levels',
        message: 'No item has enough demand history to compute a reorder point yet.',
      );
    }
    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Suggested reorder levels',
              style: RunqText.h3.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(
            '(demand/day x lead time) + safety stock, at ${data.serviceLevel}% service',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          if (data.unconfiguredCount > 0) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: InvColors.amber.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${data.unconfiguredCount} item${data.unconfiguredCount == 1 ? '' : 's'} '
                'have no reorder level set — alerts stay silent for them.',
                style: RunqText.micro.copyWith(
                    color: InvColors.amberDeep, fontWeight: FontWeight.w600),
              ),
            ),
          ],
          const SizedBox(height: 12),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const _RowDivider(),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(rows[i].itemName,
                                style: RunqText.bodyStrong.copyWith(color: t.ink),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                          if (rows[i].breachesSuggested) ...[
                            const SizedBox(width: 6),
                            _LevelBadge(level: 'out'),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${_qty(rows[i].avgDailyDemand)}/day '
                        '\u00b1${_qty(rows[i].demandSd)} \u00b7 lead ${rows[i].leadTimeDays}d'
                        '${rows[i].leadTimeAssumed ? '*' : ''}',
                        style: RunqText.caption.copyWith(color: t.muted2),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_qty(rows[i].suggestedReorderLevel),
                        style: RunqText.h3.copyWith(
                            color: t.ink, fontWeight: FontWeight.w700)),
                    Text(
                      rows[i].currentReorderLevel == null
                          ? 'not set'
                          : 'now ${_qty(rows[i].currentReorderLevel!)}',
                      style: RunqText.caption.copyWith(
                        color: (rows[i].gap ?? 0) > 0 ? InvColors.error : t.muted2,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
          const SizedBox(height: 4),
          if (data.rows.any((r) => r.leadTimeAssumed))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                '* lead time assumed at ${data.defaultLeadTimeDays} days.',
                style: RunqText.micro.copyWith(color: t.muted2),
              ),
            ),
        ],
      ),
    );
  }
}


/// Hairline between list rows. The two action cards read as tables now, so
/// each entry needs a boundary — without one the item name and the line
/// beneath it blur into the next row at these larger sizes.
class _RowDivider extends StatelessWidget {
  const _RowDivider();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Container(height: 1, color: t.hairlineSoft),
    );
  }
}
