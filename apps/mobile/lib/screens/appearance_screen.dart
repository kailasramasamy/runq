import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/theme_mode_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_card.dart';

/// Three-option theme picker (System / Light / Dark). Selection persists
/// across launches — see `theme_mode_provider.dart`.
class AppearanceScreen extends ConsumerWidget {
  const AppearanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(),
            Expanded(
              child: ListView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                children: [
                  RunqCard(
                    padding: const EdgeInsets.fromLTRB(0, 4, 0, 4),
                    child: Column(
                      children: [
                        _Option(
                          icon: Icons.brightness_auto_outlined,
                          label: 'System',
                          subtitle: 'Match device setting',
                          selected: mode == ThemeMode.system,
                          onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.system),
                        ),
                        _Divider(),
                        _Option(
                          icon: Icons.light_mode_outlined,
                          label: 'Light',
                          subtitle: 'Always light theme',
                          selected: mode == ThemeMode.light,
                          onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.light),
                        ),
                        _Divider(),
                        _Option(
                          icon: Icons.dark_mode_outlined,
                          label: 'Dark',
                          subtitle: 'Always dark theme',
                          selected: mode == ThemeMode.dark,
                          onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.dark),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      Container(height: 0.5, color: RT(context).hairline, margin: const EdgeInsets.symmetric(horizontal: 16));
}

class _Option extends StatelessWidget {
  final IconData icon;
  final String label, subtitle;
  final bool selected;
  final VoidCallback onTap;
  const _Option({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: selected ? RunqColors.indigo.withValues(alpha: 0.12) : t.hairlineSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              alignment: Alignment.center,
              child: Icon(icon, color: selected ? RunqColors.indigo : t.muted, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: RunqText.caption.copyWith(color: t.muted, fontSize: 12)),
                ],
              ),
            ),
            if (selected)
              Icon(Icons.check_circle_rounded, color: RT(context).brand, size: 20),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
            color: t.ink,
          ),
          Expanded(child: Center(child: Text('Appearance', style: RunqText.h2.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}
