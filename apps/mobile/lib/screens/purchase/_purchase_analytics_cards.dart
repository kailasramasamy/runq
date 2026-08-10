// KPI, payments, top-list and state cards for purchase_analytics_screen.dart.
// Split out to stay under the 500-line-per-file rule.

part of 'purchase_analytics_screen.dart';

/// Section wrapper — a titled surface card, the shape every block on this
/// screen uses so the page reads as one stack.
class _PurchaseSection extends StatelessWidget {
  final String title;
  final String? caption;
  final Widget child;
  const _PurchaseSection({required this.title, required this.child, this.caption});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          if (caption != null) ...[
            const SizedBox(height: 2),
            Text(caption!, style: RunqText.caption.copyWith(color: t.muted)),
          ],
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

/// Four headline numbers. Net spend leads; the debit-note deduction is stated
/// beneath it so a gap against gross is never silent.
class _PurchaseHeadlineCards extends StatelessWidget {
  final PurchaseHeadline headline;
  const _PurchaseHeadlineCards({required this.headline});

  @override
  Widget build(BuildContext context) {
    final h = headline;
    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ListStatCard(
                  icon: Icons.trending_down_rounded,
                  label: 'NET SPEND',
                  value: formatINR(h.netSpend, compact: true),
                  tinted: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ListStatCard(
                  icon: Icons.description_outlined,
                  label: h.billCount == 1 ? 'BILL' : 'BILLS',
                  value: '${h.billCount}',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ListStatCard(
                  icon: Icons.sell_outlined,
                  label: 'AVG BILL',
                  value: formatINR(h.avgBillValue, compact: true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ListStatCard(
                  icon: Icons.storefront_outlined,
                  label: 'VENDORS',
                  value: '${h.activeVendors}',
                ),
              ),
            ],
          ),
        ),
        if (h.debitNotes > 0) ...[
          const SizedBox(height: 8),
          _PurchaseInlineNote(
            'Gross ${formatINR(h.grossSpend, compact: true)} less '
            '${formatINR(h.debitNotes, compact: true)} in debit notes',
          ),
        ],
      ],
    );
  }
}

/// Paid vs still owed on the window's own bills, with the meter showing how
/// much of what was billed has actually gone out.
class _PaymentsCard extends StatelessWidget {
  final PurchasePayments payments;
  const _PaymentsCard({required this.payments});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final p = payments;
    final ratio = (p.paidRatio / 100).clamp(0.0, 1.0);
    return _PurchaseSection(
      title: 'Payments',
      caption: p.avgDaysToPay == null
          ? 'Nothing from this period has been paid yet'
          : 'Paid on average ${p.avgDaysToPay} days after bill date',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 8,
              backgroundColor: t.hairlineSoft,
              valueColor: AlwaysStoppedAnimation(t.brand),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _PurchaseMiniStat(
                  label: 'Paid',
                  value: formatINR(p.paidInPeriod, compact: true),
                  tone: t.brand,
                ),
              ),
              Expanded(
                child: _PurchaseMiniStat(
                  label: 'Still owed',
                  value: formatINR(p.outstandingFromPeriod, compact: true),
                  tone: p.outstandingFromPeriod > 0 ? RunqColors.amberInk : t.muted,
                ),
              ),
              Expanded(
                child: _PurchaseMiniStat(
                  label: 'Settled',
                  value: '${p.paidRatio.toStringAsFixed(0)}%',
                  tone: t.ink,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PurchaseMiniStat extends StatelessWidget {
  final String label, value;
  final Color tone;
  const _PurchaseMiniStat({
    required this.label,
    required this.value,
    required this.tone,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.4)),
        const SizedBox(height: 3),
        Text(value,
            style: RunqText.tabular(size: 15, w: FontWeight.w700, color: tone),
            maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
    );
  }
}

/// Top bought items by spend — the ranked list, not a chart: the interesting
/// comparison is between neighbouring rows, which a bar chart of eight long
/// item names renders unreadable on a phone.
class _PurchaseTopItemsCard extends StatelessWidget {
  final List<PurchaseTopItem> rows;
  const _PurchaseTopItemsCard({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) {
      return const _PurchaseSection(
          title: 'Most bought', child: _PurchaseEmptyLine('No bill lines in this period'));
    }
    final max = rows.first.spend;
    return _PurchaseSection(
      title: 'Most bought',
      caption: 'By spend, grouped on the bill line name',
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 14, color: t.hairlineSoft),
            _PurchaseRankedRow(
              rank: i + 1,
              title: rows[i].description,
              sub: _qtyLabel(rows[i]),
              value: formatINR(rows[i].spend, compact: true),
              fraction: max > 0 ? rows[i].spend / max : 0,
            ),
          ],
        ],
      ),
    );
  }

  static String _qtyLabel(PurchaseTopItem r) {
    final qty = _purchaseQty(r.quantity);
    return r.sku == null || r.sku!.isEmpty ? qty : '$qty · ${r.sku}';
  }
}

class _PurchaseRankedRow extends StatelessWidget {
  final int rank;
  final String title, sub, value;
  final double fraction;
  const _PurchaseRankedRow({
    required this.rank,
    required this.title,
    required this.sub,
    required this.value,
    required this.fraction,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 18,
          child: Text('$rank',
              style: RunqText.tabular(size: 12, w: FontWeight.w700, color: t.muted2)),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: RunqText.body.copyWith(color: t.ink),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: fraction.clamp(0.0, 1.0),
                  minHeight: 4,
                  backgroundColor: t.hairlineSoft,
                  valueColor: AlwaysStoppedAnimation(t.brand.withValues(alpha: 0.55)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(value,
                style: RunqText.tabular(size: 13, w: FontWeight.w700, color: t.ink)),
            const SizedBox(height: 2),
            Text(sub,
                style: RunqText.micro.copyWith(color: t.muted2),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ],
    );
  }
}

// ── State cards ──────────────────────────────────────────────────────────

class _PurchaseLoadingBlock extends StatelessWidget {
  const _PurchaseLoadingBlock();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.only(top: 80),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
}

class _PurchaseErrorCard extends StatelessWidget {
  final String message;
  const _PurchaseErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      child: Column(
        children: [
          Icon(Icons.error_outline_rounded, color: RunqColors.redInk, size: 22),
          const SizedBox(height: 8),
          Text('Could not load analytics',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(message,
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _NoPurchasesCard extends StatelessWidget {
  /// Set when the view is scoped to one vendor, so an empty result reads as
  /// "we bought nothing from them" rather than "we bought nothing".
  final String? vendorName;
  const _NoPurchasesCard({this.vendorName});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final scoped = vendorName != null;
    return RunqCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 28),
      child: Column(
        children: [
          Icon(Icons.bar_chart_rounded, size: 26, color: t.muted2),
          const SizedBox(height: 10),
          Text(
            scoped ? 'No purchases from $vendorName' : 'No purchases in this period',
            style: RunqText.bodyStrong.copyWith(color: t.ink),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            scoped
                ? 'Nothing billed by them in this period — try a wider range or '
                    'clear the vendor filter.'
                : 'Pick a wider range, or record your first bill for it.',
            style: RunqText.caption.copyWith(color: t.muted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _PurchaseEmptyLine extends StatelessWidget {
  final String message;
  const _PurchaseEmptyLine(this.message);

  @override
  Widget build(BuildContext context) => Text(
        message,
        style: RunqText.caption.copyWith(color: RT(context).muted),
      );
}

class _PurchaseInlineNote extends StatelessWidget {
  final String message;
  const _PurchaseInlineNote(this.message);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Icon(Icons.info_outline_rounded, size: 12, color: t.muted2),
        const SizedBox(width: 6),
        Expanded(
          child: Text(message, style: RunqText.micro.copyWith(color: t.muted2)),
        ),
      ],
    );
  }
}

/// States the basis once, at the bottom, so the numbers above can be compared
/// with the P&L without anyone having to guess why they differ.
class _PurchaseBasisFootnote extends StatelessWidget {
  const _PurchaseBasisFootnote();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Text(
      'Bill basis — vendor bills dated in this period, net of debit notes '
      'issued in it. Drafts and cancelled bills are excluded; bills still '
      'awaiting a match are included. This can differ from the P&L, which is '
      'on a GL basis.',
      style: RunqText.micro.copyWith(color: t.muted2, height: 1.5),
    );
  }
}

String _purchaseQty(double v) {
  if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
  return v
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}
