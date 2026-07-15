import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/farmer_providers.dart';
import '../providers/locale_provider.dart';
import '../providers/mp_context_provider.dart';
import '../providers/transfer_providers.dart';
import '../providers/theme_mode_provider.dart';
import 'settings/about_screen.dart';
import 'settings/bank_payout_screen.dart';
import 'settings/help_support_screen.dart';
import 'settings/notifications_screen.dart';
import '../theme/dhenu_icons.dart';
import '../utils/format.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/dhenu_card.dart';
import '../widgets/farmer_profile_photo.dart';
import '../widgets/gradient_hero_card.dart';
import '../widgets/language_picker.dart';

/// Shared Profile tab — identity, settings, sign out. Persona-agnostic.
/// Reads the signed-in user from [authProvider]; shows what's available and
/// gracefully omits what isn't. Preserves language picker, theme toggle,
/// and logout wiring from the original implementation.
class ProfileTab extends ConsumerWidget {
  const ProfileTab({super.key, this.subtitle});

  /// Optional context line under the name (e.g. node name for an operator).
  final String? subtitle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final user = ref.watch(authProvider).user;
    final mode = ref.watch(themeModeProvider);

    // Farmer-specific identity (friendly code, join date, collection centre).
    final isFarmer = user?.role == 'farmer';
    final farmer = isFarmer ? ref.watch(farmerSelfProvider).asData?.value : null;

    // Operator identity: the node they run drives member-since (node set-up date)
    // and "Collection centre" resolves to that VMCC's parent CC.
    final isOperator = user?.role == 'field_operator';
    final opNode = isOperator ? ref.watch(primaryNodeProvider).value : null;
    final opCc = _operatorCc(ref, isOperator, opNode);
    // The real responsible-person name from the operator record — the auth user
    // name is the generic "Field Operator".
    String? opName;
    if (isOperator) {
      for (final o in ref.watch(operatorSelfProvider).asData?.value ?? const <MpOperatorSelf>[]) {
        if ((o.name ?? '').isNotEmpty) { opName = o.name; break; }
      }
    }

    final joinedAt = farmer?.createdAt ?? opNode?.createdAt;
    final memberSince = joinedAt != null ? memberSinceLabel(joinedAt) : '—';
    // Collection centre: farmer's primary node; a VMCC operator's parent CC; a
    // CC/PP operator's own centre.
    final centre = (farmer?.primaryNodeName?.isNotEmpty ?? false)
        ? farmer!.primaryNodeName!
        : ((opNode?.isVmcc ?? false) ? opCc?.name : opNode?.name) ?? '—';

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
        DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4,
      ),
      children: [
        _avatarHero(context, t, user, farmer, opName),
        const SizedBox(height: DhenuSpacing.lg),
        _statRow(context, t, l, memberSince, centre),
        const SizedBox(height: DhenuSpacing.lg),
        _settingsCard(context, ref, t, l, user),
        const SizedBox(height: DhenuSpacing.lg),
        _appearanceCard(context, ref, t, l, mode),
        const SizedBox(height: DhenuSpacing.lg),
        _logoutButton(context, ref, t, l),
        // Self-serve account deletion (Apple 5.1.1(v)) — only for the phone-OTP
        // personas the app provisions. Owners/accountants manage on the web.
        if (isFarmer || isOperator) _deleteAccountButton(context, ref, t, l),
      ],
    );
  }

  /// The CC an operator's node feeds into — its parent node, matched against the
  /// tenant CC list (operators may read CCs for dispatch). Null when not an
  /// operator, no parent, or the CC list is still loading.
  MpNode? _operatorCc(WidgetRef ref, bool isOperator, MpNode? opNode) {
    final parentId = opNode?.parentNodeId;
    if (!isOperator || parentId == null) return null;
    final ccs = ref.watch(nodesByTypeProvider('cc')).value ?? const <MpNode>[];
    for (final n in ccs) {
      if (n.id == parentId) return n;
    }
    return null;
  }

  // ── Avatar hero ────────────────────────────────────────────────────────────
  Widget _avatarHero(BuildContext context, DhenuTokens t, AuthUser? user, MpFarmer? farmer,
      String? displayName) {
    final name = (displayName != null && displayName.isNotEmpty) ? displayName : (user?.name ?? 'Dhenu User');
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    final captionParts = _captionParts(user, farmer?.code);

    return GradientHeroCard(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.xl, vertical: DhenuSpacing.xxl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Farmers get a tappable photo (add/change); other personas keep the
          // plain 64px initials circle over the hero gradient.
          if (farmer != null)
            FarmerProfilePhoto(farmer: farmer, initial: initial)
          else
            Container(
              width: 64,
              height: 64,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 2),
              ),
              child: Text(
                initial,
                style: DhenuText.h2.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ),
          const SizedBox(height: DhenuSpacing.md),
          Text(name, style: DhenuText.h2.copyWith(color: Colors.white)),
          if (subtitle != null) ...[
            const SizedBox(height: DhenuSpacing.xs),
            Text(subtitle!, style: DhenuText.body.copyWith(color: Colors.white.withValues(alpha: 0.8))),
          ],
          if (captionParts.isNotEmpty) ...[
            const SizedBox(height: DhenuSpacing.xs),
            Text(
              captionParts.join(' · '),
              style: DhenuText.caption.copyWith(color: Colors.white.withValues(alpha: 0.72)),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  List<String> _captionParts(AuthUser? user, String? farmerCode) {
    final parts = <String>[];
    // Friendly Farmer ID (code), never the raw user UUID.
    if (farmerCode != null && farmerCode.isNotEmpty) parts.add('ID $farmerCode');
    final phone = user?.phone;
    if (phone != null && phone.isNotEmpty) parts.add(phone);
    return parts;
  }

  // ── Stat row ───────────────────────────────────────────────────────────────
  Widget _statRow(BuildContext context, DhenuTokens t, AppLocalizations l, String memberSince, String centre) {
    return Row(
      children: [
        Expanded(
          child: DhenuCard(
            padding: const EdgeInsets.all(DhenuSpacing.lg),
            child: _statCell(t, label: l.profileMemberSince, value: memberSince),
          ),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
          child: DhenuCard(
            padding: const EdgeInsets.all(DhenuSpacing.lg),
            child: _statCell(t, label: l.profileCollectionCentre, value: centre),
          ),
        ),
      ],
    );
  }

  Widget _statCell(DhenuTokens t, {required String label, required String value}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.xs),
        Text(value, style: DhenuText.title.copyWith(color: t.ink)),
      ],
    );
  }

  // ── Settings card ──────────────────────────────────────────────────────────
  Widget _settingsCard(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l, AuthUser? user) {
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _settingsRow(
            context, t,
            icon: DhenuIcons.bank,
            label: l.profileBankPayout,
            onTap: () => _push(context, const BankPayoutScreen()),
          ),
          _divider(t),
          _settingsRow(
            context, t,
            icon: DhenuIcons.language,
            label: _currentLanguageLabel(ref),
            onTap: () => showLanguagePicker(context, ref),
          ),
          _divider(t),
          _settingsRow(
            context, t,
            icon: DhenuIcons.bell,
            label: l.profileNotifications,
            onTap: () => _push(context, const NotificationsScreen()),
          ),
          _divider(t),
          _settingsRow(
            context, t,
            icon: DhenuIcons.help,
            label: l.profileHelpSupport,
            onTap: () => _push(context, const HelpSupportScreen()),
          ),
          _divider(t),
          _settingsRow(
            context, t,
            icon: DhenuIcons.about,
            label: l.profileAbout,
            onTap: () => _push(context, const AboutScreen()),
            isLast: true,
          ),
        ],
      ),
    );
  }

  String _currentLanguageLabel(WidgetRef ref) {
    final lang = ref.watch(localeProvider.notifier).current;
    return 'Language · ${lang.nativeLabel}';
  }

  Widget _settingsRow(
    BuildContext context,
    DhenuTokens t, {
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool isLast = false,
  }) {
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: onTap,
        borderRadius: isLast
            ? const BorderRadius.vertical(bottom: Radius.circular(DhenuRadii.card))
            : BorderRadius.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md,
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: t.brandSubtle,
                  borderRadius: BorderRadius.circular(DhenuRadii.input),
                ),
                child: Icon(icon, size: 18, color: t.brand),
              ),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: Text(label, style: DhenuText.body.copyWith(color: t.ink))),
              Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
            ],
          ),
        ),
      ),
    );
  }

  Widget _divider(DhenuTokens t) => Padding(
        padding: const EdgeInsets.only(left: DhenuSpacing.lg + 36 + DhenuSpacing.md),
        child: Container(height: 1, color: t.hairline),
      );

  // ── Appearance card ────────────────────────────────────────────────────────
  Widget _appearanceCard(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l, ThemeMode mode) {
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.sm,
            ),
            child: Text(
              l.profileAppearance,
              style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.8),
            ),
          ),
          _themeTile(ref, t, mode, ThemeMode.system, l.profileThemeSystem, DhenuIcons.sunMoon),
          _divider(t),
          _themeTile(ref, t, mode, ThemeMode.light, l.profileThemeLight, DhenuIcons.sun),
          _divider(t),
          _themeTile(ref, t, mode, ThemeMode.dark, l.profileThemeDark, DhenuIcons.moon, isLast: true),
        ],
      ),
    );
  }

  Widget _themeTile(
    WidgetRef ref,
    DhenuTokens t,
    ThemeMode current,
    ThemeMode mode,
    String label,
    IconData icon, {
    bool isLast = false,
  }) {
    final selected = current == mode;
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: () => ref.read(themeModeProvider.notifier).set(mode),
        borderRadius: isLast
            ? const BorderRadius.vertical(bottom: Radius.circular(DhenuRadii.card))
            : BorderRadius.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md,
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? t.brandSubtle : t.hairline.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(DhenuRadii.input),
                ),
                child: Icon(icon, size: 18, color: selected ? t.brand : t.inkSoft),
              ),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(child: Text(label, style: DhenuText.body.copyWith(color: t.ink))),
              if (selected)
                Icon(DhenuIcons.check, size: 18, color: t.brand)
              else
                const SizedBox(width: 18),
            ],
          ),
        ),
      ),
    );
  }

  // ── Log out ────────────────────────────────────────────────────────────────
  Future<void> _confirmLogout(BuildContext context, WidgetRef ref, AppLocalizations l) async {
    // One accidental tap otherwise drops the session and forces a fresh OTP.
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.profileLogOutConfirmTitle),
        content: Text(l.profileLogOutConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.profileLogOut)),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider.notifier).logout();
  }

  Widget _logoutButton(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l) {
    return OutlinedButton.icon(
      onPressed: () => _confirmLogout(context, ref, l),
      icon: Icon(DhenuIcons.logout, size: 18, color: t.gradeC),
      label: Text(l.profileLogOut, style: DhenuText.button.copyWith(color: t.gradeC)),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
        side: BorderSide(color: t.gradeC.withValues(alpha: 0.36)),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(DhenuRadii.card),
        ),
        backgroundColor: t.gradeC.withValues(alpha: 0.06),
      ),
    );
  }

  // ── Delete account ───────────────────────────────────────────────────────
  Widget _deleteAccountButton(BuildContext context, WidgetRef ref, DhenuTokens t, AppLocalizations l) {
    return Padding(
      padding: const EdgeInsets.only(top: DhenuSpacing.md),
      child: TextButton(
        onPressed: () => _confirmDeleteAccount(context, ref, l),
        child: Text(
          l.profileDeleteAccount,
          style: DhenuText.label.copyWith(color: t.gradeC, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  /// Confirm, then permanently delete. On success [AuthController.deleteAccount]
  /// clears the session and the router redirects to login; on failure we surface
  /// the error and the user stays signed in.
  Future<void> _confirmDeleteAccount(BuildContext context, WidgetRef ref, AppLocalizations l) async {
    final t = DT(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.profileDeleteAccountTitle),
        content: Text(l.profileDeleteAccountBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              l.profileDeleteAccountConfirm,
              style: TextStyle(color: t.gradeC, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(authProvider.notifier).deleteAccount();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message.isEmpty ? l.profileDeleteAccountError : e.message)),
      );
    }
  }

  void _push(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }
}
