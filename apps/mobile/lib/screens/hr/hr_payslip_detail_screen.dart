// Payslip detail — purple gradient header with net pay + days, then
// earnings (with a blue total gross bar) and deductions (red total bar).
// Driven by /hr/payroll-runs/:runId/payslips/:payslipId.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/api_client.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_providers.dart';
import '../../services/payslip_pdf.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_widgets.dart';

class HrPayslipDetailScreen extends ConsumerWidget {
  final String runId;
  final String payslipId;
  const HrPayslipDetailScreen({super.key, required this.runId, required this.payslipId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final slipAsync = ref.watch(hrPayslipDetailProvider((runId: runId, payslipId: payslipId)));
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: slipAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (ps) => CustomScrollView(
          physics: const BouncingScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: _GradientHeader(ps: ps)),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverToBoxAdapter(child: _Earnings(ps: ps)),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverToBoxAdapter(child: _Deductions(ps: ps)),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 140)),
          ],
        ),
      ),
    );
  }
}

class _GradientHeader extends ConsumerWidget {
  final HrPayslip ps;
  const _GradientHeader({required this.ps});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final topPad = MediaQuery.of(context).padding.top + 12;
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF0E7490), Color(0xFF06B6D4)],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(8, topPad, 16, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
              ),
              const Spacer(),
              Builder(
                builder: (btnCtx) => IconButton(
                  onPressed: () => _sharePayslip(btnCtx, ref, ps),
                  icon: const Icon(Icons.ios_share_rounded, color: Colors.white),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Take-home pay', style: RunqText.body.copyWith(color: Colors.white70)),
                const SizedBox(height: 4),
                // Clamp to ₹0 same as the Home hero — a negative net
                // pay means the employee owes money for the period;
                // showing "−₹14,956" as the headline read as "we'll
                // pay you minus fifteen thousand," which it isn't.
                Text(hrFormatINR(ps.netPay < 0 ? 0 : ps.netPay),
                    style: RunqText.tabular(size: 36, w: FontWeight.w800, color: Colors.white)),
                const SizedBox(height: 4),
                Text(ps.periodLabel, style: RunqText.body.copyWith(color: Colors.white70)),
                if (ps.netPay < 0) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.info_outline_rounded, color: Colors.white, size: 13),
                        const SizedBox(width: 6),
                        Text('${hrFormatINR(-ps.netPay)} due to company · check with HR',
                            style: RunqText.caption.copyWith(color: Colors.white)),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    // Plain-language labels — "Working / Paid / LOP"
                    // is fine on a desktop HR console but reads like
                    // a quiz to an employee on a phone. Now it spells
                    // out what each number means.
                    _stat('Days in month', ps.workingDays.toStringAsFixed(0)),
                    const SizedBox(width: 16),
                    _stat('Days paid', ps.paidDays.toStringAsFixed(ps.paidDays % 1 == 0 ? 0 : 1)),
                    const SizedBox(width: 16),
                    _stat('Loss of pay', ps.lopDays.toStringAsFixed(ps.lopDays % 1 == 0 ? 0 : 1)),
                  ],
                ),
                // Name the unpaid days. A bare "1" leaves the employee to
                // work out which day their salary was short for.
                if (ps.lopDates.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    'Unpaid: ${ps.lopDates.map(_shortDate).join(', ')}',
                    // Sits on the teal hero, so it matches the period label
                    // rather than the body-surface muted token.
                    style: RunqText.caption.copyWith(color: Colors.white70),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// "2026-08-17" → "17 Aug". The payslip header already carries the month,
  /// so day + month is enough to place it.
  static String _shortDate(String iso) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${d.day} ${months[d.month - 1]}';
  }

  Widget _stat(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.label.copyWith(color: Colors.white70)),
          const SizedBox(height: 2),
          Text(value, style: RunqText.tabular(size: 14, w: FontWeight.w700, color: Colors.white)),
        ],
      );

  // Build an "official" payslip PDF using the local pdf package and
  // share via share_plus. We fetch company name (best-effort) so the
  // header reads like a real payslip rather than a runQ-branded slip;
  // employee name + code come straight off /hr/me.
  static Future<void> _sharePayslip(BuildContext context, WidgetRef ref, HrPayslip ps) async {
    try {
      final me = await ref.read(hrMeProvider.future);
      final emp = me.employee;
      final empName = me.displayName.isNotEmpty
          ? me.displayName
          : (emp != null ? '${emp.firstName}${emp.lastName != null ? ' ${emp.lastName}' : ''}' : 'Employee');
      final empCode = emp?.employeeCode ?? '—';

      // Best-effort company name fetch; if it fails the PDF still
      // renders with a generic "Company" header.
      String? companyName;
      try {
        final res = await apiClient.get('/settings/company');
        if (res is Map && res['data'] is Map) {
          final d = (res['data'] as Map).cast<String, dynamic>();
          companyName = (d['name'] as String?)?.trim();
        }
      } catch (_) { /* swallow — name is decorative */ }

      final builder = PayslipPdf(
        slip: ps,
        employeeName: empName,
        employeeCode: empCode,
        companyName: companyName,
      );
      final file = await builder.save();
      final box = context.findRenderObject() as RenderBox?;
      final origin = box != null
          ? box.localToGlobal(Offset.zero) & box.size
          : null;
      // iOS share sheet shows `text` and `files` as two separate items
      // ("Plain Text and 1 Document") even when text is just a caption.
      // For payslip-as-attachment we want only the PDF — the subject
      // becomes the email subject / WhatsApp filename hint by itself.
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf', name: file.path.split('/').last)],
        subject: 'Payslip — ${ps.periodLabel}',
        sharePositionOrigin: origin,
      );
    } catch (e) {
      if (context.mounted) {
        showRunqSnack(context, 'Could not build PDF: $e', kind: SnackKind.error);
      }
    }
  }
}

class _Earnings extends StatelessWidget {
  final HrPayslip ps;
  const _Earnings({required this.ps});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Earnings', style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const SizedBox(height: 8),
        _LinesCard(
          lines: ps.earnings,
          totalLabel: 'Total earnings',
          totalAmount: ps.gross,
          // HR cyan family for the gross-total bar — sits in the same hue
          // family as the gradient header above so the screen reads as one
          // colour story instead of jumping to indigo.
          totalBg: isDark ? HrColors.tealDeep : const Color(0xFFCFFAFE),
          totalInk: isDark ? const Color(0xFFA5F3FC) : HrColors.tealDeep,
          amountColor: t.ink,
        ),
      ],
    );
  }
}

class _Deductions extends StatelessWidget {
  final HrPayslip ps;
  const _Deductions({required this.ps});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Deductions', style: RunqText.bodyStrong.copyWith(color: t.ink)),
        const SizedBox(height: 8),
        _LinesCard(
          lines: ps.deductions,
          totalLabel: 'Total deductions',
          totalAmount: ps.totalDeductions,
          totalBg: isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEE2E2),
          totalInk: isDark ? const Color(0xFFFCA5A5) : const Color(0xFF7F1D1D),
          amountColor: isDark ? const Color(0xFFFCA5A5) : const Color(0xFFDC2626),
        ),
      ],
    );
  }
}

class _LinesCard extends StatelessWidget {
  final List<HrPayslipLine> lines;
  final String totalLabel;
  final double totalAmount;
  final Color totalBg, totalInk, amountColor;
  const _LinesCard({
    required this.lines,
    required this.totalLabel,
    required this.totalAmount,
    required this.totalBg,
    required this.totalInk,
    required this.amountColor,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          if (lines.isEmpty)
            Padding(
              padding: const EdgeInsets.all(14),
              child: Text('No line items', style: RunqText.body.copyWith(color: t.muted)),
            )
          else
            for (var i = 0; i < lines.length; i++) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                child: Row(
                  children: [
                    Expanded(child: Text(lines[i].name, style: RunqText.body.copyWith(color: t.ink))),
                    Text(hrFormatINR(lines[i].amount),
                        style: RunqText.tabular(size: 13, w: FontWeight.w700, color: amountColor)),
                  ],
                ),
              ),
              if (i < lines.length - 1) Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
            ],
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              color: totalBg,
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(RunqRadii.smallCard)),
            ),
            child: Row(
              children: [
                Expanded(child: Text(totalLabel, style: RunqText.bodyStrong.copyWith(color: totalInk))),
                Text(hrFormatINR(totalAmount),
                    style: RunqText.tabular(size: 14, w: FontWeight.w800, color: totalInk)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
