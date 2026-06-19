import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_toast.dart';

const _appVersion = '1.0.0';
const _buildNumber = '1';
const _privacyUrl = 'https://dhenu.app/privacy';
const _termsUrl = 'https://dhenu.app/terms';

/// About screen — app identity, version, legal links.
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = DT(context);

    return Scaffold(
      appBar: AppBar(
        title: Text('About', style: DhenuText.h2.copyWith(color: t.ink)),
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4,
        ),
        children: [
          _brandBlock(t),
          const SizedBox(height: DhenuSpacing.xl),
          _legalCard(context, t),
          const SizedBox(height: DhenuSpacing.xl),
          Center(
            child: Text(
              'Made with care in India 🇮🇳',
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          ),
        ],
      ),
    );
  }

  Widget _brandBlock(DhenuTokens t) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: t.brandSubtle,
            borderRadius: BorderRadius.circular(DhenuRadii.input),
          ),
          child: Icon(LucideIcons.milk, size: 32, color: t.brand),
        ),
        const SizedBox(height: DhenuSpacing.md),
        Text('Dhenu', style: DhenuText.h2.copyWith(color: t.ink)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(
          'Milk procurement, simplified',
          style: DhenuText.body.copyWith(color: t.inkSoft),
        ),
        const SizedBox(height: DhenuSpacing.xs),
        Text(
          'Version $_appVersion ($_buildNumber)',
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
      ],
    );
  }

  Widget _legalCard(BuildContext context, DhenuTokens t) {
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _LegalRow(
            icon: LucideIcons.shield,
            label: 'Privacy Policy',
            onTap: (ctx) => _launch(ctx, Uri.parse(_privacyUrl)),
          ),
          Padding(
            padding: const EdgeInsets.only(
              left: DhenuSpacing.lg + 36 + DhenuSpacing.md,
            ),
            child: Container(height: 1, color: t.hairline),
          ),
          _LegalRow(
            icon: LucideIcons.file_text,
            label: 'Terms of Service',
            isLast: true,
            onTap: (ctx) => _launch(ctx, Uri.parse(_termsUrl)),
          ),
        ],
      ),
    );
  }

  static Future<void> _launch(BuildContext context, Uri uri) async {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!context.mounted) return;
    if (!ok) {
      showDhenuToast(context, 'Could not open', type: DhenuToastType.error);
    }
  }
}

// ── Legal row widget ───────────────────────────────────────────────────────

class _LegalRow extends StatelessWidget {
  const _LegalRow({
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
