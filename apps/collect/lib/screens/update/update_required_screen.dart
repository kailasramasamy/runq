import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../providers/app_update_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/primary_action.dart';

// Store links live in the app (not config) — they never change for a listing
// and the app already knows its platform. Mirrors apps/mobile's
// app_version_service.dart. iOS is empty until the App Store listing exists.
const String _androidStoreUrl =
    'https://play.google.com/store/apps/details?id=com.quartex.dhenu';
const String _iosStoreUrl = '';

/// Full-screen, non-dismissable gate shown when the running build is below
/// the server's `dhenu.minVersion`. The only way forward is the store.
class UpdateRequiredScreen extends StatelessWidget {
  const UpdateRequiredScreen({super.key, required this.config});

  final AppUpdateConfig config;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: t.surface,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.xl),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 88,
                    height: 88,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: t.brand.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
                    ),
                    child: Icon(LucideIcons.circle_arrow_up, size: 44, color: t.brand),
                  ),
                ),
                const SizedBox(height: DhenuSpacing.xl),
                Text(
                  'Update required',
                  textAlign: TextAlign.center,
                  style: DhenuText.h1.copyWith(color: t.ink),
                ),
                const SizedBox(height: DhenuSpacing.md),
                Text(
                  config.forceUpdateMessage,
                  textAlign: TextAlign.center,
                  style: DhenuText.body.copyWith(color: t.inkSoft),
                ),
                const SizedBox(height: DhenuSpacing.x3),
                PrimaryAction(
                  label: 'Update now',
                  icon: LucideIcons.download,
                  onPressed: () => _openStore(context),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openStore(BuildContext context) async {
    final url = Platform.isIOS ? _iosStoreUrl : _androidStoreUrl;
    var ok = false;
    if (url.isNotEmpty) {
      ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
    if (!context.mounted) return;
    if (!ok) {
      showDhenuToast(context, 'Could not open the store', type: DhenuToastType.error);
    }
  }
}
