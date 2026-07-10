import 'dart:async';
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

class GstReturnDetailScreen extends ConsumerStatefulWidget {
  final String id;
  const GstReturnDetailScreen({super.key, required this.id});

  @override
  ConsumerState<GstReturnDetailScreen> createState() =>
      _GstReturnDetailScreenState();
}

class _GstReturnDetailScreenState extends ConsumerState<GstReturnDetailScreen> {
  // GSTN session is server-cached, but "have we authenticated this session"
  // is client-local (matches web) — it gates the Upload step after Validate.
  bool _authenticated = false;
  bool _busy = false;

  String get _id => widget.id;

  void _refresh() {
    ref.invalidate(gstReturnDetailProvider(_id));
    ref.invalidate(gstReturnsProvider);
  }

  Future<void> _validate() async {
    setState(() => _busy = true);
    try {
      final errors = await gstRepo.validate(_id);
      if (!mounted) return;
      _refresh();
      showRunqSnack(
        context,
        errors.isEmpty
            ? 'Validation passed — ready to authenticate'
            : '${errors.length} validation ${errors.length == 1 ? 'error' : 'errors'} — see below',
        kind: errors.isEmpty ? SnackKind.success : SnackKind.error,
      );
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, friendlyGstError(e, 'Validation failed.'),
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _authenticate(String gstin) async {
    final username =
        ref.read(gstCompanyProfileProvider).valueOrNull?.gstUsername;
    final ok = await showGstAuthSheet(context, gstin: gstin, username: username);
    if (ok == true && mounted) setState(() => _authenticated = true);
  }

  Future<void> _upload(String gstin) async {
    setState(() => _busy = true);
    try {
      await gstRepo.upload(_id);
      if (!mounted) return;
      _refresh();
      showRunqSnack(context, 'Uploaded to GSTN', kind: SnackKind.success);
    } catch (e) {
      final msg = e.toString().toLowerCase();
      final needsAuth = msg.contains('token') ||
          msg.contains('auth') ||
          msg.contains('otp') ||
          msg.contains('session');
      if (needsAuth && mounted) {
        setState(() => _authenticated = false);
        final username =
            ref.read(gstCompanyProfileProvider).valueOrNull?.gstUsername;
        final ok =
            await showGstAuthSheet(context, gstin: gstin, username: username);
        if (ok != true) {
          if (mounted) setState(() => _busy = false);
          return;
        }
        setState(() => _authenticated = true);
        try {
          await gstRepo.upload(_id);
          if (!mounted) return;
          _refresh();
          showRunqSnack(context, 'Uploaded to GSTN', kind: SnackKind.success);
        } catch (e2) {
          if (mounted) {
            showRunqSnack(context, friendlyGstError(e2, 'Upload failed.'),
                kind: SnackKind.error);
          }
        }
      } else if (mounted) {
        showRunqSnack(context, friendlyGstError(e, 'Upload failed.'),
            kind: SnackKind.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _file(String type) async {
    final evc = await showEvcSheet(context, returnId: _id);
    if (evc == null || evc.length < 6 || !mounted) return;
    final nav = Navigator.of(context);
    setState(() => _busy = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _FilingProgressDialog(type: type),
    );
    try {
      await gstRepo.file(_id, evc);
      if (mounted) nav.pop(); // close progress dialog
      if (!mounted) return;
      _refresh();
      showRunqSnack(context, 'Return filed — ARN issued',
          kind: SnackKind.success);
    } catch (e) {
      if (mounted) nav.pop();
      if (mounted) {
        showRunqSnack(context, friendlyGstError(e, 'Filing failed.'),
            kind: SnackKind.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reverify() async {
    setState(() => _busy = true);
    try {
      await gstRepo.verify3b(_id);
      if (!mounted) return;
      _refresh();
      showRunqSnack(context, 'Re-checked against GSTN', kind: SnackKind.success);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, friendlyGstError(e, 'Re-check failed.'),
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(gstReturnDetailProvider(_id));

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: () async {
            _refresh();
            await ref
                .read(gstReturnDetailProvider(_id).future)
                .catchError((_) => throw 0);
          },
          child: AsyncSlot<GstReturnDetail>(
            value: detail,
            onRetry: () => ref.invalidate(gstReturnDetailProvider(_id)),
            data: (d) => _Body(
              detail: d,
              authenticated: _authenticated,
              busy: _busy,
              onReverify: _reverify,
            ),
          ),
        ),
      ),
      bottomNavigationBar: detail.maybeWhen(
        data: (d) => d.ret.status == 'filed'
            ? null
            : _ActionBar(
                detail: d,
                authenticated: _authenticated,
                busy: _busy,
                onValidate: _validate,
                onAuthenticate: () => _authenticate(d.ret.gstin),
                onUpload: () => _upload(d.ret.gstin),
                onFile: () =>
                    _file(d.ret.returnType == 'gstr3b' ? 'gstr3b' : 'gstr1'),
              ),
        orElse: () => null,
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final GstReturnDetail detail;
  final bool authenticated;
  final bool busy;
  final VoidCallback onReverify;
  const _Body({
    required this.detail,
    required this.authenticated,
    required this.busy,
    required this.onReverify,
  });

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
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          sliver: SliverToBoxAdapter(
            child: _FilingStepper(status: ret.status, authenticated: authenticated),
          ),
        ),
        if (ret.errors.isNotEmpty) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
            sliver: const SliverToBoxAdapter(
                child: SectionHead(title: 'Validation errors')),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            sliver: SliverToBoxAdapter(child: _ErrorsCard(errors: ret.errors)),
          ),
        ],
        // GSTR-3B post-upload drift: GSTN stored different values than we sent.
        if (detail.verifyDrift.isNotEmpty) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            sliver: SliverToBoxAdapter(
              child: _DriftCard(
                drift: detail.verifyDrift,
                busy: busy,
                onReverify: onReverify,
              ),
            ),
          ),
        ],
        if (isGstr1) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
            sliver: const SliverToBoxAdapter(child: SectionHead(title: 'Sections')),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
            sliver: SliverToBoxAdapter(child: _Gstr1Sections(data: detail.data)),
          ),
        ] else ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
            sliver: SliverToBoxAdapter(
                child: _Gstr3bSummary(data: detail.data, itcFrom2b: detail.itcFrom2b)),
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
                Text(ret.periodLabel, style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
          GstStatusChip(status: ret.status),
        ],
      ),
    );
  }
}

/// Horizontal 5-step filing pipeline with the current stage named below.
class _FilingStepper extends StatelessWidget {
  final String status;
  final bool authenticated;
  const _FilingStepper({required this.status, required this.authenticated});

  static const _steps = ['Generate', 'Validate', 'Authenticate', 'Upload', 'File'];

  int get _current => switch (status) {
        'filed' => 5,
        'uploaded' => 4,
        'validated' => authenticated ? 3 : 2,
        _ => 1, // draft / error → Validate is next; Generate already done
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final current = _current;
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (var i = 0; i < _steps.length; i++) ...[
                _StepDot(index: i, current: current),
                if (i < _steps.length - 1)
                  Expanded(
                    child: Container(
                      height: 2,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      color: i < current ? RunqColors.indigo : t.hairline,
                    ),
                  ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Text(
            current >= _steps.length
                ? 'Filed — all done'
                : 'Step ${current + 1} of ${_steps.length} · ${_steps[current]}',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  final int index;
  final int current;
  const _StepDot({required this.index, required this.current});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final done = index < current;
    final active = index == current;
    final color = (done || active) ? RunqColors.indigo : t.hairline;
    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: done ? RunqColors.indigo : t.surface,
        shape: BoxShape.circle,
        border: Border.all(color: color, width: active ? 2 : 1.2),
      ),
      child: done
          ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
          : Text('${index + 1}',
              style: RunqText.caption.copyWith(
                color: active ? RunqColors.indigo : t.muted2,
                fontWeight: FontWeight.w700,
              )),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final GstReturnDetail detail;
  const _SummaryCard({required this.detail});

  @override
  Widget build(BuildContext context) {
    final ret = detail.ret;
    final isGstr1 = ret.returnType == 'gstr1';
    final summary = _computeSummary(detail);
    final cashToPay = isGstr1 ? null : _cashToPay(detail.data);

    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: RunqShadows.card,
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${isGstr1 ? 'TOTAL TAX' : 'CASH TO PAY'} · ${ret.periodLabel.toUpperCase()}',
            style: RunqText.label.copyWith(color: Colors.white.withValues(alpha: 0.65)),
          ),
          const SizedBox(height: 8),
          Text(
            formatINR(cashToPay ?? summary.totalTax),
            style: RunqText.tabular(size: 32, w: FontWeight.w700, color: Colors.white)
                .copyWith(height: 1.05),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  label: isGstr1 ? 'Taxable' : 'Output tax',
                  value: formatINR(summary.totalTax, compact: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MiniStat(
                  label: isGstr1 ? 'Invoices' : 'Taxable',
                  value: isGstr1
                      ? '${summary.itemCount}'
                      : formatINR(summary.totalTaxable, compact: true),
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
                      color: Colors.white.withValues(alpha: 0.85))),
            ),
          ],
          const SizedBox(height: 4),
          Text('GSTIN  ${ret.gstin}',
              style: RunqText.caption.copyWith(
                  color: Colors.white.withValues(alpha: 0.55))),
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
                  color: Colors.white.withValues(alpha: 0.65))),
          const SizedBox(height: 2),
          Text(value,
              style: RunqText.tabular(size: 18, w: FontWeight.w700, color: Colors.white)),
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
                  Icon(Icons.error_outline_rounded, size: 18, color: RunqColors.redInk),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(errors[i].message,
                            style: RunqText.body.copyWith(color: t.ink)),
                        if (errors[i].section != null) ...[
                          const SizedBox(height: 2),
                          Text('Section ${errors[i].section}',
                              style: RunqText.caption.copyWith(color: t.muted2)),
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

/// GSTR-3B post-upload drift warning: GSTN stored different values than we
/// sent. Filing uses GSTN's values. Amber, with a manual Re-verify.
class _DriftCard extends StatelessWidget {
  final List<GstDriftEntry> drift;
  final bool busy;
  final VoidCallback onReverify;
  const _DriftCard({required this.drift, required this.busy, required this.onReverify});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF3A2410) : RunqColors.amberBg;
    final ink = isDark ? const Color(0xFFFBBF24) : RunqColors.amberInk;
    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        border: Border.all(color: ink.withValues(alpha: 0.3), width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning_amber_rounded, size: 18, color: ink),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Data drift after upload',
                    style: RunqText.bodyStrong.copyWith(color: ink)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'GSTN stored different values than we sent for '
            '${drift.length} field${drift.length == 1 ? '' : 's'}. '
            'Filing now uses GSTN\'s values, not yours.',
            style: RunqText.caption.copyWith(color: t.ink),
          ),
          const SizedBox(height: 12),
          for (final d in drift.take(6)) _DriftRow(d: d, ink: ink),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: busy ? null : onReverify,
              icon: Icon(Icons.refresh_rounded, size: 16, color: ink),
              label: Text('Re-verify',
                  style: RunqText.caption.copyWith(color: ink, fontWeight: FontWeight.w700)),
              style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
            ),
          ),
        ],
      ),
    );
  }
}

class _DriftRow extends StatelessWidget {
  final GstDriftEntry d;
  final Color ink;
  const _DriftRow({required this.d, required this.ink});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text('${d.section} · ${d.field}',
                style: RunqText.caption.copyWith(color: t.muted),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          Expanded(
            flex: 2,
            child: Text(formatINR(d.sent, compact: true),
                textAlign: TextAlign.right,
                style: RunqText.tabular(size: 13, w: FontWeight.w600, color: t.muted)),
          ),
          Icon(Icons.arrow_forward_rounded, size: 12, color: t.muted2),
          Expanded(
            flex: 2,
            child: Text(
                d.stored == 0 ? 'dropped' : formatINR(d.stored, compact: true),
                textAlign: TextAlign.right,
                style: RunqText.tabular(
                    size: 13, w: FontWeight.w700,
                    color: d.stored == 0 ? RunqColors.redInk : ink)),
          ),
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
  final bool itcFrom2b;
  const _Gstr3bSummary({required this.data, required this.itcFrom2b});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final t31 = (data['table31'] as Map?)?.cast<String, dynamic>() ?? {};
    final t4 = (data['table4'] as Map?)?.cast<String, dynamic>() ?? {};
    final outInter = (t31['outwardTaxableInterState'] as Map?)?.cast<String, dynamic>() ?? {};
    final outIntra = (t31['outwardTaxableIntraState'] as Map?)?.cast<String, dynamic>() ?? {};
    final netItc = (t4['netItc'] as Map?)?.cast<String, dynamic>() ?? {};

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
    final cash = _cashToPay(data);

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
          Row(
            children: [
              Text('Net ITC (Table 4)',
                  style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
              const SizedBox(width: 8),
              _ItcSourcePill(from2b: itcFrom2b),
            ],
          ),
          const SizedBox(height: 8),
          _KvRow(label: 'IGST', value: formatINR(_num(netItc['igst']))),
          const SizedBox(height: 4),
          _KvRow(label: 'CGST', value: formatINR(_num(netItc['cgst']))),
          const SizedBox(height: 4),
          _KvRow(label: 'SGST', value: formatINR(_num(netItc['sgst']))),
          const SizedBox(height: 4),
          _KvRow(label: 'Total ITC', value: formatINR(itcTotal), bold: true),
          const SizedBox(height: 16),
          Text('Tax payment (6.1)',
              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          _KvRow(label: 'Cash to pay', value: formatINR(cash), bold: true),
        ],
      ),
    );
  }
}

class _ItcSourcePill extends StatelessWidget {
  final bool from2b;
  const _ItcSourcePill({required this.from2b});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(from2b ? 'from 2B' : 'from bills',
          style: RunqText.micro.copyWith(color: t.muted)),
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
        Expanded(child: Text(label, style: RunqText.body.copyWith(color: t.muted))),
        Text(value,
            style: RunqText.tabular(
                size: 14, w: bold ? FontWeight.w700 : FontWeight.w600, color: t.ink)),
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
                Text(stat.label, style: RunqText.bodyStrong.copyWith(color: t.ink)),
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

/// Non-dismissible filing progress dialog. Filing runs 3 sequential GSTN calls
/// and can take up to ~90s, so we warn the user not to close the app.
class _FilingProgressDialog extends StatefulWidget {
  final String type; // gstr1 | gstr3b
  const _FilingProgressDialog({required this.type});

  @override
  State<_FilingProgressDialog> createState() => _FilingProgressDialogState();
}

class _FilingProgressDialogState extends State<_FilingProgressDialog> {
  Timer? _timer;
  int _i = 0;

  List<String> get _stages => widget.type == 'gstr3b'
      ? ['Offsetting liability…', 'Fetching checksum…', 'Filing with EVC…']
      : ['Preparing…', 'Fetching summary…', 'Filing with EVC…'];

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted) setState(() => _i = (_i + 1) % _stages.length);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PopScope(
      canPop: false,
      child: Dialog(
        backgroundColor: t.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(RunqRadii.card)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 32, height: 32,
                child: CircularProgressIndicator(strokeWidth: 3, color: RunqColors.indigo),
              ),
              const SizedBox(height: 20),
              Text('Filing your return', style: RunqText.h4.copyWith(color: t.ink)),
              const SizedBox(height: 6),
              Text(_stages[_i],
                  style: RunqText.body.copyWith(color: t.muted), textAlign: TextAlign.center),
              const SizedBox(height: 14),
              Text('Keep the app open — this can take up to a minute.',
                  style: RunqText.caption.copyWith(color: t.muted2),
                  textAlign: TextAlign.center),
            ],
          ),
        ),
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
  // GSTR-3B: taxable + output tax from Table 3.1.
  final t31 = (d.data['table31'] as Map?)?.cast<String, dynamic>() ?? {};
  final outInter = (t31['outwardTaxableInterState'] as Map?)?.cast<String, dynamic>() ?? {};
  final outIntra = (t31['outwardTaxableIntraState'] as Map?)?.cast<String, dynamic>() ?? {};
  final taxable = _num(outInter['taxableValue']) + _num(outIntra['taxableValue']);
  final tax = _num(outInter['igst']) +
      _num(outIntra['cgst']) +
      _num(outIntra['sgst']) +
      _num(outInter['cess']) +
      _num(outIntra['cess']);
  return _Summary(taxable, tax, 0);
}

/// GSTR-3B Table 6.1 net cash payable = sum of per-head cashPaid.
double _cashToPay(Map<String, dynamic> data) {
  final t61 = (data['table61'] as Map?)?.cast<String, dynamic>() ?? {};
  double cash = 0;
  for (final head in const ['igst', 'cgst', 'sgst', 'cess']) {
    final m = (t61[head] as Map?)?.cast<String, dynamic>() ?? {};
    cash += _num(m['cashPaid']);
  }
  return cash;
}

double _num(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

/// Bottom action bar driven by return status + client-local auth state.
/// draft/error → Validate · validated → Authenticate then Upload ·
/// uploaded → File with EVC.
class _ActionBar extends StatelessWidget {
  final GstReturnDetail detail;
  final bool authenticated;
  final bool busy;
  final VoidCallback onValidate, onAuthenticate, onUpload, onFile;
  const _ActionBar({
    required this.detail,
    required this.authenticated,
    required this.busy,
    required this.onValidate,
    required this.onAuthenticate,
    required this.onUpload,
    required this.onFile,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (String label, VoidCallback action) = switch (detail.ret.status) {
      'validated' => authenticated
          ? ('Upload to GSTN', onUpload)
          : ('Authenticate with GST Portal', onAuthenticate),
      'uploaded' => ('File with EVC', onFile),
      _ => ('Validate', onValidate),
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
            onPressed: busy ? null : action,
            style: FilledButton.styleFrom(
              backgroundColor: RunqColors.indigo,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              ),
            ),
            child: busy
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(label, style: RunqText.bodyStrong.copyWith(color: Colors.white)),
          ),
        ),
      ),
    );
  }
}
