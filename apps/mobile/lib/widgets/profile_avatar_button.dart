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
  final VoidCallback onTap;
  final double size;
  const ProfileAvatarButton({super.key, required this.onTap, this.size = 40});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employee = ref.watch(hrMeProvider).valueOrNull?.employee;
    final user = ref.watch(authProvider).user;
    final name = user?.name ?? user?.email ?? '?';
    final photoUrl = employee?.photoUrl?.trim();
    final hasPhoto = photoUrl != null && photoUrl.isNotEmpty;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: hasPhoto
          ? HrAvatar(
              name: name,
              size: size,
              photoUrl: photoUrl,
              employeeId: employee?.id,
            )
          : GradientAvatar(name: name, size: size),
    );
  }
}
