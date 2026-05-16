import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/app_module_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_providers.dart';
import '../providers/theme_mode_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/app_info.dart';
import '../widgets/gradient_avatar.dart';
import '../widgets/runq_snack.dart';

/// Reach via avatar tap on the dashboard. Pushed at the root navigator so
/// the bottom-nav tab bar is hidden (matches invoice/bill detail pattern).
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final name = (user?.name ?? '').trim();
    final email = (user?.email ?? '').trim();
    final role = (user?.role ?? '').trim();
    final tenant = (user?.tenant ?? '').trim();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const _Header(),
            Expanded(
              child: ListView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(0, 0, 0, 24),
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _IdentityHero(
                      name: name, email: email, role: role,
                      stats: _liveStats(ref),
                    ),
                  ),
                  const SizedBox(height: 4),
                  _Group(
                    title: 'Workspace',
                    rows: [
                      _RowSpec(
                        icon: Icons.business_outlined,
                        iconBg: RunqColors.indigo.withValues(alpha: 0.10),
                        iconFg: RunqColors.indigo,
                        label: tenant.isEmpty ? 'Workspace' : tenant,
                        value: _maskedGstin(tenant),
                        // Informational — no detail screen yet, so no tap.
                        onTap: null,
                      ),
                    ],
                  ),
                  _Group(
                    title: 'Account',
                    rows: [
                      _RowSpec(
                        icon: Icons.person_outline_rounded,
                        label: 'Personal info',
                        value: 'View',
                        onTap: () => context.push('/profile/personal'),
                      ),
                      _RowSpec(
                        icon: Icons.notifications_none_rounded,
                        label: 'Notifications',
                        value: 'WhatsApp · Email',
                        onTap: () => context.push('/profile/notifications'),
                      ),
                    ],
                  ),
                  _Group(
                    title: 'Finance',
                    rows: [
                      _RowSpec(
                        icon: Icons.account_balance_outlined,
                        label: 'Connected banks',
                        value: ref.watch(bankAccountsProvider).maybeWhen(
                              data: (l) => '${l.length} linked',
                              orElse: () => '—',
                            ),
                        // `go` (not `push`) — /banking is a tab inside the
                        // ShellRoute and already mounted underneath. Pushing
                        // it would stack a second instance with the same
                        // pageKey and trip the duplicate-key assertion.
                        onTap: () => context.go('/banking'),
                      ),
                    ],
                  ),
                  _Group(
                    title: 'Modules',
                    rows: [
                      _RowSpec(
                        icon: Icons.groups_rounded,
                        iconBg: RunqColors.indigo.withValues(alpha: 0.10),
                        iconFg: RunqColors.indigo,
                        label: 'HR & Payroll',
                        value: 'Switch',
                        // Flip the global module switch, then jump to the HR
                        // home. Using `go` instead of `push` so the back
                        // stack resets to a clean HR-only history.
                        onTap: () async {
                          await ref.read(appModuleProvider.notifier)
                              .setModule(AppModule.hr);
                          if (context.mounted) context.go('/hr/home');
                        },
                      ),
                    ],
                  ),
                  _Group(
                    title: 'App',
                    rows: [
                      _RowSpec(
                        icon: Icons.dark_mode_outlined,
                        label: 'Appearance',
                        value: _themeModeLabel(ref.watch(themeModeProvider)),
                        onTap: () => context.push('/profile/appearance'),
                      ),
                      _RowSpec(
                        icon: Icons.support_agent_rounded,
                        label: 'Support',
                        onTap: () => context.push('/profile/support'),
                      ),
                      _RowSpec(
                        icon: Icons.info_outline_rounded,
                        label: 'About runQ',
                        onTap: () => context.push('/about'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _SignOutButton(onTap: () => _confirmSignOut(context, ref)),
                  ),
                  const SizedBox(height: 16),
                  const _Footer(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Three live signals for the hero strip — pulled from the same providers
  /// the dashboard already watches, so they're warm by the time the user
  /// taps into Profile. Each cell shows '—' until its source resolves; we
  /// don't show stale or guessed values.
  List<_StatCell> _liveStats(WidgetRef ref) {
    final approvals = ref.watch(pendingApprovalsProvider);
    final bills = ref.watch(billsSummaryProvider);
    final invoices = ref.watch(invoiceSummaryProvider);
    return [
      _StatCell(
        label: 'Approvals',
        value: approvals.maybeWhen(data: (l) => l.length.toString(), orElse: () => '—'),
      ),
      _StatCell(
        label: 'Bills pending',
        value: bills.maybeWhen(data: (s) => s.pendingApprovalCount.toString(), orElse: () => '—'),
      ),
      _StatCell(
        label: 'Receivables',
        value: invoices.maybeWhen(
          data: (s) => _compactInr(s.totalOutstanding),
          orElse: () => '—',
        ),
      ),
    ];
  }

  /// 124000 → "₹1.2L", 9568000 → "₹95.7L", 12500000 → "₹1.3Cr". Stays under
  /// 6 chars so the stats cell doesn't truncate.
  String _compactInr(double v) {
    if (v >= 10000000) return '₹${(v / 10000000).toStringAsFixed(1)}Cr';
    if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(0)}k';
    return '₹${v.toStringAsFixed(0)}';
  }

  /// Masks all but the last 8 chars of a GSTIN-like string. The spec calls
  /// this out specifically — full 15-char GSTIN wraps the workspace name to
  /// 3 lines on a 402px screen. Returns null when no recognisable GSTIN is
  /// available so the row collapses cleanly.
  String? _maskedGstin(String tenant) {
    final m = RegExp(r'\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][A-Z0-9])\b').firstMatch(tenant);
    if (m == null) return null;
    final g = m.group(1)!;
    return 'GSTIN ··· ${g.substring(g.length - 8)}';
  }

  String _themeModeLabel(ThemeMode m) => switch (m) {
        ThemeMode.light => 'Light',
        ThemeMode.dark => 'Dark',
        ThemeMode.system => 'System',
      };

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text("You'll need to sign in again to use the app."),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await ref.read(authProvider.notifier).logout();
    if (!context.mounted) return;
    showRunqSnack(context, 'Signed out', kind: SnackKind.success);
    context.go('/signin');
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: SizedBox(
        height: 36,
        child: Row(
          children: [
            SizedBox(
              width: 36, height: 36,
              child: IconButton(
                padding: EdgeInsets.zero,
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                onPressed: () => context.pop(),
                color: t.ink,
              ),
            ),
            Expanded(
              child: Center(
                child: Text(
                  'Profile',
                  style: RunqText.h2.copyWith(color: t.ink),
                ),
              ),
            ),
            SizedBox(
              width: 36, height: 36,
              child: IconButton(
                padding: EdgeInsets.zero,
                icon: const Icon(Icons.settings_outlined, size: 20),
                onPressed: () {
                  showRunqSnack(context, 'Coming soon', kind: SnackKind.info);
                },
                color: t.ink,
                tooltip: 'App settings',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IdentityHero extends StatelessWidget {
  final String name, email, role;
  final List<_StatCell> stats;
  const _IdentityHero({required this.name, required this.email, required this.role, required this.stats});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final displayName = name.isEmpty ? (email.isEmpty ? 'runQ user' : email.split('@').first) : name;
    final secondary = role.isEmpty ? '' : '${_titleCase(role)} · Owner';

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          colors: [t.bgWarm, t.bgWarmer],
          begin: const Alignment(-0.7, -1),
          end: const Alignment(0.7, 1),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Identity row
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 20, 18, 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                GradientAvatar(
                  name: displayName,
                  size: 64,
                  showOnlineDot: true,
                  onlineDotBorderColor: t.bgWarmer,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        style: RunqText.h3.copyWith(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.01 * 18,
                          color: t.ink,
                        ),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                      if (secondary.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          secondary,
                          style: RunqText.caption.copyWith(color: t.muted, fontSize: 12),
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _Pill(
                            label: 'OWNER',
                            bg: RunqColors.indigo.withValues(alpha: 0.10),
                            fg: RunqColors.indigo,
                            uppercase: true,
                          ),
                          if (email.isNotEmpty)
                            _EmailPill(email: email),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Container(height: 0.5, color: t.hairline),
          // Stats strip — surface@50% adapts: white-ish overlay in light
          // mode (matches the spec), subtle dark wash in dark mode so the
          // labels stay legible against the gradient.
          Container(
            color: t.surface.withValues(alpha: 0.5),
            child: _StatsStrip(stats: stats),
          ),
        ],
      ),
    );
  }

  String _titleCase(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1).toLowerCase();
  }
}

class _StatCell {
  final String value, label;
  const _StatCell({required this.value, required this.label});
}

class _StatsStrip extends StatelessWidget {
  final List<_StatCell> stats;
  const _StatsStrip({required this.stats});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return IntrinsicHeight(
      child: Row(
        children: [
          for (var i = 0; i < stats.length; i++) ...[
            Expanded(child: _Stat(value: stats[i].value, label: stats[i].label)),
            if (i < stats.length - 1)
              Container(width: 0.5, color: t.hairline),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String value, label;
  const _Stat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      child: Column(
        children: [
          Text(
            value,
            style: RunqText.tabular(size: 16, w: FontWeight.w700, color: t.ink),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: RunqText.caption.copyWith(fontSize: 11, color: t.muted),
            textAlign: TextAlign.center,
            maxLines: 1, overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color bg, fg;
  final bool uppercase;
  const _Pill({required this.label, required this.bg, required this.fg, this.uppercase = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(
        label,
        style: RunqText.caption.copyWith(
          color: fg,
          fontSize: uppercase ? 10 : 11,
          fontWeight: uppercase ? FontWeight.w700 : FontWeight.w500,
          letterSpacing: uppercase ? 0.04 * 10 : 0,
        ),
      ),
    );
  }
}

class _EmailPill extends StatelessWidget {
  final String email;
  const _EmailPill({required this.email});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 200),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: const Color(0x0D141210),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          email,
          style: const TextStyle(color: Color(0xFF605A52), fontSize: 11, fontWeight: FontWeight.w500),
          maxLines: 1, overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

// ─── Settings groups ─────────────────────────────────────────────────────

class _RowSpec {
  final IconData icon;
  final Color? iconBg, iconFg;
  final String label;
  final String? value;
  final VoidCallback? onTap;
  const _RowSpec({
    required this.icon,
    this.iconBg,
    this.iconFg,
    required this.label,
    this.value,
    this.onTap,
  });
}

class _Group extends StatelessWidget {
  final String title;
  final List<_RowSpec> rows;
  const _Group({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 0, 8),
            child: Text(
              title.toUpperCase(),
              style: TextStyle(
                color: t.muted2,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.06 * 11,
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: [
                BoxShadow(color: t.hairlineSoft, blurRadius: 3, offset: const Offset(0, 1)),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  _Row3(spec: rows[i]),
                  if (i < rows.length - 1)
                    Container(height: 0.5, color: t.hairline, margin: const EdgeInsets.only(left: 60)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row3 extends StatelessWidget {
  final _RowSpec spec;
  const _Row3({required this.spec});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // The default neutral icon-box: light cream in light mode; in dark mode
    // we need something noticeably lighter than `surface` (#1B1A18) — using
    // `inputFill` (#26241F) is only a few lightness points away and the
    // boxes vanish into the row. A 15%-alpha mix of the secondary ink
    // produces a clean elevated chip without forcing a brand tint.
    final iconBg = spec.iconBg ??
        (isDark ? t.ink2.withValues(alpha: 0.14) : const Color(0xFFF3F1EC));
    final iconFg = spec.iconFg ?? (isDark ? t.ink2 : const Color(0xFF605A52));

    return InkWell(
      onTap: spec.onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Row(
          children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(9),
              ),
              alignment: Alignment.center,
              child: Icon(spec.icon, color: iconFg, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                spec.label,
                style: RunqText.body.copyWith(
                  color: t.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
                maxLines: 1, overflow: TextOverflow.ellipsis,
              ),
            ),
            if (spec.value != null) ...[
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 130),
                child: Text(
                  spec.value!,
                  style: TextStyle(
                    color: t.muted,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                ),
              ),
              const SizedBox(width: 6),
            ],
            if (spec.onTap != null)
              Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
          ],
        ),
      ),
    );
  }
}

// ─── Sign out + footer ───────────────────────────────────────────────────

class _SignOutButton extends StatelessWidget {
  final VoidCallback onTap;
  const _SignOutButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x33B91C1C), width: 0.5),
          boxShadow: [
            BoxShadow(color: t.hairlineSoft, blurRadius: 3, offset: const Offset(0, 1)),
          ],
        ),
        alignment: Alignment.center,
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.logout_rounded, size: 17, color: Color(0xFFB91C1C)),
            SizedBox(width: 8),
            Text(
              'Sign out',
              style: TextStyle(
                color: Color(0xFFB91C1C),
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Center(
        child: Column(
          children: [
            Image.asset(
              Theme.of(context).brightness == Brightness.dark
                  ? 'assets/branding/runq-wordmark-light.png'
                  : 'assets/branding/runq-wordmark-dark.png',
              height: 22,
              fit: BoxFit.contain,
            ),
            const SizedBox(height: 6),
            Text(
              'Version $kAppVersionLabel',
              style: const TextStyle(fontSize: 11, color: Color(0xFF9C9489)),
            ),
          ],
        ),
      ),
    );
  }
}
