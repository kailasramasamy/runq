import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/analytics_models.dart';
import '../../providers/analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'widgets.dart';

class GstSection extends ConsumerWidget {
  const GstSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        _LiabilityCard(value: ref.watch(gstLiabilityProvider)),
        const SizedBox(height: 12),
        _ReconCard(value: ref.watch(gstr2bReconProvider)),
        const SizedBox(height: 12),
        _Gstr1vs3bCard(value: ref.watch(gstr1Vs3bProvider)),
        const SizedBox(height: 12),
        _VendorsBlockingCard(value: ref.watch(vendorsNotFiledProvider)),
      ],
    );
  }
}

class _LiabilityCard extends StatelessWidget {
  final AsyncValue<GstLiabilityCurrent?> value;
  const _LiabilityCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<GstLiabilityCurrent>(
      title: 'GST liability',
      value: value,
      onTap: () => context.push('/gst'),
      footerLabel: 'View GST',
      emptyHint: 'GSTR-3B not generated yet',
      builder: (d) {
        if (!d.has3b) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(d.period.label,
                  style: RunqText.caption.copyWith(color: RT(context).muted2)),
              const SizedBox(height: 8),
              const StatusPill('Not generated', tone: StatusTone.neutral),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(d.period.label,
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            const SizedBox(height: 6),
            BigNumber(formatINR(d.totalPayable), size: 22),
            const SizedBox(height: 12),
            StatRow(label: 'ITC used', value: formatINR(d.totalItcUsed, compact: true)),
            StatRow(
                label: 'Cash payable',
                value: formatINR(d.totalCashPayable, compact: true),
                emphasize: true),
          ],
        );
      },
    );
  }
}

class _ReconCard extends StatelessWidget {
  final AsyncValue<Gstr2bReconSummary?> value;
  const _ReconCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<Gstr2bReconSummary>(
      title: 'GSTR-2B vs purchase register',
      value: value,
      onTap: () => context.push('/gst/2b'),
      footerLabel: 'View 2B',
      emptyHint: 'Pull GSTR-2B for this period',
      builder: (d) {
        final pill = !d.has2b
            ? const StatusPill('2B not synced', tone: StatusTone.neutral)
            : !d.reconRun
                ? const StatusPill('Run reconciliation', tone: StatusTone.warn)
                : d.itcAtRisk > 0
                    ? StatusPill('${formatINR(d.itcAtRisk, compact: true)} at risk',
                        tone: StatusTone.warn)
                    : const StatusPill('All matched', tone: StatusTone.ok);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(d.period.label,
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            const SizedBox(height: 6),
            pill,
            if (d.has2b && d.reconRun) ...[
              const SizedBox(height: 12),
              StatRow(
                  label: 'Matched',
                  value: '${d.matchedCount}',
                  valueColor: statusInk(context, StatusTone.ok)),
              StatRow(
                  label: 'Mismatched',
                  value: '${d.mismatchedCount}',
                  valueColor: statusInk(context, StatusTone.warn)),
              StatRow(label: 'Not in books', value: '${d.notInBooksCount}'),
            ],
          ],
        );
      },
    );
  }
}

class _Gstr1vs3bCard extends StatelessWidget {
  final AsyncValue<Gstr1Vs3bSummary?> value;
  const _Gstr1vs3bCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<Gstr1Vs3bSummary>(
      title: 'GSTR-1 vs GSTR-3B',
      value: value,
      onTap: () => context.push('/gst/returns'),
      footerLabel: 'View returns',
      builder: (d) {
        final missing = !d.gstr1Available || !d.gstr3bAvailable;
        final pill = missing
            ? StatusPill(
                !d.gstr1Available && !d.gstr3bAvailable
                    ? 'Neither generated'
                    : !d.gstr1Available
                        ? 'GSTR-1 missing'
                        : 'GSTR-3B missing',
                tone: StatusTone.warn,
              )
            : StatusPill(
                d.hasMismatch ? 'Mismatch found' : 'Reconciled',
                tone: d.hasMismatch ? StatusTone.warn : StatusTone.ok,
              );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(d.period.label,
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            const SizedBox(height: 6),
            pill,
            if (!missing) ...[
              const SizedBox(height: 12),
              StatRow(
                label: 'Total tax delta',
                value: '${d.totalTaxDelta >= 0 ? '+' : ''}'
                    '${formatINR(d.totalTaxDelta, compact: true)}',
                valueColor: d.totalTaxDelta.abs() > 2
                    ? statusInk(context, StatusTone.warn) : null,
              ),
            ],
          ],
        );
      },
    );
  }
}

class _VendorsBlockingCard extends StatelessWidget {
  final AsyncValue<VendorsNotFiledSummary?> value;
  const _VendorsBlockingCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<VendorsNotFiledSummary>(
      title: 'Vendors blocking ITC',
      subtitle: 'Missing in 2B',
      value: value,
      onTap: () => context.push('/gst/2b'),
      footerLabel: 'View 2B',
      emptyHint: 'No vendors blocking ITC',
      builder: (d) {
        if (!d.has2b) {
          return const StatusPill('2B not synced', tone: StatusTone.neutral);
        }
        if (d.vendors.isEmpty) {
          return const StatusPill('Nobody blocking ITC', tone: StatusTone.ok);
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${d.vendors.length} vendor${d.vendors.length == 1 ? '' : 's'} · '
              '${formatINR(d.totalItcAtRisk, compact: true)} at risk',
              style: RunqText.caption.copyWith(color: RT(context).muted),
            ),
            const SizedBox(height: 10),
            for (final (i, v) in d.vendors.take(4).indexed) ...[
              if (i > 0) const SizedBox(height: 8),
              _VendorBlockingRow(v: v),
            ],
            if (d.vendors.length > 4) ...[
              const SizedBox(height: 10),
              Text('+${d.vendors.length - 4} more',
                  style: RunqText.caption.copyWith(color: RT(context).muted2)),
            ],
          ],
        );
      },
    );
  }
}

class _VendorBlockingRow extends StatelessWidget {
  final ItcBlockerVendor v;
  const _VendorBlockingRow({required this.v});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(v.vendorName,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
              Text(v.reason == 'no_gstin' ? 'No GSTIN' : 'Not in 2B',
                  style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11)),
            ],
          ),
        ),
        Text(formatINR(v.itcAtRisk, compact: true),
            style: RunqText.tabular(
                size: 12.5, w: FontWeight.w600, color: statusInk(context, StatusTone.warn))),
      ],
    );
  }
}
