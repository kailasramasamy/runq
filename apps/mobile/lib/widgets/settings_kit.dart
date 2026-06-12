// Shared building blocks for the per-module settings/"more" pages
// (Inventory, Purchase, Manufacturing). Each module passes its own brand
// [accent] so the pages stay visually distinct while sharing chrome — the
// profile card, grouped rows, and the common Account group all live here so
// the module screens read as thin lists of destinations.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../providers/hr_providers.dart';
import '../screens/hr/widgets/hr_widgets.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

const _danger = Color(0xFFDC2626);

/// Profile header card — employee photo + name + a brand-tinted module/role
/// chip. Photo resolves from the same source as the home-header avatar.
class SettingsProfileCard extends ConsumerWidget {
  final Color accent;
  final String moduleLabel;
  final VoidCallback? onTap;
  const SettingsProfileCard({
    super.key,
    required this.accent,
    required this.moduleLabel,
    this.onTap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final me = ref.watch(hrMeProvider).valueOrNull;
    final user = ref.watch(authProvider).user;
    final name = me?.displayName ?? user?.name ?? user?.email ?? '—';
    final role = me?.systemRole;
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Row(
            children: [
              HrAvatar(
                name: name,
                photoUrl: me?.employee?.photoUrl,
                employeeId: me?.employee?.id,
                size: 56,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: RunqText.h3.copyWith(color: t.ink)),
                    const SizedBox(height: 5),
                    _Chip(accent: accent,
                        label: role != null ? '$moduleLabel · $role' : moduleLabel),
                  ],
                ),
              ),
              if (onTap != null)
                Icon(Icons.chevron_right_rounded, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final Color accent;
  final String label;
  const _Chip({required this.accent, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: RunqText.micro.copyWith(color: accent, fontWeight: FontWeight.w700)),
    );
  }
}

/// One tappable settings row. [danger] flips icon + label to red and drops
/// the chevron (used for Sign out).
class SettingsRow {
  final IconData icon;
  final String label;
  final bool danger;
  final VoidCallback? onTap;
  const SettingsRow(this.icon, this.label, {this.danger = false, this.onTap});
}

/// A titled card of [SettingsRow]s. When [accent] is set the title + row icons
/// take the module brand colour, so module groups read as branded and the
/// neutral Account group (no accent) stays grey.
class SettingsGroup extends StatelessWidget {
  final String title;
  final List<SettingsRow> rows;
  final Color? accent;
  const SettingsGroup({
    super.key,
    required this.title,
    required this.rows,
    this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(title.toUpperCase(),
              style: RunqText.label
                  .copyWith(color: accent ?? t.muted2, letterSpacing: 0.5)),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                _RowTile(
                  row: rows[i],
                  first: i == 0,
                  last: i == rows.length - 1,
                  accent: accent,
                ),
                if (i < rows.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 44),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _RowTile extends StatelessWidget {
  final SettingsRow row;
  final bool first;
  final bool last;
  final Color? accent;
  const _RowTile({
    required this.row,
    required this.first,
    required this.last,
    this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const radius = Radius.circular(RunqRadii.smallCard);
    return InkWell(
      onTap: row.onTap,
      borderRadius: BorderRadius.vertical(
        top: first ? radius : Radius.zero,
        bottom: last ? radius : Radius.zero,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            Icon(row.icon, size: 18,
                color: row.danger ? _danger : (accent ?? t.muted)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(row.label,
                  style: RunqText.body
                      .copyWith(color: row.danger ? _danger : t.ink)),
            ),
            if (!row.danger)
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
          ],
        ),
      ),
    );
  }
}

/// The Account group shared verbatim by every module's settings page —
/// appearance, notifications, language, and sign out. Kept neutral (no brand
/// accent) so it reads the same in every module.
class AccountSettingsGroup extends ConsumerWidget {
  const AccountSettingsGroup({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SettingsGroup(
      title: 'Account',
      rows: [
        SettingsRow(Icons.dark_mode_outlined, 'Appearance',
            onTap: () => context.push('/profile/appearance')),
        SettingsRow(Icons.notifications_outlined, 'Notifications',
            onTap: () => context.push('/profile/notifications')),
        SettingsRow(Icons.translate_outlined, 'Language',
            onTap: () => context.push('/profile/language')),
        SettingsRow(Icons.logout_rounded, 'Sign out', danger: true,
            onTap: () async {
          await ref.read(authProvider.notifier).logout();
          if (context.mounted) context.go('/signin');
        }),
      ],
    );
  }
}
