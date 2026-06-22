import 'package:flutter/material.dart';
import '../../l10n/app_localizations.dart';
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
    final l = AppLocalizations.of(context);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _header(t, l),
        const SizedBox(height: DhenuSpacing.xxl),
        _ServiceCard(
          icon: DhenuIcons.feed,
          tint: t.gradeB,
          name: l.farmerServicesCattleFeedName,
          description: l.farmerServicesCattleFeedDesc,
        ),
        const SizedBox(height: DhenuSpacing.md),
        _ServiceCard(
          icon: DhenuIcons.vet,
          tint: t.brand,
          name: l.farmerServicesVetName,
          description: l.farmerServicesVetDesc,
        ),
        const SizedBox(height: DhenuSpacing.md),
        _ServiceCard(
          icon: DhenuIcons.insurance,
          tint: t.pm,
          name: l.farmerServicesInsuranceName,
          description: l.farmerServicesInsuranceDesc,
        ),
        const SizedBox(height: DhenuSpacing.md),
        _ServiceCard(
          icon: DhenuIcons.loans,
          tint: t.gradeA,
          name: l.farmerServicesLoansName,
          description: l.farmerServicesLoansDesc,
        ),
        const SizedBox(height: DhenuSpacing.xxl),
        _notifyButton(context, t, l),
      ],
    );
  }

  Widget _header(DhenuTokens t, AppLocalizations l) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(l.farmerServicesTitle, style: DhenuText.h2.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            l.farmerServicesSubtitle,
            style: DhenuText.body.copyWith(color: t.inkSoft),
          ),
        ],
      );

  Widget _notifyButton(BuildContext context, DhenuTokens t, AppLocalizations l) => SizedBox(
        height: DhenuSpacing.minTap,
        child: OutlinedButton.icon(
          onPressed: () => showDhenuToast(context, l.farmerServicesNotifyToast,
              type: DhenuToastType.info),
          icon: Icon(DhenuIcons.bell, size: 18, color: t.brand),
          label: Text(l.farmerServicesNotifyMe),
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
    final l = AppLocalizations.of(context);
    return DhenuCard(
      elevated: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _iconChip(tint),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: _labels(t)),
          const SizedBox(width: DhenuSpacing.sm),
          _soonChip(t, l),
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

  Widget _soonChip(DhenuTokens t, AppLocalizations l) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
        decoration: BoxDecoration(
          color: t.inkSoft.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text(
          l.farmerServicesSoon,
          style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.6),
        ),
      );
}
