import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/section_head.dart';
import 'gst/gst_status_chip.dart';
import 'gst/gst_auth_sheet.dart';

class GstReturnDetailScreen extends ConsumerWidget {
  final String id;
  const GstReturnDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final detail = ref.watch(gstReturnDetailProvider(id));

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: () async {
            ref.invalidate(gstReturnDetailProvider(id));
            await ref.read(gstReturnDetailProvider(id).future).catchError((_) => throw 0);
          },
          child: AsyncSlot<GstReturnDetail>(
            value: detail,
            onRetry: () => ref.invalidate(gstReturnDetailProvider(id)),
            data: (d) => _Body(detail: d),
          ),
        ),
      ),
      bottomNavigationBar: detail.maybeWhen(
        data: (d) => d.ret.status == 'filed'
            ? null
            : _ActionBar(detail: d),
        orElse: () => null,
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final GstReturnDetail detail;
  const _Body({required this.detail});

  @override
  Widget build(BuildContext context) {
    final ret = detail.ret;
    final isGstr1 = ret.returnType == 'gstr1';
    final type = isGstr1 ? 'GSTR-1' : 'GSTR-3B';

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      slivers: [
        SliverToBoxAdapter(child: _Header(type: type, ret: ret)),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          sliver: SliverToBoxAdapter(child: _SummaryCard(detail: detail)),
        ),
        if (ret.errors.isNotEmpty) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            sliver: const SliverToBoxAdapter(child: SectionHead(title: 'Validation errors')),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            sliver: SliverToBoxAdapter(child: _ErrorsCard(errors: ret.errors)),
          ),
        ],
        if (isGstr1) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            sliver: const SliverToBoxAdapter(child: SectionHead(title: 'Sections')),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
            sliver: SliverToBoxAdapter(child: _Gstr1Sections(data: detail.data)),
          ),
        ] else ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
            sliver: SliverToBoxAdapter(child: _Gstr3bSummary(data: detail.data)),
          ),
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final String type;
  final GstReturn ret;
  const _Header({required this.type, required this.ret});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(type, style: RunqText.body.copyWith(color: t.muted)),
                Text(ret.periodLabel,
                    style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
          GstStatusChip(status: ret.status),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final GstReturnDetail detail;
  const _SummaryCard({required this.detail});

  @override
  Widget build(BuildContext context) {
    final ret = detail.ret;
    final summary = _computeSummary(detail);

    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: const [
          BoxShadow(color: Color(0x331E1B4B), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TOTAL TAX · ${ret.periodLabel.toUpperCase()}',
            style: RunqText.label.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatINR(summary.totalTax),
            style: RunqText.tabular(
                size: 32, w: FontWeight.w700, color: Colors.white)
              .copyWith(height: 1.05),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  label: 'Taxable',
                  value: formatINR(summary.totalTaxable, compact: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MiniStat(
                  label: ret.returnType == 'gstr1' ? 'Invoices' : 'Sections',
                  value: '${summary.itemCount}',
                ),
              ),
            ],
          ),
          if (ret.arn != null && ret.arn!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('ARN  ${ret.arn}',
                  style: RunqText.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                  )),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            'GSTIN  ${ret.gstin}',
            style: RunqText.caption.copyWith(
              color: Colors.white.withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.65),
              )),
          const SizedBox(height: 2),
          Text(value,
              style: RunqText.tabular(
                  size: 18, w: FontWeight.w700, color: Colors.white)),
        ],
      ),
    );
  }
}

class _ErrorsCard extends StatelessWidget {
  final List<GstReturnError> errors;
  const _ErrorsCard({required this.errors});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < errors.length; i++) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.error_outline_rounded,
                      size: 18, color: RunqColors.redInk),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(errors[i].message,
                            style: RunqText.body
                                .copyWith(color: t.ink)),
                        if (errors[i].section != null) ...[
                          const SizedBox(height: 2),
                          Text('Section ${errors[i].section}',
                              style: RunqText.caption.copyWith(
                                  color: t.muted2)),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (i < errors.length - 1)
              Divider(height: 1, thickness: 0.6, color: t.hairline),
          ],
        ],
      ),
    );
  }
}

class _Gstr1Sections extends StatelessWidget {
  final Map<String, dynamic> data;
  const _Gstr1Sections({required this.data});

  @override
  Widget build(BuildContext context) {
    final sections = <_SectionStat>[
      _section('B2B', data['b2b'], 'Registered dealers'),
      _section('B2C (large)', data['b2cl'], 'Inter-state > ₹2.5L'),
      _section('B2C (small)', data['b2cs'], 'Small unregistered'),
      _section('Credit/Debit notes', data['cdn'], 'CDN to registered'),
      _section('Exports', data['exp'], 'Outside India'),
      _section('Nil-rated', data['nil'], 'Nil/exempt'),
      _section('HSN summary', data['hsn'], 'By HSN code'),
    ];
    return RunqCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < sections.length; i++) ...[
            _SectionRow(stat: sections[i]),
            if (i < sections.length - 1)
              Divider(height: 1, thickness: 0.6, color: RT(context).hairline),
          ],
        ],
      ),
    );
  }

  _SectionStat _section(String label, Object? raw, String detail) {
    final list = raw is List ? raw : const [];
    double taxable = 0;
    double tax = 0;
    for (final e in list) {
      if (e is! Map) continue;
      taxable += _num(e['taxableValue']);
      tax += _num(e['igstAmount']) +
          _num(e['cgstAmount']) +
          _num(e['sgstAmount']) +
          _num(e['cessAmount']);
    }
    return _SectionStat(
      label: label,
      detail: detail,
      count: list.length,
      taxable: taxable,
      tax: tax,
    );
  }
}

class _Gstr3bSummary extends StatelessWidget {
  final Map<String, dynamic> data;
  const _Gstr3bSummary({required this.data});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final t31 = (data['table31'] as Map?)?.cast<String, dynamic>() ?? {};
    final t4 = (data['table4'] as Map?)?.cast<String, dynamic>() ?? {};
    final outInter =
        (t31['outwardTaxableInterState'] as Map?)?.cast<String, dynamic>() ?? {};
    final outIntra =
        (t31['outwardTaxableIntraState'] as Map?)?.cast<String, dynamic>() ?? {};
    final netItc =
        (t4['netItc'] as Map?)?.cast<String, dynamic>() ?? {};

    final outTaxable = _num(outInter['taxableValue']) + _num(outIntra['taxableValue']);
    final outTax = _num(outInter['igst']) +
        _num(outIntra['cgst']) +
        _num(outIntra['sgst']) +
        _num(outInter['cess']) +
        _num(outIntra['cess']);
    final itcTotal = _num(netItc['igst']) +
        _num(netItc['cgst']) +
        _num(netItc['sgst']) +
        _num(netItc['cess']);

    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Outward supplies (3.1)',
              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          _KvRow(label: 'Taxable value', value: formatINR(outTaxable)),
          const SizedBox(height: 4),
          _KvRow(label: 'Total tax', value: formatINR(outTax)),
          const SizedBox(height: 16),
          Text('Net ITC (Table 4)',
              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          _KvRow(label: 'IGST', value: formatINR(_num(netItc['igst']))),
          const SizedBox(height: 4),
          _KvRow(label: 'CGST', value: formatINR(_num(netItc['cgst']))),
          const SizedBox(height: 4),
          _KvRow(label: 'SGST', value: formatINR(_num(netItc['sgst']))),
          const SizedBox(height: 4),
          _KvRow(label: 'Total ITC', value: formatINR(itcTotal), bold: true),
        ],
      ),
    );
  }
}

class _KvRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  const _KvRow({required this.label, required this.value, this.bold = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Expanded(
          child: Text(label,
              style: RunqText.body.copyWith(color: t.muted)),
        ),
        Text(
          value,
          style: RunqText.tabular(
            size: 14,
            w: bold ? FontWeight.w700 : FontWeight.w600,
            color: t.ink,
          ),
        ),
      ],
    );
  }
}

class _SectionStat {
  final String label;
  final String detail;
  final int count;
  final double taxable;
  final double tax;
  _SectionStat({
    required this.label,
    required this.detail,
    required this.count,
    required this.taxable,
    required this.tax,
  });
}

class _SectionRow extends StatelessWidget {
  final _SectionStat stat;
  const _SectionRow({required this.stat});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(stat.label,
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text(
                  stat.count == 0
                      ? stat.detail
                      : '${stat.count} ${stat.count == 1 ? 'entry' : 'entries'} · ${stat.detail}',
                  style: RunqText.caption.copyWith(color: t.muted2),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(formatINR(stat.taxable, compact: true),
                  style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
              const SizedBox(height: 2),
              Text('+${formatINR(stat.tax, compact: true)} tax',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Summary {
  final double totalTaxable;
  final double totalTax;
  final int itemCount;
  _Summary(this.totalTaxable, this.totalTax, this.itemCount);
}

_Summary _computeSummary(GstReturnDetail d) {
  if (d.ret.returnType == 'gstr1') {
    double taxable = 0;
    double tax = 0;
    int count = 0;
    for (final key in const ['b2b', 'b2cs', 'b2cl', 'cdn', 'exp']) {
      final list = d.data[key];
      if (list is! List) continue;
      for (final e in list) {
        if (e is! Map) continue;
        count++;
        taxable += _num(e['taxableValue']);
        tax += _num(e['igstAmount']) +
            _num(e['cgstAmount']) +
            _num(e['sgstAmount']) +
            _num(e['cessAmount']);
      }
    }
    return _Summary(taxable, tax, count);
  }
  // GSTR-3B
  final t31 = (d.data['table31'] as Map?)?.cast<String, dynamic>() ?? {};
  final outInter = (t31['outwardTaxableInterState'] as Map?)?.cast<String, dynamic>() ?? {};
  final outIntra = (t31['outwardTaxableIntraState'] as Map?)?.cast<String, dynamic>() ?? {};
  final taxable = _num(outInter['taxableValue']) + _num(outIntra['taxableValue']);
  final tax = _num(outInter['igst']) +
      _num(outIntra['cgst']) +
      _num(outIntra['sgst']) +
      _num(outInter['cess']) +
      _num(outIntra['cess']);
  final sections = (d.data as Map).keys.length;
  return _Summary(taxable, tax, sections);
}

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

/// Bottom action bar driven by return status.
/// draft / error → Validate
/// validated → Upload to GSTN (auth-aware)
/// uploaded → File with EVC
class _ActionBar extends ConsumerStatefulWidget {
  final GstReturnDetail detail;
  const _ActionBar({required this.detail});

  @override
  ConsumerState<_ActionBar> createState() => _ActionBarState();
}

class _ActionBarState extends ConsumerState<_ActionBar> {
  bool _busy = false;

  String get _id => widget.detail.ret.id;
  String get _gstin => widget.detail.ret.gstin;
  String get _status => widget.detail.ret.status;

  void _refreshDetail() {
    ref.invalidate(gstReturnDetailProvider(_id));
    ref.invalidate(gstReturnsProvider);
  }

  Future<void> _validate() async {
    setState(() => _busy = true);
    try {
      final errors = await gstRepo.validate(_id);
      if (!mounted) return;
      _refreshDetail();
      showRunqSnack(
        context,
        errors.isEmpty
            ? 'Validation passed — ready to upload'
            : '${errors.length} validation ${errors.length == 1 ? 'error' : 'errors'}',
        kind: errors.isEmpty ? SnackKind.success : SnackKind.error,
      );
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't validate: $e", kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _upload() async {
    setState(() => _busy = true);
    try {
      await gstRepo.upload(_id);
      if (!mounted) return;
      _refreshDetail();
      showRunqSnack(context, 'Uploaded to GSTN', kind: SnackKind.success);
    } catch (e) {
      // If GSP says no valid token, prompt for OTP and retry once.
      final msg = e.toString().toLowerCase();
      if (msg.contains('token') || msg.contains('auth') || msg.contains('otp')) {
        if (!mounted) return;
        final ok = await showGstAuthSheet(context, gstin: _gstin);
        if (ok != true) {
          if (mounted) setState(() => _busy = false);
          return;
        }
        try {
          await gstRepo.upload(_id);
          if (!mounted) return;
          _refreshDetail();
          showRunqSnack(context, 'Uploaded to GSTN', kind: SnackKind.success);
        } catch (e2) {
          if (!mounted) return;
          showRunqSnack(context, "Upload failed: $e2", kind: SnackKind.error);
        }
      } else {
        if (!mounted) return;
        showRunqSnack(context, "Upload failed: $e", kind: SnackKind.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _file() async {
    final evc = await askForEvc(context);
    if (evc == null || evc.length < 4 || !mounted) return;
    setState(() => _busy = true);
    try {
      await gstRepo.file(_id, evc);
      if (!mounted) return;
      _refreshDetail();
      showRunqSnack(context, 'Return filed — ARN issued',
          kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, "Filing failed: $e", kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (String label, VoidCallback? onTap) = switch (_status) {
      'validated' => ('Upload to GSTN', _busy ? null : _upload),
      'uploaded' => ('File with EVC', _busy ? null : _file),
      _ => ('Validate', _busy ? null : _validate),
    };

    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: BoxDecoration(
          color: t.surface,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        child: SizedBox(
          height: 50,
          child: FilledButton(
            onPressed: onTap,
            style: FilledButton.styleFrom(
              backgroundColor: RunqColors.indigo,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : Text(label,
                    style: RunqText.bodyStrong
                        .copyWith(color: Colors.white)),
          ),
        ),
      ),
    );
  }
}
