import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'profile_tab.dart';

/// [ProfileTab] as a pushed route, for the operator shells that reach it from
/// the Home avatar rather than a bottom-nav tab. The tab body is a bare list —
/// on its own it would arrive with no title and no way back.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key, this.subtitle});

  /// Context line under the name (the node an operator runs).
  final String? subtitle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(l.navProfile,
            style: DhenuText.title
                .copyWith(fontWeight: FontWeight.w800, color: t.ink)),
      ),
      body: SafeArea(top: false, child: ProfileTab(subtitle: subtitle)),
    );
  }
}
