part of '../hr_employee_detail_screen.dart';

// Pay tab: payslip list row, CTC/daily-wage summary cards, and the
// Pay tab body.

// ─── Pay tab ──────────────────────────────────────────────────────────────

class _PayTab extends ConsumerWidget {
  final HrEmployee emp;
  const _PayTab({required this.emp});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final slipsAsync = ref.watch(hrEmployeePayslipsProvider(emp.id));
    final hasBank = emp.bankName != null ||
        emp.bankAccountMasked != null ||
        emp.bankIfsc != null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        if (emp.ctcAnnual != null)
          _CtcCard(annual: emp.ctcAnnual!)
        else if (emp.dailyWageRate != null)
          _WageCard(daily: emp.dailyWageRate!)
        else
          const _EmptyState(
            icon: Icons.payments_outlined,
            title: 'No compensation set',
            subtitle: 'Set CTC or daily wage rate from the web app to surface pay details here.',
          ),
        if (hasBank) ...[
          const SizedBox(height: 14),
          _Section(
            title: 'Payout account',
            rows: [
              if (emp.bankName != null)
                _InfoRow(icon: Icons.account_balance_rounded, label: 'Bank', value: emp.bankName!),
              if (emp.bankAccountMasked != null)
                _InfoRow(icon: Icons.account_balance_wallet_outlined, label: 'Account', value: emp.bankAccountMasked!),
              if (emp.bankIfsc != null)
                _InfoRow(icon: Icons.code_rounded, label: 'IFSC', value: emp.bankIfsc!),
            ],
          ),
        ],
        const SizedBox(height: 18),
        slipsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 28),
            child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
          ),
          error: (e, _) => Text('$e', style: RunqText.body.copyWith(color: t.muted)),
          data: (slips) {
            if (slips.isEmpty) {
              return Padding(
                padding: const EdgeInsets.all(8),
                child: Text(
                  'Payslips appear here after each payroll run is approved.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                  child: Text('Payslips',
                      style: RunqText.label.copyWith(color: t.muted2)),
                ),
                ...slips.map((ps) => _EmpPayslipRow(ps: ps)),
              ],
            );
          },
        ),
      ],
    );
  }
}

// Mirrors the self-service Pay screen's payslip row so the admin and
// employee views read identically. Taps through to the shared payslip
// breakdown route.
class _EmpPayslipRow extends StatelessWidget {
  final HrPayslip ps;
  const _EmpPayslipRow({required this.ps});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: InkWell(
        onTap: () => context.push('/hr/payslips/${ps.payrollRunId}/${ps.id}'),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ps.periodLabel,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 2),
                    Text('Gross ${hrFormatINR(ps.gross)}',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(hrFormatINR(ps.netPay < 0 ? 0 : ps.netPay),
                      style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
                  if (ps.netPay < 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('${hrFormatINR(-ps.netPay)} owed',
                          style: RunqText.caption.copyWith(
                              color: const Color(0xFFDC2626),
                              fontWeight: FontWeight.w600)),
                    ),
                ],
              ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _CtcCard extends StatelessWidget {
  final double annual;
  const _CtcCard({required this.annual});

  @override
  Widget build(BuildContext context) {
    final monthly = annual / 12;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: HrColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.payments_rounded, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text('Annual CTC',
                  style: RunqText.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w600, letterSpacing: 0.3,
                  )),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            hrFormatINR(annual),
            style: RunqText.tabular(size: 30, w: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text('${hrFormatINR(monthly)} / month',
              style: RunqText.body.copyWith(
                color: Colors.white.withValues(alpha: 0.85),
              )),
        ],
      ),
    );
  }
}

class _WageCard extends StatelessWidget {
  final double daily;
  const _WageCard({required this.daily});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: HrColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.engineering_outlined, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text('Daily wage',
                  style: RunqText.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w600, letterSpacing: 0.3,
                  )),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            hrFormatINR(daily),
            style: RunqText.tabular(size: 30, w: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text('per day worked',
              style: RunqText.body.copyWith(color: Colors.white.withValues(alpha: 0.85))),
        ],
      ),
    );
  }
}
