import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
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
import 'gst/gst_auth_screen.dart';
import 'gst/gst_evc_screen.dart';
import 'gst/gst_form_kit.dart';

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
    // The dashboard's GST strip reads its own provider — without this it keeps
    // serving the pre-filing snapshot until the app is restarted.
    ref.invalidate(gstReadinessProvider);
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
    final ok = await openGstAuth(context, gstin: gstin, username: username);
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
            await openGstAuth(context, gstin: gstin, username: username);
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
    final evc = await openGstEvc(context, returnId: _id);
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

  Future<void> _shareBytes(List<int> bytes, String filename, String mime) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$filename');
    await file.writeAsBytes(bytes, flush: true);
    if (!mounted) return;
    await Share.shareXFiles([XFile(file.path, mimeType: mime, name: filename)]);
  }

  Future<void> _downloadJson(GstReturn ret) async {
    try {
      final bytes = await gstRepo.gstr1PayloadJson(_id);
      await _shareBytes(bytes, 'GSTR1-${ret.period}.json', 'application/json');
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, friendlyGstError(e, "Couldn't download the JSON."),
            kind: SnackKind.error);
      }
    }
  }

  Future<void> _downloadCsv(GstReturn ret) async {
    try {
      final bytes = await gstRepo.gstr1ExportCsv(_id);
      await _shareBytes(bytes, 'GSTR1-${ret.period}.csv', 'text/csv');
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, friendlyGstError(e, "Couldn't download the CSV."),
            kind: SnackKind.error);
      }
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this draft?'),
        content: const Text(
            'This removes the generated return. You can regenerate it any time.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: RunqColors.redInk),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await gstRepo.delete(_id);
      if (!mounted) return;
      ref.invalidate(gstReturnsProvider);
      ref.invalidate(gstReadinessProvider);
      showRunqSnack(context, 'Draft deleted', kind: SnackKind.success);
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, friendlyGstError(e, "Couldn't delete the draft."),
            kind: SnackKind.error);
      }
    }
  }

  Future<void> _openMenu(GstReturn ret) async {
    final isGstr1 = ret.returnType == 'gstr1';
    final canDownload = isGstr1 && ret.status != 'draft';
    final canDelete = ret.status != 'filed';
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => GstSheetShell(
        padding: const EdgeInsets.fromLTRB(8, 12, 8, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (canDownload)
              _MenuItem(
                icon: Icons.code_rounded,
                label: 'Download JSON',
                subtitle: 'GSTN wire format for manual upload',
                onTap: () => Navigator.pop(context, 'json'),
              ),
            if (canDownload)
              _MenuItem(
                icon: Icons.table_chart_outlined,
                label: 'Download CSV',
                subtitle: 'For your records',
                onTap: () => Navigator.pop(context, 'csv'),
              ),
            if (canDelete)
              _MenuItem(
                icon: Icons.delete_outline_rounded,
                label: 'Delete draft',
                subtitle: 'Remove and regenerate later',
                destructive: true,
                onTap: () => Navigator.pop(context, 'delete'),
              ),
            if (!canDownload && !canDelete)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('No actions for a filed return.',
                    style: RunqText.caption.copyWith(color: RT(context).muted)),
              ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    switch (action) {
      case 'json':
        await _downloadJson(ret);
      case 'csv':
        await _downloadCsv(ret);
      case 'delete':
        await _delete();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final detail = ref.watch(gstReturnDetailProvider(_id));

    // The bar lives on the Scaffold, not inside the scroll view: it has to
    // survive scrolling AND the loading/error states, otherwise a return that
    // fails to load leaves the user with no way back.
    final ret = detail.valueOrNull?.ret;

    return Scaffold(
      appBar: _ReturnAppBar(
        ret: ret,
        onMenu: ret == null ? null : () => _openMenu(ret),
      ),
      body: SafeArea(
        top: false,
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

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
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
            sliver: SliverToBoxAdapter(
                child: _Gstr1Sections(data: detail.data, returnId: ret.id)),
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

/// Persistent screen chrome: back, eyebrow + period title, status chip and the
/// overflow menu. [ret] is null until the return loads — the bar still renders
/// so the back button and title placeholder are there during load and on error.
class _ReturnAppBar extends StatelessWidget implements PreferredSizeWidget {
  final GstReturn? ret;
  final VoidCallback? onMenu;
  const _ReturnAppBar({required this.ret, required this.onMenu});

  static const _height = 64.0;
  static const _hairline = 0.6;

  // Must include the hairline `bottom`, or Scaffold lays the bar out 0.6px
  // short of what AppBar actually needs and it overflows.
  @override
  Size get preferredSize => const Size.fromHeight(_height + _hairline);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final r = ret;
    final type = r == null
        ? 'Return'
        : (r.returnType == 'gstr1' ? 'GSTR-1' : 'GSTR-3B');

    return AppBar(
      toolbarHeight: _height,
      backgroundColor: t.bgWarm,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle: Theme.of(context).brightness == Brightness.dark
          ? RunqSystemBars.lightIcons
          : RunqSystemBars.darkIcons,
      leading: IconButton(
        onPressed: () => Navigator.of(context).maybePop(),
        icon: Icon(Icons.arrow_back_rounded, color: t.ink),
        tooltip: MaterialLocalizations.of(context).backButtonTooltip,
      ),
      titleSpacing: 0,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(type, style: RunqText.caption.copyWith(color: t.muted)),
          if (r != null)
            Text(r.periodLabel,
                style: RunqText.h3.copyWith(color: t.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
        ],
      ),
      actions: [
        if (r != null) ...[
          GstStatusChip(status: r.status),
          IconButton(
            onPressed: onMenu,
            icon: Icon(Icons.more_horiz_rounded, color: t.ink),
            tooltip: 'More actions',
          ),
        ],
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(_hairline),
        child: Container(height: _hairline, color: t.hairline),
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
                  // GSTR-1's tile is labelled "Taxable" — it must show the
                  // taxable value, not repeat the tax already in the hero.
                  value: formatINR(
                      isGstr1 ? summary.totalTaxable : summary.totalTax),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MiniStat(
                  label: isGstr1 ? 'Invoices' : 'Taxable',
                  value: isGstr1
                      ? '${summary.itemCount}'
                      : formatINR(summary.totalTaxable),
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
          // Full (un-abbreviated) rupee values can outgrow a half-width tile;
          // scale down rather than truncate — the digits are the point.
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                maxLines: 1,
                style: RunqText.tabular(
                    size: 18, w: FontWeight.w700, color: Colors.white)),
          ),
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
  final String returnId;
  const _Gstr1Sections({required this.data, required this.returnId});

  @override
  Widget build(BuildContext context) {
    final sections = <_SectionStat>[
      _section('B2B', 'b2b', data['b2b'], 'Registered dealers'),
      _section('B2C (large)', 'b2cl', data['b2cl'], 'Inter-state > ₹2.5L'),
      _section('B2C (small)', 'b2cs', data['b2cs'], 'Small unregistered'),
      _section('Credit/Debit notes', 'cdn', data['cdn'], 'CDN to registered'),
      _section('Exports', 'exp', data['exp'], 'Outside India'),
      _section('Nil-rated', 'nil', data['nil'], 'Nil/exempt'),
      _section('HSN summary', 'hsn', data['hsn'], 'By HSN code'),
    ];
    return RunqCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < sections.length; i++) ...[
            _SectionRow(stat: sections[i], returnId: returnId),
            if (i < sections.length - 1)
              Divider(height: 1, thickness: 0.6, color: RT(context).hairline),
          ],
        ],
      ),
    );
  }

  _SectionStat _section(String label, String key, Object? raw, String detail) {
    final list = (raw is List ? raw : const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    double taxable = 0;
    double tax = 0;
    for (final e in list) {
      taxable += _entryTaxable(e);
      tax += _entryTax(e);
    }
    return _SectionStat(
      label: label,
      key: key,
      detail: detail,
      count: list.length,
      taxable: taxable,
      tax: tax,
      entries: list,
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
          _Table61(data: data, totalCash: cash),
        ],
      ),
    );
  }
}

/// GSTR-3B Table 6.1: per-head Payable / ITC used / Cash to pay, plus the
/// bold total cash payable.
class _Table61 extends StatelessWidget {
  final Map<String, dynamic> data;
  final double totalCash;
  const _Table61({required this.data, required this.totalCash});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final t61 = (data['table61'] as Map?)?.cast<String, dynamic>() ?? {};
    const heads = [('igst', 'IGST'), ('cgst', 'CGST'), ('sgst', 'SGST'), ('cess', 'Cess')];
    Widget cell(String s, {bool head = false, Color? color}) => Expanded(
          child: Text(s,
              textAlign: head ? TextAlign.start : TextAlign.end,
              style: head
                  ? RunqText.caption.copyWith(color: t.muted2)
                  : RunqText.tabular(size: 13, w: FontWeight.w600, color: color ?? t.ink)),
        );
    return Column(
      children: [
        Row(children: [
          Expanded(child: Text('Head', style: RunqText.caption.copyWith(color: t.muted2))),
          cell('Payable', head: true), cell('ITC', head: true), cell('Cash', head: true),
        ]),
        const SizedBox(height: 4),
        for (final (key, label) in heads)
          if (_num((t61[key] as Map?)?['payable']) != 0 ||
              _num((t61[key] as Map?)?['cashPaid']) != 0) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                Expanded(child: Text(label, style: RunqText.body.copyWith(color: t.muted))),
                cell(formatINR(_num((t61[key] as Map?)?['payable']), compact: true)),
                cell(formatINR(_num((t61[key] as Map?)?['itcUsed']), compact: true)),
                cell(formatINR(_num((t61[key] as Map?)?['cashPaid']), compact: true)),
              ]),
            ),
          ],
        Divider(height: 16, thickness: 0.6, color: t.hairline),
        Row(children: [
          Expanded(child: Text('Total cash to pay', style: RunqText.bodyStrong.copyWith(color: t.ink))),
          Text(formatINR(totalCash),
              style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
        ]),
      ],
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
  final String key;
  final String detail;
  final int count;
  final double taxable;
  final double tax;
  final List<Map<String, dynamic>> entries;
  _SectionStat({
    required this.label,
    required this.key,
    required this.detail,
    required this.count,
    required this.taxable,
    required this.tax,
    required this.entries,
  });
}

class _SectionRow extends StatelessWidget {
  final _SectionStat stat;
  final String returnId;
  const _SectionRow({required this.stat, required this.returnId});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tappable = stat.count > 0;
    return InkWell(
      onTap: tappable
          ? () => _showSectionEntries(context, stat, returnId)
          : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(stat.label,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(
                    stat.count == 0
                        ? stat.detail
                        : '${stat.count} ${stat.count == 1 ? 'entry' : 'entries'} · ${stat.detail}',
                    style: RunqText.caption.copyWith(color: t.muted2),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(formatINR(stat.taxable, paise: true),
                    style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                const SizedBox(height: 2),
                Text('+${formatINR(stat.tax, paise: true)} tax',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
            if (tappable) ...[
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
            ],
          ],
        ),
      ),
    );
  }
}

/// Read-only sheet listing the entries in a GSTR-1 section. HSN rows drill to
/// the underlying invoice lines via the hsn-breakdown endpoint.
void _showSectionEntries(BuildContext context, _SectionStat stat, String returnId) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    // A 243-entry section fills the screen; without this the sheet slides
    // under the status bar and its title collides with the clock.
    useSafeArea: true,
    builder: (_) => GstSheetShell(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: _SectionEntriesSheet(stat: stat, returnId: returnId),
    ),
  );
}

/// Plain-language note for a GSTR-1 section: the GSTN table it feeds, why it
/// exists, and what the left-hand label on each row identifies. Shown in the
/// section sheet so the numbers can be read without a GST manual to hand.
typedef _SectionGuide = ({String table, String what, String rowKey});

_SectionGuide _sectionGuide(String key) => switch (key) {
      'b2b' => (
          table: 'Table 4A',
          what: 'Invoice-wise sales to buyers who have a GSTIN. This is what '
              'they see in their GSTR-2B and claim input tax credit against, '
              'so numbers and values must match their books.',
          rowKey: 'Invoice number',
        ),
      'b2cl' => (
          table: 'Table 5A',
          what: 'Inter-state sales over ₹2.5 lakh to unregistered buyers. '
              'Reported invoice-wise so the destination state can settle its '
              'share of IGST.',
          rowKey: 'Invoice number',
        ),
      'b2cs' => (
          table: 'Table 7',
          what: 'All other sales to unregistered buyers, aggregated by place '
              'of supply and tax rate rather than per invoice. Exempt lines '
              'are reported under Nil-rated instead — a 0% row is invalid here.',
          rowKey: 'Place of supply',
        ),
      'cdn' => (
          table: 'Table 9B',
          what: 'Credit and debit notes raised against B2B invoices already '
              'reported. Filing one adjusts the buyer’s input tax credit.',
          rowKey: 'Note number',
        ),
      'exp' => (
          table: 'Table 6A',
          what: 'Zero-rated supplies outside India, with shipping bill '
              'details. This is what IGST refund claims are built from.',
          rowKey: 'Invoice number',
        ),
      'nil' => (
          table: 'Table 8',
          what: 'Nil-rated, exempt and non-GST sales, aggregated and split '
              'intra- vs inter-state. There is no tax column by definition.',
          rowKey: 'Supply type',
        ),
      _ => (
          table: 'Table 12',
          what: 'Quantity and value rolled up by HSN code, tax rate and unit. '
              'Covers every sale in the period, so it restates the full '
              'turnover from a different angle. Tap a row for the breakdown.',
          rowKey: 'HSN code',
        ),
    };

/// The explanation panel above a section's entries: what the table is for,
/// then a legend for how to read a row.
class _GuideNote extends StatelessWidget {
  final _SectionGuide guide;
  final bool showTax;
  const _GuideNote({required this.guide, required this.showTax});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(guide.what,
              style: RunqText.caption.copyWith(color: t.muted, height: 1.45)),
          const SizedBox(height: 8),
          Text(
            showTax
                ? '${guide.rowKey} on the left · taxable value on the right, '
                    'with GST beneath it.'
                : '${guide.rowKey} on the left · exempt value on the right.',
            style: RunqText.caption.copyWith(color: t.muted2, height: 1.45),
          ),
        ],
      ),
    );
  }
}

class _SectionEntriesSheet extends StatelessWidget {
  final _SectionStat stat;
  final String returnId;
  const _SectionEntriesSheet({required this.stat, required this.returnId});

  String _title(Map<String, dynamic> e) =>
      _strOrNull(e['invoiceNumber']) ??
      _strOrNull(e['noteNumber']) ??
      _strOrNull(e['hsnCode']) ??
      _strOrNull(e['partyGstin']) ??
      _strOrNull(e['pos']) ??
      // b2cs/nil entries have no document number — identify them by
      // place of supply and/or supply type instead of rendering '—'.
      _strOrNull(e['placeOfSupply']) ??
      _strOrNull(e['supplyType']) ??
      '—';

  String? _subtitle(Map<String, dynamic> e) =>
      _strOrNull(e['partyName']) ??
      _strOrNull(e['partyGstin']) ??
      _strOrNull(e['description']);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final guide = _sectionGuide(stat.key);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(stat.label,
                      style: RunqText.h3.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(
                    '${guide.table} · ${stat.count} '
                    '${stat.count == 1 ? 'entry' : 'entries'}',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () => Navigator.of(context).maybePop(),
              icon: Icon(Icons.close_rounded, color: t.ink),
              tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            ),
          ],
        ),
        const SizedBox(height: 10),
        _GuideNote(guide: guide, showTax: stat.key != 'nil'),
        const SizedBox(height: 12),
        Flexible(
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: stat.entries.length,
            separatorBuilder: (_, __) =>
                Divider(height: 1, thickness: 0.6, color: t.hairline),
            itemBuilder: (_, i) {
              final e = stat.entries[i];
              final sub = _subtitle(e);
              final isHsn = stat.key == 'hsn';
              return InkWell(
                onTap: isHsn
                    ? () => _showHsnDrill(context, returnId, e)
                    : null,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_title(e),
                                style: RunqText.bodyStrong.copyWith(color: t.ink),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                            if (sub != null) ...[
                              const SizedBox(height: 2),
                              Text(sub,
                                  style: RunqText.caption.copyWith(color: t.muted2),
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(formatINR(_entryTaxable(e), paise: true),
                              style: RunqText.tabular(
                                  size: 14, w: FontWeight.w700, color: t.ink)),
                          const SizedBox(height: 2),
                          Text('+${formatINR(_entryTax(e), paise: true)} tax',
                              style: RunqText.caption.copyWith(color: t.muted)),
                        ],
                      ),
                      if (isHsn) ...[
                        const SizedBox(width: 4),
                        Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

void _showHsnDrill(BuildContext context, String returnId, Map<String, dynamic> hsnRow) {
  final hsn = _strOrNull(hsnRow['hsnCode']) ?? '';
  final rate = _num(hsnRow['rate']).toString();
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => GstSheetShell(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: _HsnDrillSheet(returnId: returnId, hsn: hsn, rate: rate),
    ),
  );
}

class _HsnDrillSheet extends StatefulWidget {
  final String returnId, hsn, rate;
  const _HsnDrillSheet({required this.returnId, required this.hsn, required this.rate});

  @override
  State<_HsnDrillSheet> createState() => _HsnDrillSheetState();
}

class _HsnDrillSheetState extends State<_HsnDrillSheet> {
  late Future<List<Map<String, dynamic>>> _future =
      gstRepo.hsnBreakdown(widget.returnId, hsn: widget.hsn, rate: widget.rate);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('HSN ${widget.hsn}', style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 2),
        Text('Invoice lines at ${widget.rate}%',
            style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 12),
        FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (snap.hasError) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text('Could not load the breakdown.',
                    style: RunqText.caption.copyWith(color: t.muted)),
              );
            }
            final rows = snap.data ?? const [];
            if (rows.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text('No lines found.',
                    style: RunqText.caption.copyWith(color: t.muted)),
              );
            }
            return Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: rows.length,
                separatorBuilder: (_, __) =>
                    Divider(height: 1, thickness: 0.6, color: t.hairline),
                itemBuilder: (_, i) {
                  final r = rows[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                  _strOrNull(r['customerName']) ??
                                      _strOrNull(r['invoiceNumber']) ??
                                      '—',
                                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                              const SizedBox(height: 2),
                              Text(
                                  _strOrNull(r['description']) ??
                                      _strOrNull(r['invoiceNumber']) ??
                                      '',
                                  style: RunqText.caption.copyWith(color: t.muted2),
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(formatINR(_num(r['amount']), compact: true),
                            style: RunqText.tabular(
                                size: 14, w: FontWeight.w700, color: t.ink)),
                      ],
                    ),
                  );
                },
              ),
            );
          },
        ),
      ],
    );
  }
}

String? _strOrNull(Object? v) {
  if (v == null) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
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

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label, subtitle;
  final bool destructive;
  final VoidCallback onTap;
  const _MenuItem({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fg = destructive ? RunqColors.redInk : t.ink;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: (destructive ? RunqColors.redInk : RunqColors.indigo)
                    .withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: fg, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: RunqText.bodyStrong.copyWith(color: fg)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
          ],
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
        final entry = e.cast<String, dynamic>();
        taxable += _entryTaxable(entry);
        tax += _entryTax(entry);
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

/// GSTR-1 section entries come in three shapes and only one carries the
/// money on the entry itself:
///   flat     — b2cs/b2cl/exp/hsn: taxableValue + tax fields on the entry
///   nested   — b2b/cdn/b2ba: per-rate breakdown inside items[]
///   nil      — Table 8: nil/exempt/non-GST buckets, never taxed
/// Reading `taxableValue` off a nested or nil entry silently yields 0, so
/// every call site must go through these two helpers.
double _entryTaxable(Map<String, dynamic> e) {
  final items = e['items'];
  if (items is List) {
    double sum = 0;
    for (final it in items) {
      if (it is Map) sum += _num(it['taxableValue']);
    }
    return sum;
  }
  if (e.containsKey('nilRatedAmount') ||
      e.containsKey('exemptAmount') ||
      e.containsKey('nonGstAmount')) {
    return _num(e['nilRatedAmount']) +
        _num(e['exemptAmount']) +
        _num(e['nonGstAmount']);
  }
  return _num(e['taxableValue']);
}

double _entryTax(Map<String, dynamic> e) {
  double taxOf(Map<String, dynamic> m) =>
      _num(m['igstAmount']) +
      _num(m['cgstAmount']) +
      _num(m['sgstAmount']) +
      _num(m['cessAmount']);

  final items = e['items'];
  if (items is List) {
    double sum = 0;
    for (final it in items) {
      if (it is Map) sum += taxOf(it.cast<String, dynamic>());
    }
    return sum;
  }
  return taxOf(e);
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
