// Reusable module-switcher chip — shows the active module with a leading
// brand badge + label + chevron. Opens a tightly-anchored menu of the
// three modules with label + one-line subtitle and a leading accent
// stripe on the active row. The menu blurs the background to focus
// attention on the choice.

library;

import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/app_module_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

class ModuleSwitcher extends ConsumerStatefulWidget {
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
  ConsumerState<ModuleSwitcher> createState() => _ModuleSwitcherState();
}

class _ModuleSwitcherState extends ConsumerState<ModuleSwitcher>
    with SingleTickerProviderStateMixin {
  final _link = LayerLink();
  final _overlayCtrl = OverlayPortalController();
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 160),
    );
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  Future<void> _close() async {
    await _anim.reverse();
    if (mounted && _overlayCtrl.isShowing) _overlayCtrl.hide();
  }

  void _open() {
    _overlayCtrl.show();
    _anim.forward();
  }

  Color _accentFor(BuildContext context, AppModule m) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return switch (m) {
      AppModule.finance => isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
      AppModule.hr => isDark ? const Color(0xFF67E8F9) : const Color(0xFF0891B2),
      // Brand orange in both modes (matches the inventory bottom nav + hero).
      AppModule.inventory => const Color(0xFFD97706),
      AppModule.purchase => isDark ? const Color(0xFFC4B5FD) : const Color(0xFF7C3AED),
      AppModule.manufacturing => isDark ? const Color(0xFFFDA4AF) : const Color(0xFFE11D48),
    };
  }

  @override
  Widget build(BuildContext context) {
    final active = ref.watch(appModuleProvider);
    final allowed = ref.watch(allowedModulesProvider);
    final tone = widget.accent ?? _accentFor(context, active);
    final ink = widget.onDarkSurface ? Colors.white : tone;
    final bg = widget.onDarkSurface
        ? Colors.white.withValues(alpha: 0.12)
        : tone.withValues(alpha: 0.08);
    final border = widget.onDarkSurface
        ? Colors.white.withValues(alpha: 0.20)
        : tone.withValues(alpha: 0.20);
    final padding = widget.compact
        ? const EdgeInsets.fromLTRB(8, 6, 6, 6)
        : const EdgeInsets.fromLTRB(10, 8, 8, 8);

    return CompositedTransformTarget(
      link: _link,
      child: OverlayPortal(
        controller: _overlayCtrl,
        overlayChildBuilder: (_) => _SwitcherOverlay(
          link: _link,
          anim: _anim,
          active: active,
          modules: allowed,
          accentOf: (m) => _accentFor(context, m),
          onClose: _close,
          onPick: (m) async {
            await _close();
            if (m == active) return;
            await ref.read(appModuleProvider.notifier).setModule(m);
            if (context.mounted) context.go(m.homeRoute);
          },
        ),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _open,
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
                Container(
                  width: 22, height: 22,
                  decoration: BoxDecoration(
                    color: widget.onDarkSurface
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
        ),
      ),
    );
  }
}

class _SwitcherOverlay extends StatelessWidget {
  const _SwitcherOverlay({
    required this.link,
    required this.anim,
    required this.active,
    required this.modules,
    required this.accentOf,
    required this.onClose,
    required this.onPick,
  });

  final LayerLink link;
  final AnimationController anim;
  final AppModule active;
  final List<AppModule> modules;
  final Color Function(AppModule) accentOf;
  final VoidCallback onClose;
  final ValueChanged<AppModule> onPick;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return AnimatedBuilder(
      animation: anim,
      builder: (_, __) {
        final v = anim.value;
        return Stack(
          children: [
            // Tappable blurred backdrop.
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onClose,
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 6 * v, sigmaY: 6 * v),
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.18 * v),
                  ),
                ),
              ),
            ),
            // Menu anchored to the pill via the LayerLink.
            CompositedTransformFollower(
              link: link,
              showWhenUnlinked: false,
              // Sit 6px below the pill's bottom-left corner. Targets the
              // bottom edge of the pill via offset = pill height + gap.
              offset: const Offset(0, 38),
              child: Opacity(
                opacity: v,
                child: Transform.translate(
                  offset: Offset(0, (1 - v) * -6),
                  child: Material(
                    color: t.surface,
                    elevation: 16,
                    borderRadius: BorderRadius.circular(14),
                    clipBehavior: Clip.antiAlias,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minWidth: 260, maxWidth: 320),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (final m in modules)
                            _MenuRow(
                              module: m,
                              isActive: m == active,
                              accent: accentOf(m),
                              onTap: () => onPick(m),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({
    required this.module, required this.isActive, required this.accent,
    required this.onTap,
  });
  final AppModule module;
  final bool isActive;
  final Color accent;
  final VoidCallback onTap;

  String get _subtitle => switch (module) {
        AppModule.finance => 'AR · AP · Banking · GST',
        AppModule.hr => 'Employees · Attendance · Payroll',
        AppModule.inventory => 'Stock · GRN · Dispatch · Reports',
        AppModule.purchase => 'POs · Receive · 3-way Match · Direct',
        AppModule.manufacturing => 'BOMs · Work Orders · Costing',
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(0, 10, 14, 10),
        decoration: BoxDecoration(
          color: isActive ? accent.withValues(alpha: 0.04) : null,
          border: Border(left: BorderSide(
            color: isActive ? accent : Colors.transparent,
            width: 3,
          )),
        ),
        child: Row(
          children: [
            const SizedBox(width: 9),
            Container(
              width: 34, height: 34,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: isActive ? 0.18 : 0.10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(module.icon, size: 18, color: accent),
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
      ),
    );
  }
}
