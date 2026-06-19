import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_toast.dart';

/// Services tab (redesign §6.6): polished "coming soon" state — four service
/// cards with icon chips + SOON pills, plus the existing Notify-me CTA.
class FarmerServicesStub extends StatelessWidget {
  const FarmerServicesStub({super.key});

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _header(t),
        const SizedBox(height: DhenuSpacing.xxl),
        _ServiceCard(
          icon: DhenuIcons.feed,
          tint: t.gradeB,
          name: 'Cattle Feed',
          description: 'Quality fodder & supplements delivered to your farm.',
        ),
        const SizedBox(height: DhenuSpacing.md),
        _ServiceCard(
          icon: DhenuIcons.vet,
          tint: t.brand,
          name: 'Veterinary Care',
          description: 'Doorstep vet visits, health check-ups & vaccinations.',
        ),
        const SizedBox(height: DhenuSpacing.md),
        _ServiceCard(
          icon: DhenuIcons.insurance,
          tint: t.pm,
          name: 'Insurance',
          description: 'Cattle insurance to protect your herd & livelihood.',
        ),
        const SizedBox(height: DhenuSpacing.md),
        _ServiceCard(
          icon: DhenuIcons.loans,
          tint: t.gradeA,
          name: 'Loans & Advances',
          description: 'Instant advances against your milk supply earnings.',
        ),
        const SizedBox(height: DhenuSpacing.xxl),
        _notifyButton(context, t),
      ],
    );
  }

  Widget _header(DhenuTokens t) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Services', style: DhenuText.h2.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            'Farmer services are on their way — stay tuned.',
            style: DhenuText.body.copyWith(color: t.inkSoft),
          ),
        ],
      );

  Widget _notifyButton(BuildContext context, DhenuTokens t) => SizedBox(
        height: DhenuSpacing.minTap,
        child: OutlinedButton.icon(
          onPressed: () => showDhenuToast(
              context, "We'll notify you when services go live!", type: DhenuToastType.info),
          icon: Icon(DhenuIcons.bell, size: 18, color: t.brand),
          label: const Text('Notify me when live'),
          style: OutlinedButton.styleFrom(
            foregroundColor: t.brand,
            side: BorderSide(color: t.brand),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(DhenuRadii.button)),
            textStyle: DhenuText.label,
          ),
        ),
      );
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.icon,
    required this.tint,
    required this.name,
    required this.description,
  });

  final IconData icon;
  final Color tint;
  final String name;
  final String description;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return DhenuCard(
      elevated: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _iconChip(tint),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: _labels(t)),
          const SizedBox(width: DhenuSpacing.sm),
          _soonChip(t),
        ],
      ),
    );
  }

  Widget _iconChip(Color tint) => Container(
        width: 46,
        height: 46,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: tint.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Icon(icon, size: 22, color: tint),
      );

  Widget _labels(DhenuTokens t) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(name, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            description,
            style: DhenuText.caption.copyWith(color: t.inkSoft),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      );

  Widget _soonChip(DhenuTokens t) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: t.inkSoft.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text(
          'SOON',
          style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.6),
        ),
      );
}
