import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/language_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_card.dart';

const _teal = Color(0xFF0891B2);

class _Lang {
  final String code, label, subtitle;
  const _Lang(this.code, this.label, this.subtitle);
}

const _languages = [
  _Lang('en', 'English', 'Default'),
  _Lang('hi', 'हिन्दी', 'Hindi'),
];

/// App language picker. Selection persists across launches — see
/// `language_provider.dart`. Defaults to English.
class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(languageProvider);
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
                        for (var i = 0; i < _languages.length; i++) ...[
                          if (i > 0) _Divider(),
                          _Option(
                            lang: _languages[i],
                            selected: current == _languages[i].code,
                            onTap: () => ref
                                .read(languageProvider.notifier)
                                .set(_languages[i].code),
                          ),
                        ],
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
  final _Lang lang;
  final bool selected;
  final VoidCallback onTap;
  const _Option({required this.lang, required this.selected, required this.onTap});

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
                color: selected ? _teal.withValues(alpha: 0.12) : t.hairlineSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              alignment: Alignment.center,
              child: Icon(Icons.translate_outlined, color: selected ? _teal : t.muted, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(lang.label, style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(lang.subtitle, style: RunqText.caption.copyWith(color: t.muted, fontSize: 12)),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle_rounded, color: _teal, size: 20),
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
          Expanded(child: Center(child: Text('Language', style: RunqText.h2.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}
