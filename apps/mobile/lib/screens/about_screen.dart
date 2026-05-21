import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/app_info.dart';
import '../widgets/runq_card.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const _Header(),
            Expanded(
              child: ListView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                children: const [
                  _Hero(),
                  SizedBox(height: 18),
                  _FeatureGroupHeader('What you can do'),
                  SizedBox(height: 8),
                  _FeatureCard(
                    icon: Icons.receipt_long_rounded,
                    title: 'Sales (AR)',
                    bullets: [
                      'Issue GST invoices, send via WhatsApp / email',
                      'PO inbox: drop a customer PO → AI drafts the invoice',
                      'Record receipts, dunning reminders, UPI payment links',
                    ],
                  ),
                  SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.description_rounded,
                    title: 'Bills (AP)',
                    bullets: [
                      'Snap a vendor bill — AI extracts line items + GST',
                      'Three-way match: bill ↔ PO ↔ GRN',
                      'Approval workflow, payment runs, vendor ledger',
                    ],
                  ),
                  SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.account_balance_rounded,
                    title: 'Banking',
                    bullets: [
                      'Auto-categorize bank transactions',
                      'Reconcile receipts and payments to invoices/bills',
                      'Track upcoming cheques and clearance',
                    ],
                  ),
                  SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.assignment_turned_in_rounded,
                    title: 'GST & compliance',
                    bullets: [
                      'GSTR-1, GSTR-3B preparation and e-filing',
                      'HSN/SAC validation, place-of-supply detection',
                      'Audit trail across every posting',
                    ],
                  ),
                  SizedBox(height: 10),
                  _FeatureCard(
                    icon: Icons.bolt_rounded,
                    title: 'AI assistant',
                    bullets: [
                      'Ask agent for cash position, ageing, anomalies',
                      'Daily snapshot on the dashboard',
                      'WhatsApp-style intake for invoices and POs',
                    ],
                  ),
                  SizedBox(height: 22),
                  _Footer(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
            color: t.ink,
          ),
          Expanded(child: Center(child: Text('About', style: RunqText.bodyStrong.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Image.asset(
            'assets/branding/runq-app-logo.png',
            width: 56,
            height: 56,
            filterQuality: FilterQuality.medium,
          ),
          const SizedBox(height: 14),
          Text('runQ', style: RunqText.h1),
          const SizedBox(height: 4),
          Text(
            'Daily-ops finance OS for Indian SMEs.',
            style: RunqText.body.copyWith(color: t.muted),
          ),
          const SizedBox(height: 10),
          Text(
            'Run AR, AP, banking, and GST from one place — AI handles the typing.',
            style: RunqText.caption.copyWith(color: t.muted2, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _FeatureGroupHeader extends StatelessWidget {
  final String label;
  const _FeatureGroupHeader(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, top: 4),
      child: Text(label, style: RunqText.label),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final List<String> bullets;
  const _FeatureCard({required this.icon, required this.title, required this.bullets});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: RunqColors.indigo.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                alignment: Alignment.center,
                child: Icon(icon, color: RT(context).brand, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(title, style: RunqText.h4)),
            ],
          ),
          const SizedBox(height: 10),
          for (final b in bullets)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 7, right: 10),
                    child: Container(
                      width: 4, height: 4,
                      decoration: BoxDecoration(color: t.muted, borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  Expanded(
                    child: Text(b, style: RunqText.body.copyWith(height: 1.4, color: t.ink2)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      children: [
        Text('Version $kAppVersionLabel',
            style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        Text('© runQ · Built for Indian SMEs',
            style: RunqText.caption.copyWith(color: t.muted2)),
      ],
    );
  }
}
