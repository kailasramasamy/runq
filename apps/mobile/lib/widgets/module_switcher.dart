// Reusable module-switcher chip — shows the active module with a leading
// brand badge + label + chevron. Opens a menu of the three modules with
// label + one-line subtitle and a leading accent stripe on the active row.

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
    this.compact = false,
  });

  /// True when the chip sits on a dark gradient header.
  final bool onDarkSurface;

  /// Override the active-module brand colour (for surfaces that want a
  /// fixed colour). Defaults to the active module's accent.
  final Color? accent;

  /// Tighter padding for narrow surfaces (e.g. dense top-bars).
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(appModuleProvider);
    final tone = accent ?? _accentFor(context, active);
    final ink = onDarkSurface ? Colors.white : tone;
    final bg = onDarkSurface
        ? Colors.white.withValues(alpha: 0.12)
        : tone.withValues(alpha: 0.08);
    final border = onDarkSurface
        ? Colors.white.withValues(alpha: 0.20)
        : tone.withValues(alpha: 0.20);
    final padding = compact
        ? const EdgeInsets.fromLTRB(8, 6, 6, 6)
        : const EdgeInsets.fromLTRB(10, 8, 8, 8);

    return PopupMenuButton<AppModule>(
      tooltip: 'Switch module',
      offset: const Offset(0, 46),
      position: PopupMenuPosition.under,
      // The Material 3 PopupMenu picks up surfaceContainerHighest by default
      // which can look washed-out on bgWarm; lift it onto pure surface.
      elevation: 12,
      color: RT(context).surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      padding: EdgeInsets.zero,
      onSelected: (m) async {
        if (m == active) return;
        await ref.read(appModuleProvider.notifier).setModule(m);
        if (context.mounted) context.go(m.homeRoute);
      },
      itemBuilder: (_) => [
        for (final m in AppModule.values)
          PopupMenuItem<AppModule>(
            value: m,
            padding: EdgeInsets.zero,
            child: _MenuRow(
              module: m,
              isActive: m == active,
              accent: _accentFor(context, m),
            ),
          ),
      ],
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: padding,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border, width: 0.6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Leading badge — circular tinted dot with the module icon.
            Container(
              width: 22, height: 22,
              decoration: BoxDecoration(
                color: onDarkSurface
                    ? Colors.white.withValues(alpha: 0.22)
                    : tone.withValues(alpha: 0.16),
                shape: BoxShape.circle,
              ),
              child: Icon(active.icon, size: 13, color: ink),
            ),
            const SizedBox(width: 8),
            Text(
              active.label,
              style: RunqText.caption.copyWith(
                color: ink, fontWeight: FontWeight.w600, height: 1,
              ),
            ),
            const SizedBox(width: 2),
            Icon(Icons.expand_more_rounded, size: 18, color: ink.withValues(alpha: 0.85)),
          ],
        ),
      ),
    );
  }

  Color _accentFor(BuildContext context, AppModule m) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return switch (m) {
      AppModule.finance => isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
      AppModule.hr => isDark ? const Color(0xFF67E8F9) : const Color(0xFF0891B2),
      AppModule.inventory => isDark ? const Color(0xFFFCD34D) : const Color(0xFFD97706),
    };
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.module, required this.isActive, required this.accent});
  final AppModule module;
  final bool isActive;
  final Color accent;

  String get _subtitle => switch (module) {
        AppModule.finance => 'AR · AP · Banking · GST',
        AppModule.hr => 'Employees · Attendance · Payroll',
        AppModule.inventory => 'Stock · GRN · Dispatch · Reports',
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      constraints: const BoxConstraints(minWidth: 240),
      padding: const EdgeInsets.fromLTRB(0, 8, 14, 8),
      decoration: BoxDecoration(
        // Active row gets a tiny accent stripe down the left edge.
        border: Border(left: BorderSide(
          color: isActive ? accent : Colors.transparent,
          width: 3,
        )),
      ),
      child: Row(
        children: [
          const SizedBox(width: 9),
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: isActive ? 0.18 : 0.10),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(module.icon, size: 17, color: accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  module.label,
                  style: RunqText.bodyStrong.copyWith(color: t.ink, height: 1.15),
                ),
                const SizedBox(height: 2),
                Text(
                  _subtitle,
                  style: RunqText.caption.copyWith(color: t.muted, height: 1.2),
                ),
              ],
            ),
          ),
          if (isActive) ...[
            const SizedBox(width: 8),
            Icon(Icons.check_rounded, size: 18, color: accent),
          ],
        ],
      ),
    );
  }
}
