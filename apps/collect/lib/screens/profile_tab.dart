import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
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
        _avatarHero(context, t, user, farmer?.code, opName),
        const SizedBox(height: DhenuSpacing.lg),
        _statRow(context, t, memberSince, centre),
        const SizedBox(height: DhenuSpacing.lg),
        _settingsCard(context, ref, t, user),
        const SizedBox(height: DhenuSpacing.lg),
        _appearanceCard(context, ref, t, mode),
        const SizedBox(height: DhenuSpacing.lg),
        _logoutButton(context, ref, t),
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
  Widget _avatarHero(BuildContext context, DhenuTokens t, AuthUser? user, String? farmerCode,
      String? displayName) {
    final name = (displayName != null && displayName.isNotEmpty) ? displayName : (user?.name ?? 'Dhenu User');
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    final captionParts = _captionParts(user, farmerCode);

    return GradientHeroCard(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.xl, vertical: DhenuSpacing.xxl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 64px gradient avatar: white circle over the hero gradient
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
  Widget _statRow(BuildContext context, DhenuTokens t, String memberSince, String centre) {
    return Row(
      children: [
        Expanded(
          child: DhenuCard(
            padding: const EdgeInsets.all(DhenuSpacing.lg),
            child: _statCell(t, label: 'Member since', value: memberSince),
          ),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
          child: DhenuCard(
            padding: const EdgeInsets.all(DhenuSpacing.lg),
            child: _statCell(t, label: 'Collection centre', value: centre),
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
  Widget _settingsCard(BuildContext context, WidgetRef ref, DhenuTokens t, AuthUser? user) {
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _settingsRow(
            context, t,
            icon: DhenuIcons.bank,
            label: 'Bank & payout',
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
            label: 'Notifications',
            onTap: () => _push(context, const NotificationsScreen()),
          ),
          _divider(t),
          _settingsRow(
            context, t,
            icon: DhenuIcons.help,
            label: 'Help & support',
            onTap: () => _push(context, const HelpSupportScreen()),
          ),
          _divider(t),
          _settingsRow(
            context, t,
            icon: DhenuIcons.about,
            label: 'About',
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
  Widget _appearanceCard(BuildContext context, WidgetRef ref, DhenuTokens t, ThemeMode mode) {
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
              'APPEARANCE',
              style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.8),
            ),
          ),
          _themeTile(ref, t, mode, ThemeMode.system, 'System default', DhenuIcons.sunMoon),
          _divider(t),
          _themeTile(ref, t, mode, ThemeMode.light, 'Light', DhenuIcons.sun),
          _divider(t),
          _themeTile(ref, t, mode, ThemeMode.dark, 'Dark', DhenuIcons.moon, isLast: true),
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
  Widget _logoutButton(BuildContext context, WidgetRef ref, DhenuTokens t) {
    return OutlinedButton.icon(
      onPressed: () => ref.read(authProvider.notifier).logout(),
      icon: Icon(DhenuIcons.logout, size: 18, color: t.gradeC),
      label: Text('Log out', style: DhenuText.button.copyWith(color: t.gradeC)),
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

  void _push(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }
}
