import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/app_localizations.dart';
import '../providers/locale_provider.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'sheet_grabber.dart';

/// Bottom-sheet language picker — wired to the header [LanguageToggle].
/// Each row shows the language in its own script (low-literacy friendly).
Future<void> showLanguagePicker(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _LanguageSheet(),
  );
}

class _LanguageSheet extends ConsumerWidget {
  const _LanguageSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final current = ref.watch(localeProvider).languageCode;
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: DhenuSpacing.md),
              child: SheetGrabber(),
            ),
            Padding(
              padding: const EdgeInsets.all(DhenuSpacing.lg),
              child: Text(l.langPickerTitle, style: DhenuText.title.copyWith(color: t.ink)),
            ),
            // Scroll the list so 8 languages never overflow a short sheet.
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.only(bottom: DhenuSpacing.lg),
                children: [
                  for (final lang in dhenuLanguages)
                    lang.supported
                        ? ListTile(
                            onTap: () {
                              ref.read(localeProvider.notifier).set(lang.code);
                              Navigator.of(context).pop();
                            },
                            title: Text(lang.nativeLabel, style: DhenuText.body.copyWith(color: t.ink)),
                            subtitle: Text(lang.englishLabel, style: DhenuText.caption.copyWith(color: t.inkSoft)),
                            trailing: current == lang.code ? Icon(DhenuIcons.check, color: t.brand) : null,
                          )
                        : ListTile(
                            enabled: false,
                            title: Text(lang.nativeLabel,
                                style: DhenuText.body.copyWith(color: t.inkSoft.withValues(alpha: 0.5))),
                            subtitle: Text(lang.englishLabel,
                                style: DhenuText.caption.copyWith(color: t.inkSoft.withValues(alpha: 0.5))),
                            trailing: Text(l.langPickerComingSoon,
                                style: DhenuText.caption.copyWith(color: t.inkSoft.withValues(alpha: 0.7))),
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
