// KPI, collections, top-list and state cards for sales_analytics_screen.dart.
// Split out to stay under the 500-line-per-file rule.

part of 'sales_analytics_screen.dart';

/// Section wrapper — a titled surface card, the shape every block on this
/// screen uses so the page reads as one stack.
class _Section extends StatelessWidget {
  final String title;
  final String? caption;
  final Widget child;
  const _Section({required this.title, required this.child, this.caption});

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

/// Four headline numbers. Net revenue leads because it is the one figure a
/// user would quote; the credit-note deduction is stated on its caption so a
/// gap against gross is never silent.
class _HeadlineCards extends StatelessWidget {
  final SalesHeadline headline;
  const _HeadlineCards({required this.headline});

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
                  icon: Icons.trending_up_rounded,
                  label: 'NET REVENUE',
                  value: formatINR(h.netRevenue, compact: true),
                  tinted: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ListStatCard(
                  icon: Icons.receipt_long_rounded,
                  label: h.invoiceCount == 1 ? 'INVOICE' : 'INVOICES',
                  value: '${h.invoiceCount}',
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
                  label: 'AVG INVOICE',
                  value: formatINR(h.avgInvoiceValue, compact: true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ListStatCard(
                  icon: Icons.people_alt_outlined,
                  label: 'CUSTOMERS',
                  value: '${h.activeCustomers}',
                ),
              ),
            ],
          ),
        ),
        if (h.creditNotes > 0) ...[
          const SizedBox(height: 8),
          _InlineNote(
            'Gross ${formatINR(h.grossRevenue, compact: true)} less '
            '${formatINR(h.creditNotes, compact: true)} in credit notes',
          ),
        ],
      ],
    );
  }
}

/// Collected vs still owed on the window's own invoices, with the meter
/// showing how much of what was billed has actually landed.
class _CollectionsCard extends StatelessWidget {
  final SalesCollections collections;
  final SalesHeadline headline;
  const _CollectionsCard({required this.collections, required this.headline});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final c = collections;
    final ratio = (c.collectedRatio / 100).clamp(0.0, 1.0);
    return _Section(
      title: 'Collections',
      caption: c.avgDaysToPay == null
          ? 'Nothing from this period has been paid yet'
          : 'Paid on average ${c.avgDaysToPay} days after invoice date',
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
                child: _MiniStat(
                  label: 'Received',
                  value: formatINR(c.receivedInPeriod, compact: true),
                  tone: t.brand,
                ),
              ),
              Expanded(
                child: _MiniStat(
                  label: 'Still owed',
                  value: formatINR(c.outstandingFromPeriod, compact: true),
                  tone: c.outstandingFromPeriod > 0 ? RunqColors.amberInk : t.muted,
                ),
              ),
              Expanded(
                child: _MiniStat(
                  label: 'Collected',
                  value: '${c.collectedRatio.toStringAsFixed(0)}%',
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

class _MiniStat extends StatelessWidget {
  final String label, value;
  final Color tone;
  const _MiniStat({required this.label, required this.value, required this.tone});

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

/// Top items by revenue. A plain ranked list rather than a chart — the
/// interesting comparison is between neighbouring rows, which a bar chart of
/// eight long product names renders unreadable on a phone.
class _TopItemsCard extends StatelessWidget {
  final List<SalesTopItem> rows;
  const _TopItemsCard({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) {
      return const _Section(title: 'Top items', child: _EmptyLine('No invoice lines in this period'));
    }
    final max = rows.first.revenue;
    return _Section(
      title: 'Top items',
      caption: 'By revenue, grouped on the invoice line description',
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 14, color: t.hairlineSoft),
            _RankedRow(
              rank: i + 1,
              title: rows[i].description,
              sub: '${_qty(rows[i].quantity)}${rows[i].uom == null ? '' : ' ${rows[i].uom}'}',
              value: formatINR(rows[i].revenue, compact: true),
              fraction: max > 0 ? rows[i].revenue / max : 0,
            ),
          ],
        ],
      ),
    );
  }
}

class _RankedRow extends StatelessWidget {
  final int rank;
  final String title, sub, value;
  final double fraction;
  const _RankedRow({
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
            Text(sub, style: RunqText.micro.copyWith(color: t.muted2)),
          ],
        ),
      ],
    );
  }
}

// ── State cards ──────────────────────────────────────────────────────────

class _LoadingBlock extends StatelessWidget {
  const _LoadingBlock();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.only(top: 80),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
}

class _ErrorCard extends StatelessWidget {
  final String message;
  const _ErrorCard({required this.message});

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

class _NoSalesCard extends StatelessWidget {
  /// Set when the view is scoped to one customer, so an empty result reads as
  /// "they bought nothing" rather than "the business sold nothing".
  final String? customerName;
  const _NoSalesCard({this.customerName});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final scoped = customerName != null;
    return RunqCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 28),
      child: Column(
        children: [
          Icon(Icons.bar_chart_rounded, size: 26, color: t.muted2),
          const SizedBox(height: 10),
          Text(
            scoped ? 'No sales to $customerName' : 'No sales in this period',
            style: RunqText.bodyStrong.copyWith(color: t.ink),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            scoped
                ? 'Nothing invoiced to them in this period — try a wider range '
                    'or clear the customer filter.'
                : 'Pick a wider range, or raise your first invoice for it.',
            style: RunqText.caption.copyWith(color: t.muted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _EmptyLine extends StatelessWidget {
  final String message;
  const _EmptyLine(this.message);

  @override
  Widget build(BuildContext context) => Text(
        message,
        style: RunqText.caption.copyWith(color: RT(context).muted),
      );
}

class _InlineNote extends StatelessWidget {
  final String message;
  const _InlineNote(this.message);

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

/// States the basis once, at the bottom, so the numbers above can be
/// compared with the P&L without anyone having to guess why they differ.
class _BasisFootnote extends StatelessWidget {
  const _BasisFootnote();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Text(
      'Invoice basis — issued invoices dated in this period, net of credit '
      'notes issued in it. Drafts and cancelled invoices are excluded. This '
      'can differ from the P&L, which is on a GL basis.',
      style: RunqText.micro.copyWith(color: t.muted2, height: 1.5),
    );
  }
}

String _qty(double v) {
  if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
  return v
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}
