import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';

/// Lists the tenant's saved quick-invoice templates. Tapping one opens the
/// generate screen where the user adjusts quantities and creates the invoice.
/// Templates themselves are managed on the web (admin panel).
class QuickInvoiceTemplatesScreen extends ConsumerStatefulWidget {
  const QuickInvoiceTemplatesScreen({super.key});

  @override
  ConsumerState<QuickInvoiceTemplatesScreen> createState() =>
      _QuickInvoiceTemplatesScreenState();
}

class _QuickInvoiceTemplatesScreenState
    extends ConsumerState<QuickInvoiceTemplatesScreen> {
  late Future<List<QuickInvoiceTemplate>> _future;

  @override
  void initState() {
    super.initState();
    _future = quickTemplatesRepo.list();
  }

  Future<void> _refresh() async {
    setState(() => _future = quickTemplatesRepo.list());
    await _future.catchError((_) => <QuickInvoiceTemplate>[]);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Quick invoice'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          color: RunqColors.indigo,
          child: FutureBuilder<List<QuickInvoiceTemplate>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snap.hasError) {
                final msg = snap.error is ApiException
                    ? (snap.error as ApiException).message
                    : 'Could not load templates';
                return _Centered(
                  icon: Icons.error_outline_rounded,
                  title: msg,
                );
              }
              final list = (snap.data ?? const <QuickInvoiceTemplate>[])
                  .where((tpl) => tpl.isActive)
                  .toList();
              if (list.isEmpty) {
                return const _Centered(
                  icon: Icons.bolt_rounded,
                  title: 'No quick invoice templates yet',
                  subtitle:
                      'Set up templates from the web admin to generate invoices in two taps.',
                );
              }
              return ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) => _TemplateCard(template: list[i]),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _TemplateCard extends StatelessWidget {
  final QuickInvoiceTemplate template;
  const _TemplateCard({required this.template});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final landingTotal = template.items.fold<double>(0, (s, it) {
      final landing = it.unitPrice * (1 + (it.taxRate ?? 0) / 100);
      return s + landing * it.defaultQuantity;
    });
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        onTap: () => context.push('/quick-invoice/templates/${template.id}'),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          decoration: BoxDecoration(
            border: Border.all(color: t.hairline, width: 0.5),
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          ),
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: RunqColors.indigo.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.bolt_rounded,
                    color: RunqColors.indigo, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(template.name,
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (template.customerName != null && template.customerName!.isNotEmpty)
                          template.customerName!,
                        '${template.items.length} ${template.items.length == 1 ? 'item' : 'items'}',
                      ].join(' · '),
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatINR(landingTotal),
                      style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                  const SizedBox(height: 2),
                  Text('default', style: RunqText.micro.copyWith(color: t.muted)),
                ],
              ),
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

class _Centered extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  const _Centered({required this.icon, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(icon, size: 36, color: t.muted),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(title,
              textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(subtitle!,
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ],
      ],
    );
  }
}
