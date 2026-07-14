import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import '../providers/hr_providers.dart';
import '../screens/hr/widgets/hr_widgets.dart';
import 'gradient_avatar.dart';

/// Header profile avatar shared by every module home (Finance, HR, Inventory,
/// Purchase, Manufacturing). Shows the signed-in user's employee photo when
/// one exists — same source as the HR home avatar — and falls back to the
/// indigo initials tile otherwise. [onTap] routes to each module's own
/// settings page, so the avatar reads consistently across the app while the
/// destination stays module-specific.
class ProfileAvatarButton extends ConsumerWidget {
  /// Tap target — routes to the module's settings/profile page. When null the
  /// avatar renders non-interactively (e.g. the profile screen's own hero).
  final VoidCallback? onTap;
  final double size;
  /// Optional display-name override for the initials fallback. Defaults to the
  /// signed-in user's name; pass this when the caller already computed a
  /// display name so the initials stay identical.
  final String? name;
  final bool showOnlineDot;
  final Color? onlineDotBorderColor;
  const ProfileAvatarButton({
    super.key,
    this.onTap,
    this.size = 40,
    this.name,
    this.showOnlineDot = false,
    this.onlineDotBorderColor,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employee = ref.watch(hrMeProvider).valueOrNull?.employee;
    final user = ref.watch(authProvider).user;
    final displayName = name ?? user?.name ?? user?.email ?? '?';
    final photoUrl = employee?.photoUrl?.trim();
    final hasPhoto = photoUrl != null && photoUrl.isNotEmpty;
    final avatar = hasPhoto
        ? HrAvatar(
            name: displayName,
            size: size,
            photoUrl: photoUrl,
            employeeId: employee?.id,
            showOnlineDot: showOnlineDot,
            onlineDotBorderColor: onlineDotBorderColor,
          )
        : GradientAvatar(
            name: displayName,
            size: size,
            showOnlineDot: showOnlineDot,
            onlineDotBorderColor: onlineDotBorderColor,
          );
    if (onTap == null) return avatar;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: avatar,
    );
  }
}
