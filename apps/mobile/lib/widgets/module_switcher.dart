// Reusable module-switcher pill — shows the current module with a
// chevron, opens a popup of the other modules on tap. Replaces the old
// binary HrModulePill so we can host more than 2 modules.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/app_module_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

class ModuleSwitcher extends ConsumerWidget {
  const ModuleSwitcher({
    super.key,
    this.onDarkSurface = false,
    this.accent,
  });

  /// True when the pill sits on a dark gradient header (HR home top-bar).
  /// In dark-surface mode the ink/border use white-alpha; in light-surface
  /// mode they use the `accent` (defaults to the active module's accent).
  final bool onDarkSurface;

  /// Override for the light-surface ink + border colour. If null, falls
  /// back to the active module's brand colour.
  final Color? accent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(appModuleProvider);
    final tone = accent ?? _accentFor(context, active);
    final ink = onDarkSurface ? Colors.white : tone;
    final bg = onDarkSurface
        ? Colors.white.withValues(alpha: 0.14)
        : tone.withValues(alpha: 0.10);
    final border = onDarkSurface
        ? Colors.white.withValues(alpha: 0.22)
        : tone.withValues(alpha: 0.22);

    return PopupMenuButton<AppModule>(
      tooltip: 'Switch module',
      offset: const Offset(0, 38),
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      onSelected: (m) async {
        if (m == active) return;
        await ref.read(appModuleProvider.notifier).setModule(m);
        if (context.mounted) context.go(m.homeRoute);
      },
      itemBuilder: (_) => AppModule.values
          .map((m) => PopupMenuItem<AppModule>(
                value: m,
                child: _MenuRow(module: m, isActive: m == active),
              ))
          .toList(),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 7, 8, 7),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border, width: 0.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(active.icon, size: 14, color: ink),
            const SizedBox(width: 6),
            Text(
              active.label,
              style: RunqText.caption.copyWith(color: ink, fontWeight: FontWeight.w600),
            ),
            const SizedBox(width: 2),
            Icon(Icons.expand_more_rounded, size: 16, color: ink),
          ],
        ),
      ),
    );
  }

  Color _accentFor(BuildContext context, AppModule m) {
    // Match the in-module accent so the pill blends with whichever home
    // it's sitting on. Kept self-contained so this widget doesn't have to
    // import every module's colour file.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return switch (m) {
      AppModule.finance => isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
      AppModule.hr => isDark ? const Color(0xFF67E8F9) : const Color(0xFF0891B2),
      AppModule.inventory => isDark ? const Color(0xFFFCD34D) : const Color(0xFFD97706),
    };
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.module, required this.isActive});
  final AppModule module;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Icon(module.icon, size: 16, color: isActive ? t.ink : t.muted),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            module.label,
            style: RunqText.body.copyWith(
              color: isActive ? t.ink : t.muted,
              fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
            ),
          ),
        ),
        if (isActive) Icon(Icons.check_rounded, size: 16, color: t.ink),
      ],
    );
  }
}
