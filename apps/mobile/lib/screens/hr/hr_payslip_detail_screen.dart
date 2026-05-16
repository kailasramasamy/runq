// Payslip detail — purple gradient header with net pay + days, then
// earnings (with a blue total gross bar) and deductions (red total bar).
// Driven by /hr/payroll-runs/:runId/payslips/:payslipId.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
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

class _GradientHeader extends StatelessWidget {
  final HrPayslip ps;
  const _GradientHeader({required this.ps});

  @override
  Widget build(BuildContext context) {
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
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.ios_share_rounded, color: Colors.white),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Net pay', style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 4),
                Text(hrFormatINR(ps.netPay),
                    style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(ps.periodLabel, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _stat('Working', ps.workingDays.toStringAsFixed(0)),
                    const SizedBox(width: 16),
                    _stat('Paid', ps.paidDays.toStringAsFixed(0)),
                    const SizedBox(width: 16),
                    _stat('LOP', ps.lopDays.toStringAsFixed(ps.lopDays % 1 == 0 ? 0 : 1)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
        ],
      );
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
                    Expanded(child: Text(lines[i].name, style: RunqText.body.copyWith(color: t.ink, fontSize: 13))),
                    Text(hrFormatINR(lines[i].amount),
                        style: TextStyle(color: amountColor, fontSize: 13, fontWeight: FontWeight.w700)),
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
                Expanded(child: Text(totalLabel, style: TextStyle(color: totalInk, fontSize: 13, fontWeight: FontWeight.w700))),
                Text(hrFormatINR(totalAmount),
                    style: TextStyle(color: totalInk, fontSize: 14, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
