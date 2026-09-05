// The raw-material card and the Record Production button for
// manufacturing_home_screen.dart. Kept in a separate file to stay under the
// 500-line-per-file rule; included via `part of`.

part of 'manufacturing_home_screen.dart';

// ── Raw materials on hand ─────────────────────────────────────────────────

/// What the floor works out of, and nothing else.
///
/// The card used to list every input in stock — the milk this plant opens the
/// app for, alongside the drum of coconut oil and the sack of jaggery it
/// touches once a fortnight. A category can now be flagged as the shop
/// floor's own (Masters → Categories), and the card leads with those; the rest
/// live one tap away under "See all". A tenant that has flagged nothing sees
/// every input, exactly as before.
///
/// Tapping an item opens its pool as a sheet rather than expanding a row: the
/// question is "which lot do I open next", and that is answered by arrival
/// time and expiry, neither of which fits on a home-screen row.
class _RawMaterialsSection extends ConsumerWidget {
  const _RawMaterialsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(invOnHandProvider(
        (warehouseId: null, lowOnly: false, itemClassGroup: 'inputs')));

    // A failed fetch used to collapse to nothing — the section read
    // `.asData?.value ?? []` and then hid itself on an empty list, so a broken
    // stock endpoint looked exactly like a plant with no stock. Say which one
    // it is; a card the floor cannot explain is worse than an error they can.
    final error = async.error;
    if (error != null) {
      return Column(children: [
        const MfgSectionHeader(label: 'Raw materials on hand'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: MfgCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, size: 18, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Could not load stock. Pull down to retry.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 8),
      ]);
    }

    final rows = async.asData?.value ?? const <InvOnHandRow>[];
    // Still loading, or genuinely nothing in stock. Neither earns a card on a
    // home screen: the first resolves itself, and the second is answered by
    // the empty state one tap away.
    if (rows.isEmpty) return const SizedBox.shrink();

    final shown = primaryInputs(rows);
    // Counted in items, not batch rows — "2 more" has to mean two more
    // materials, or a milk pool with eighty lots reads as eighty hidden
    // things.
    final hidden = rows.map((r) => r.itemId).toSet().length -
        shown.map((r) => r.itemId).toSet().length;

    // Batches grouped under their item, biggest holding first.
    final byItem = <String, List<InvOnHandRow>>{};
    for (final r in shown) {
      byItem.putIfAbsent(r.itemId, () => []).add(r);
    }
    final itemIds = byItem.keys.toList()
      ..sort((x, y) => _qtyOf(byItem[y]!).compareTo(_qtyOf(byItem[x]!)));

    return Column(children: [
      MfgSectionHeader(
        label: 'Raw materials on hand',
        trailing: TextButton(
          onPressed: () => context.push('/manufacturing/raw-materials'),
          child: Text(
            hidden > 0 ? 'See all ($hidden more) →' : 'See all →',
            style: RunqText.caption.copyWith(color: MfgColors.brand(context)),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: MfgCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          child: Column(children: [
            for (var i = 0; i < itemIds.length; i++) ...[
              if (i > 0) Divider(color: t.hairline, height: 1),
              _MaterialRow(batches: byItem[itemIds[i]]!),
            ],
          ]),
        ),
      ),
      const SizedBox(height: 8),
    ]);
  }

  static double _qtyOf(List<InvOnHandRow> rs) =>
      rs.fold<double>(0, (sum, r) => sum + r.qty);
}

/// The inputs filed under a category the tenant flagged as the shop floor's
/// own (or under a flagged parent).
///
/// Falls back to every input when none of the flagged ones are in stock. That
/// covers both the unconfigured tenant, who must not open the module to an
/// empty card, and the shift that has run the milk down to nothing — showing
/// what is left beats showing a blank.
List<InvOnHandRow> primaryInputs(List<InvOnHandRow> rows) {
  final flagged = rows.where((r) => r.categoryIsPrimaryInput).toList();
  return flagged.isEmpty ? rows : flagged;
}

/// One item's whole holding: name, lot count, total, and the soonest expiry
/// among its lots. No rupee figure — what stock is worth is Inventory's
/// question, and on the floor it is one more number to read past.
class _MaterialRow extends StatelessWidget {
  const _MaterialRow({required this.batches});
  final List<InvOnHandRow> batches;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final first = batches.first;
    final qty = batches.fold<double>(0, (sum, r) => sum + r.qty);
    final unit = (first.itemUnit ?? '').isEmpty ? '' : ' ${first.itemUnit}';
    final soonest = _soonestExpiry(batches);

    return InkWell(
      onTap: () => showMfgMaterialSheet(context, rows: batches),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(first.itemName,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.body.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Row(children: [
                Text('${batches.length} lot${batches.length == 1 ? '' : 's'}',
                    style: RunqText.micro.copyWith(color: t.muted)),
                if (soonest != null) ...[
                  const SizedBox(width: 6),
                  _ExpiryPill(iso: soonest),
                ],
              ]),
            ]),
          ),
          const SizedBox(width: 8),
          Text('${formatItemQty(qty, null, unit: first.itemUnit)}$unit',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          Icon(Icons.chevron_right_rounded, size: 20, color: t.muted2),
        ]),
      ),
    );
  }

  static String? _soonestExpiry(List<InvOnHandRow> rows) {
    String? out;
    for (final r in rows) {
      final e = r.expiryDate;
      if (e == null || e.isEmpty) continue;
      if (out == null || e.compareTo(out) < 0) out = e;
    }
    return out;
  }
}

/// The run-now signal, sized to sit beside a lot count. Red once the soonest
/// lot is out of time, amber while it still has a day or two.
class _ExpiryPill extends StatelessWidget {
  const _ExpiryPill({required this.iso});
  final String iso;

  @override
  Widget build(BuildContext context) {
    final label = shortExpiry(iso);
    if (label == null) return const SizedBox.shrink();
    final date = DateTime.tryParse(iso);
    final now = DateTime.now();
    final days = date == null
        ? 99
        : DateTime(date.year, date.month, date.day)
            .difference(DateTime(now.year, now.month, now.day))
            .inDays;
    final (bg, fg) = days <= 0
        ? (MfgColors.errorBg, MfgColors.error)
        : days <= 2
            ? (MfgColors.orangeAlertBg, MfgColors.orangeAlert)
            : (RT(context).bgWarm, RT(context).muted);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text('exp $label',
          style: RunqText.micro.copyWith(color: fg, fontWeight: FontWeight.w600)),
    );
  }
}

/// The action the module exists for, on the screen it opens to.
///
/// This plant has never scheduled a work order — every run it has ever logged
/// came through Record Production. Leaving that behind the FAB and the Menu
/// asked the floor to go looking for the only thing they came to do.
class _RecordProductionButton extends StatelessWidget {
  const _RecordProductionButton();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
        child: SizedBox(
          width: double.infinity,
          child: MfgPrimaryButton(
            label: 'Record production',
            icon: Icons.bolt_rounded,
            onPressed: () => context.push('/manufacturing/production/new'),
          ),
        ),
      );
}
