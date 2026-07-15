import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_toast.dart';

/// Help & support screen — contact rows plus static FAQ entries.
class HelpSupportScreen extends ConsumerWidget {
  const HelpSupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    // Tenant-configured contacts (GET /config/support). No fallbacks: a row
    // only renders when the tenant actually set that contact — a placeholder
    // number would dial a dead line.
    final cfg = ref.watch(supportConfigProvider).value;
    final phone = cfg?.phone;
    final email = cfg?.email;
    final whatsApp = cfg?.whatsapp;
    final hasAny = phone != null || email != null || whatsApp != null;

    return Scaffold(
      appBar: AppBar(
        title: Text('Help & support', style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4,
        ),
        children: [
          if (hasAny)
            DhenuCard(
              padding: EdgeInsets.zero,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (phone != null)
                    _ContactRow(
                      icon: LucideIcons.phone,
                      label: 'Call support',
                      isLast: email == null && whatsApp == null,
                      onTap: (ctx) => _launch(ctx, Uri.parse('tel:$phone')),
                    ),
                  if (phone != null && email != null) _divider(t),
                  if (email != null)
                    _ContactRow(
                      icon: LucideIcons.mail,
                      label: 'Email support',
                      isLast: whatsApp == null,
                      onTap: (ctx) => _launch(
                        ctx,
                        Uri(
                          scheme: 'mailto',
                          path: email,
                          queryParameters: {'subject': 'Dhenu support'},
                        ),
                      ),
                    ),
                  if (whatsApp != null && (phone != null || email != null)) _divider(t),
                  if (whatsApp != null)
                    _ContactRow(
                      icon: LucideIcons.message_circle,
                      label: 'Chat on WhatsApp',
                      isLast: true,
                      onTap: (ctx) => _launch(
                        ctx,
                        Uri.parse('https://wa.me/$whatsApp'),
                        mode: LaunchMode.externalApplication,
                      ),
                    ),
                ],
              ),
            )
          else
            Text(
              'Support contacts have not been set up yet — please ask your dairy administrator.',
              style: DhenuText.body.copyWith(color: t.inkSoft),
            ),
          const SizedBox(height: DhenuSpacing.md),
          if (hasAny)
            Text(
              'We usually reply within a few hours.',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          const SizedBox(height: DhenuSpacing.lg),
          _faqCard(context, t),
        ],
      ),
    );
  }

  Widget _divider(DhenuTokens t) => Padding(
        padding: const EdgeInsets.only(
          left: DhenuSpacing.lg + 36 + DhenuSpacing.md,
        ),
        child: Container(height: 1, color: t.hairline),
      );

  Widget _faqCard(BuildContext context, DhenuTokens t) {
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _FaqEntry(
            question: 'How do I record a collection?',
            answer:
                'Tap Collect in the bottom bar, pick the farmer, then enter quantity, FAT and SNF.',
          ),
          Padding(
            padding: const EdgeInsets.only(
              left: DhenuSpacing.lg + 36 + DhenuSpacing.md,
            ),
            child: Container(height: 1, color: t.hairline),
          ),
          _FaqEntry(
            question: 'When are payouts settled?',
            answer:
                'Payouts follow your centre\'s cycle. Check the Payments tab for the current cycle window.',
            isLast: true,
          ),
        ],
      ),
    );
  }

  static Future<void> _launch(
    BuildContext context,
    Uri uri, {
    LaunchMode mode = LaunchMode.platformDefault,
  }) async {
    final ok = await launchUrl(uri, mode: mode);
    if (!context.mounted) return;
    if (!ok) {
      showDhenuToast(context, 'Could not open', type: DhenuToastType.error);
    }
  }
}

// ── Contact row widget ─────────────────────────────────────────────────────

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isLast = false,
  });

  final IconData icon;
  final String label;
  final Future<void> Function(BuildContext) onTap;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: () => onTap(context),
        borderRadius: isLast
            ? const BorderRadius.vertical(bottom: Radius.circular(DhenuRadii.card))
            : BorderRadius.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg,
            vertical: DhenuSpacing.md,
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: t.brandSubtle,
                  borderRadius: BorderRadius.circular(DhenuRadii.input),
                ),
                child: Icon(icon, size: 18, color: t.brand),
              ),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: Text(label, style: DhenuText.body.copyWith(color: t.ink))),
              Icon(LucideIcons.chevron_right, size: 18, color: t.inkSoft),
            ],
          ),
        ),
      ),
    );
  }
}

// ── FAQ entry widget ───────────────────────────────────────────────────────

class _FaqEntry extends StatelessWidget {
  const _FaqEntry({
    required this.question,
    required this.answer,
    this.isLast = false,
  });

  final String question;
  final String answer;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        DhenuSpacing.lg,
        DhenuSpacing.md,
        DhenuSpacing.lg,
        isLast ? DhenuSpacing.md : DhenuSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(question, style: DhenuText.label.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(answer, style: DhenuText.body.copyWith(color: t.inkSoft)),
        ],
      ),
    );
  }
}
