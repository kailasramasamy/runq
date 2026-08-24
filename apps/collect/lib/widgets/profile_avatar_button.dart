import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../screens/profile_screen.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// The signed-in user's initial, as a tap target in the operator home headers.
///
/// Profile carries language, support, theme, sign-out and account deletion —
/// occasional business, not the daily loop the bottom nav is for. Giving it a
/// header slot beside [NotificationBell] frees the fifth tab for work an
/// operator actually does every shift.
class ProfileAvatarButton extends ConsumerWidget {
  const ProfileAvatarButton({super.key, this.subtitle});

  /// Passed through to the profile screen — the node this operator runs.
  final String? subtitle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final name = ref.watch(authProvider).user?.name ?? '';
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    return Tooltip(
      message: l.navProfile,
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ProfileScreen(subtitle: subtitle),
        )),
        // Ripple follows the box + its padding, so it stays a rounded square
        // rather than bleeding past the corners.
        borderRadius: BorderRadius.circular(DhenuRadii.avatar + DhenuSpacing.xs),
        child: Padding(
          padding: const EdgeInsets.all(DhenuSpacing.xs),
          child: Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: t.brandSubtle,
              borderRadius: BorderRadius.circular(DhenuRadii.avatar),
              border: Border.all(color: t.brand.withValues(alpha: 0.35)),
            ),
            child: Text(initial,
                style: DhenuText.label
                    .copyWith(color: t.brand, fontWeight: FontWeight.w800)),
          ),
        ),
      ),
    );
  }
}
