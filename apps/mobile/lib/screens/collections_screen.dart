import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/dunning_models.dart';
import '../api/dunning_repo.dart';
import '../providers/dunning_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/runq_card.dart';
import '../widgets/section_head.dart';

class CollectionsScreen extends ConsumerWidget {
  const CollectionsScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(overdueInvoicesProvider);
    await ref
        .read(overdueInvoicesProvider.future)
        .catchError((_) => throw 0);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overdue = ref.watch(overdueInvoicesProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: RT(context).brand,
          onRefresh: () => _refresh(ref),
          child: AsyncSlot<List<OverdueInvoice>>(
            value: overdue,
            onRetry: () => ref.invalidate(overdueInvoicesProvider),
            data: (list) {
              final groups = CustomerArAging.group(list);
              final buckets = ArAgingBuckets.from(list);
              final totalDue = list.fold<double>(0, (s, i) => s + i.balanceDue);
              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                slivers: [
                  const SliverToBoxAdapter(child: _Header()),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    sliver: SliverToBoxAdapter(
                      child: _CollectionsHero(
                        totalDue: totalDue,
                        invoiceCount: list.length,
                        customerCount: groups.length,
                        worstDaysOverdue: list.fold<int>(
                            0, (m, i) => i.daysOverdue > m ? i.daysOverdue : m),
                      ),
                    ),
                  ),
                  if (list.isNotEmpty)
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      sliver: SliverToBoxAdapter(
                        child: _BucketBar(buckets: buckets),
                      ),
                    ),
                  if (groups.isEmpty)
                    const SliverPadding(
                      padding: EdgeInsets.fromLTRB(16, 40, 16, 120),
                      sliver: SliverToBoxAdapter(
                        child: EmptyState(
                          icon: Icons.celebration_outlined,
                          title: 'All clear',
                          subtitle: 'No overdue invoices to chase right now.',
                        ),
                      ),
                    )
                  else ...[
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      sliver: SliverToBoxAdapter(
                        child: SectionHead(
                          title:
                              '${groups.length} ${groups.length == 1 ? 'customer' : 'customers'}',
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                      sliver: SliverList.separated(
                        itemCount: groups.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => _CustomerRow(group: groups[i]),
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
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
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
      child: Row(
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
                Text('Receivables', style: RunqText.body.copyWith(color: t.muted)),
                Text('Aging & collections',
                    style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CollectionsHero extends StatelessWidget {
  final double totalDue;
  final int invoiceCount;
  final int customerCount;
  final int worstDaysOverdue;
  const _CollectionsHero({
    required this.totalDue,
    required this.invoiceCount,
    required this.customerCount,
    required this.worstDaysOverdue,
  });

  @override
  Widget build(BuildContext context) {
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
            'OVERDUE',
            style: RunqText.label.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatINR(totalDue),
            style: RunqText.display.copyWith(
                color: Colors.white, height: 1.05),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _HeroChip(
                  label: 'Invoices',
                  value: '$invoiceCount',
                  caption: customerCount > 1
                      ? 'across $customerCount customers'
                      : '$customerCount customer',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _HeroChip(
                  label: 'Worst overdue',
                  value: '${worstDaysOverdue}d',
                  caption: worstDaysOverdue >= 45
                      ? 'escalation-grade'
                      : worstDaysOverdue >= 15
                          ? 'firm reminder due'
                          : 'gentle reminder',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  final String label, value, caption;
  const _HeroChip({
    required this.label,
    required this.value,
    required this.caption,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.7),
              )),
          const SizedBox(height: 4),
          Text(value,
              style: RunqText.tabular(
                  size: 18, w: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(caption,
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.78),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _BucketBar extends StatelessWidget {
  final ArAgingBuckets buckets;
  const _BucketBar({required this.buckets});

  @override
  Widget build(BuildContext context) {
    final total = buckets.total;
    if (total <= 0) return const SizedBox.shrink();

    final entries = [
      (label: '1–30d', amount: buckets.bucket1to30, color: const Color(0xFFFCD34D)),
      (label: '31–60d', amount: buckets.bucket31to60, color: const Color(0xFFF97316)),
      (label: '61–90d', amount: buckets.bucket61to90, color: const Color(0xFFDC2626)),
      (label: '90+d', amount: buckets.bucket90plus, color: const Color(0xFF7F1D1D)),
    ];

    return RunqCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'AGING BUCKETS',
            style: RunqText.label.copyWith(color: RT(context).muted2),
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              height: 8,
              child: Row(
                children: [
                  for (final e in entries)
                    if (e.amount > 0)
                      Expanded(
                        flex: ((e.amount / total) * 1000).round().clamp(1, 1000),
                        child: Container(color: e.color),
                      ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              for (final e in entries)
                _BucketLegend(
                  label: e.label,
                  amount: e.amount,
                  color: e.color,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BucketLegend extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;
  const _BucketLegend({
    required this.label,
    required this.amount,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 6),
        Text(label,
            style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(width: 4),
        Text(formatINR(amount, compact: true),
            style: RunqText.tabular(size: 12, w: FontWeight.w700, color: t.ink)),
      ],
    );
  }
}

class _CustomerRow extends StatelessWidget {
  final CustomerArAging group;
  const _CustomerRow({required this.group});

  Color _severityColor(int days) {
    if (days >= 90) return const Color(0xFF7F1D1D);
    if (days >= 60) return const Color(0xFFDC2626);
    if (days >= 30) return const Color(0xFFF97316);
    return const Color(0xFFB45309);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final worst = group.worstDaysOverdue;
    return RunqCard(
      onTap: () => _showActionSheet(context, group),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          RqAvatar(name: group.customerName, size: 44, square: true),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(group.customerName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _severityColor(worst).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${worst}d overdue',
                        style: RunqText.label.copyWith(
                          color: _severityColor(worst),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${group.invoices.length} ${group.invoices.length == 1 ? 'invoice' : 'invoices'}',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(formatINR(group.totalDue, compact: true),
                  style: RunqText.tabular(
                      size: 16, w: FontWeight.w700, color: t.ink)),
              const SizedBox(height: 2),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
            ],
          ),
        ],
      ),
    );
  }
}

void _showActionSheet(BuildContext context, CustomerArAging group) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ActionSheet(group: group),
  );
}

class _ActionSheet extends ConsumerWidget {
  final CustomerArAging group;
  const _ActionSheet({required this.group});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final phone = group.customerPhone?.replaceAll(RegExp(r'[^\d+]'), '');
    final hasPhone = phone != null && phone.isNotEmpty;
    final hasEmail = (group.customerEmail ?? '').isNotEmpty;

    // Don't wrap in SafeArea — that would leave the home-indicator gap as
    // the dim scrim showing through. Extend the Container all the way to
    // the screen bottom and pad the content above the bottom inset.
    final bottomInset = MediaQuery.of(context).viewPadding.bottom;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.sheet,
      ),
      padding: EdgeInsets.fromLTRB(20, 14, 20, 18 + bottomInset),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(group.customerName,
                style: RunqText.h3.copyWith(color: t.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(
              '${group.invoices.length} ${group.invoices.length == 1 ? 'invoice' : 'invoices'} · ${formatINR(group.totalDue)} due',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 18),
            _ActionButton(
              icon: Icons.message_rounded,
              label: 'Send WhatsApp reminder',
              colorBg: const Color(0xFF25D366).withValues(alpha: 0.12),
              colorFg: const Color(0xFF128C7E),
              enabled: hasPhone,
              onTap: hasPhone
                  ? () => _sendWhatsapp(context, ref, group, phone)
                  : null,
              caption: hasPhone ? null : 'no phone on customer record',
            ),
            const SizedBox(height: 8),
            _ActionButton(
              icon: Icons.phone_rounded,
              label: 'Call customer',
              colorBg: const Color(0xFFE0E7FF),
              colorFg: const Color(0xFF4338CA),
              enabled: hasPhone,
              onTap: hasPhone
                  ? () async {
                      Navigator.of(context).pop();
                      final uri = Uri.parse('tel:$phone');
                      await launchUrl(uri);
                    }
                  : null,
              caption: hasPhone ? null : 'no phone on customer record',
            ),
            const SizedBox(height: 8),
            _ActionButton(
              icon: Icons.mail_outline_rounded,
              label: 'Send email reminder',
              colorBg: const Color(0xFFFEF3C7),
              colorFg: const Color(0xFF92400E),
              enabled: hasEmail,
              onTap: hasEmail
                  ? () => _sendEmail(context, ref, group)
                  : null,
              caption: hasEmail ? null : 'no email on customer record',
            ),
          ],
        ),
    );
  }

  Future<void> _sendWhatsapp(
    BuildContext context,
    WidgetRef ref,
    CustomerArAging group,
    String phone,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final rendered = await dunningRepo.render(
        customerId: group.customerId,
        channel: 'whatsapp',
      );
      navigator.pop();
      // wa.me/<phone>?text=<encoded> — works on iOS & Android even without
      // WhatsApp installed (it'll fall back to the web installer).
      final clean = phone.replaceAll('+', '');
      final uri = Uri.parse(
          'https://wa.me/$clean?text=${Uri.encodeComponent(rendered.text)}');
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) {
        await Clipboard.setData(ClipboardData(text: rendered.text));
        messenger.showSnackBar(const SnackBar(
            content: Text('WhatsApp not available — message copied to clipboard')));
      }
    } catch (e) {
      messenger.showSnackBar(
          SnackBar(content: Text('Could not open WhatsApp: $e')));
    }
  }

  Future<void> _sendEmail(
    BuildContext context,
    WidgetRef ref,
    CustomerArAging group,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final rules = await ref.read(dunningRulesProvider.future);
      // Pick the rule whose escalation level matches the worst overdue
      // invoice — same logic the auto-run uses.
      final worst = group.worstDaysOverdue;
      final level = worst >= 45 ? 4 : worst >= 30 ? 3 : worst >= 15 ? 2 : 1;
      final rule = rules.firstWhere(
        (r) => r.escalationLevel == level && r.isActive,
        orElse: () => rules.firstWhere((r) => r.isActive,
            orElse: () => rules.first),
      );
      await dunningRepo.sendReminders(
        invoiceIds: group.invoices.map((i) => i.id).toList(),
        ruleId: rule.id,
      );
      navigator.pop();
      messenger.showSnackBar(
        const SnackBar(content: Text('Reminder sent')),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text("Couldn't send reminder: $e")),
      );
    }
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color colorBg;
  final Color colorFg;
  final VoidCallback? onTap;
  final bool enabled;
  final String? caption;
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.colorBg,
    required this.colorFg,
    required this.enabled,
    this.onTap,
    this.caption,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: t.surface,
              border: Border.all(color: t.hairline, width: 0.5),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colorBg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: Icon(icon, color: colorFg, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(label,
                          style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      if (caption != null) ...[
                        const SizedBox(height: 2),
                        Text(caption!,
                            style: RunqText.caption
                                .copyWith(color: t.muted)),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
