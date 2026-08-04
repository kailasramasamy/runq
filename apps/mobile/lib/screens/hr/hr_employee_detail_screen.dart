// Employee detail — fresh redesign.
//
// Layout:
//   ┌─ Collapsing teal-gradient hero (avatar + name + role + chips) ─────┐
//   ├─ Pinned tab strip (Info | Leave | Pay) ────────────────────────────┤
//   └─ Tab body — grouped, card-based content per tab ───────────────────┘
//
// The hero uses HrColors.profileGradient (deep cyan → teal). Tab strip
// pins under the hero. Each tab body is a stack of grouped cards.

library;

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/app_role_provider.dart';
import '../../providers/hr_providers.dart';
import '../../services/hr_document_intake.dart';
import 'hr_assign_salary_sheet.dart';
import 'hr_profile_checklist.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_resume_tab.dart';
import 'widgets/hr_widgets.dart';

class HrEmployeeDetailScreen extends ConsumerStatefulWidget {
  final String id;
  const HrEmployeeDetailScreen({super.key, required this.id});

  @override
  ConsumerState<HrEmployeeDetailScreen> createState() => _HrEmployeeDetailScreenState();
}

class _HrEmployeeDetailScreenState extends ConsumerState<HrEmployeeDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 5, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final empAsync = ref.watch(hrEmployeeProvider(widget.id));
    // Editing an employee's record — the … actions menu and resume
    // upload/edit — is HR-admin only. Managers and employees view it
    // read-only; an employee can't edit their own HR details.
    final role = ref.watch(appRoleProvider);
    final canManage = role.canManageHrSetup;
    // Self-view — the employee opened their own profile (the More → profile
    // card routes here with their own employee id). They can't edit HR
    // fields, but they may upload their own resume via the /me endpoints.
    final me = ref.watch(hrMeProvider).asData?.value;
    final isSelfView = me?.employee?.id == widget.id;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: empAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (emp) {
          // Hero height = status bar inset + content. Bumped to accommodate
          // the chip-strip breathing room before the tab bar.
          final heroHeight = MediaQuery.of(context).padding.top + 278;
          return NestedScrollView(
            headerSliverBuilder: (ctx, _) => [
              SliverAppBar(
                expandedHeight: heroHeight,
                pinned: true,
                stretch: true,
                elevation: 0,
                scrolledUnderElevation: 0,
                backgroundColor: HrColors.tealDeep,
                systemOverlayStyle: RunqSystemBars.lightIcons,
                // Drop the default leading/actions so the hero owns the full
                // top row — keeps the layout clean and predictable instead
                // of fighting the FlexibleSpaceBar.
                automaticallyImplyLeading: false,
                flexibleSpace: FlexibleSpaceBar(
                  background: _Hero(emp: emp, canManage: canManage),
                  collapseMode: CollapseMode.pin,
                ),
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(58),
                  child: Container(
                    color: t.bgWarm,
                    child: TabBar(
                      controller: _tabs,
                      isScrollable: false,
                      indicatorColor: HrColors.teal,
                      indicatorWeight: 2.5,
                      indicatorSize: TabBarIndicatorSize.label,
                      labelColor: HrColors.teal,
                      unselectedLabelColor: t.muted,
                      labelStyle: RunqText.caption.copyWith(fontWeight: FontWeight.w700),
                      unselectedLabelStyle: RunqText.caption,
                      labelPadding: const EdgeInsets.symmetric(horizontal: 4),
                      tabs: const [
                        Tab(height: 54, icon: Icon(Icons.badge_outlined, size: 20), text: 'Info'),
                        Tab(height: 54, icon: Icon(Icons.event_outlined, size: 20), text: 'Leave'),
                        Tab(height: 54, icon: Icon(Icons.payments_outlined, size: 20), text: 'Pay'),
                        Tab(height: 54, icon: Icon(Icons.folder_open_outlined, size: 20), text: 'Docs'),
                        Tab(height: 54, icon: Icon(Icons.description_outlined, size: 20), text: 'Resume'),
                      ],
                    ),
                  ),
                ),
              ),
            ],
            body: TabBarView(
              controller: _tabs,
              children: [
                _InfoTab(emp: emp, canManage: canManage),
                _LeaveTab(employeeId: emp.id),
                _PayTab(emp: emp),
                _DocsTab(employeeId: emp.id, employeeName: emp.displayName),
                HrResumeTab(
                  employeeId: emp.id,
                  canManage: canManage,
                  // HR managing a record always uses the per-employee
                  // endpoints (consistent with Edit); a plain employee
                  // self-uploads through the /me path.
                  selfService: isSelfView && !canManage,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ─── Hero (collapsing header) ─────────────────────────────────────────────

class _Hero extends StatelessWidget {
  final HrEmployee emp;
  /// Whether the viewer (HR / admin) may open the … actions menu.
  final bool canManage;
  const _Hero({required this.emp, required this.canManage});

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(gradient: HrColors.profileGradient),
      padding: EdgeInsets.fromLTRB(8, topPad + 4, 8, 18),
      child: Column(
        mainAxisSize: MainAxisSize.max,
        children: [
          // Action row (back + overflow). Sitting inside the hero so the
          // FlexibleSpaceBar doesn't fight the SliverAppBar's default
          // leading/actions for positioning.
          Row(
            children: [
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
              ),
              const Spacer(),
              if (canManage)
                IconButton(
                  onPressed: () => _showActionsSheet(context, emp),
                  icon: const Icon(Icons.more_horiz_rounded, color: Colors.white),
                ),
            ],
          ),
          const SizedBox(height: 4),
          // Avatar — centered, with a translucent white ring so the photo
          // pops against the gradient even when it's a similar hue.
          _HeroAvatar(
            name: emp.displayName,
            photoUrl: emp.photoUrl,
            employeeId: emp.id,
          ),
          const SizedBox(height: 12),
          Text(
            emp.displayName,
            textAlign: TextAlign.center,
            style: RunqText.h2.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
            maxLines: 1, overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (emp.designationName != null) emp.designationName!,
              if (emp.departmentName != null) emp.departmentName!,
            ].join(' · '),
            textAlign: TextAlign.center,
            style: RunqText.body.copyWith(
              color: Colors.white.withValues(alpha: 0.78),
            ),
            maxLines: 1, overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              _HeroChip(label: _statusLabel(emp.status), dotColor: _statusDot(emp.status)),
              _HeroChip(label: _empType(emp.employmentType)),
              _HeroChip(label: emp.employeeCode),
            ],
          ),
          // Breathing room between chips and the pinned tab strip below,
          // so the hero doesn't feel compressed against the tabs.
          const SizedBox(height: 18),
        ],
      ),
    );
  }

  static String _statusLabel(String s) => switch (s) {
        'active' => 'Active',
        'on_leave' => 'On leave',
        'inactive' => 'Inactive',
        'terminated' => 'Left',
        _ => s,
      };
  static String _empType(String s) => switch (s) {
        'permanent' => 'Permanent',
        'contract' => 'Contract',
        'intern' => 'Intern',
        'consultant' => 'Consultant',
        'wage' => 'Wage worker',
        _ => s,
      };
  static Color _statusDot(String s) => switch (s) {
        'active' => const Color(0xFF34D399),
        'on_leave' => const Color(0xFFFBBF24),
        'inactive' || 'terminated' => const Color(0xFFF87171),
        _ => Colors.white70,
      };
}

class _HeroAvatar extends StatelessWidget {
  final String name;
  final String? photoUrl;
  final String? employeeId;
  const _HeroAvatar({required this.name, this.photoUrl, this.employeeId});

  @override
  Widget build(BuildContext context) {
    final hasPhoto = (photoUrl ?? '').isNotEmpty;
    final avatar = DecoratedBox(
      decoration: BoxDecoration(
        // Soft drop shadow grounds the tile against the gradient — replaces
        // the bordered "ring" which felt heavy around a photo.
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.22),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: HrAvatar(
        name: name,
        photoUrl: photoUrl,
        employeeId: employeeId,
        size: 108,
      ),
    );
    if (!hasPhoto) return avatar;
    // Tap to view full-size — only meaningful when there's an actual photo
    // behind the initials fallback. The viewer reuses the same photo URL as
    // this on-screen avatar, so its decoded image is already in the cache —
    // we open immediately (no await) and let the Hero fly with the cached
    // bytes. HrAvatar's initials fallback + fade-in covers the rare case
    // where the avatar hasn't finished downloading yet.
    return GestureDetector(
      onTap: () {
        Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
          opaque: false,
          barrierColor: Colors.black.withValues(alpha: 0.92),
          pageBuilder: (_, __, ___) => _PhotoViewer(
            name: name,
            photoUrl: photoUrl,
            employeeId: employeeId,
          ),
          transitionsBuilder: (_, anim, __, child) => FadeTransition(opacity: anim, child: child),
          transitionDuration: const Duration(milliseconds: 200),
        ));
      },
      child: Hero(tag: 'emp-photo-$employeeId', child: avatar),
    );
  }
}

/// Full-screen photo viewer. Dismisses on tap or swipe-down. Reuses
/// HrAvatar so auth headers and fallback logic stay in one place.
class _PhotoViewer extends StatelessWidget {
  final String name;
  final String? photoUrl;
  final String? employeeId;
  const _PhotoViewer({required this.name, this.photoUrl, this.employeeId});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size.shortestSide - 32;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: GestureDetector(
        onTap: () => Navigator.of(context).maybePop(),
        onVerticalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0).abs() > 200) Navigator.of(context).maybePop();
        },
        child: SafeArea(
          child: Stack(
            children: [
              Center(
                child: Hero(
                  tag: 'emp-photo-$employeeId',
                  // During the flight, paint ONLY the cached photo — not the
                  // full HrAvatar, whose initials-fallback layer would flash
                  // through for the frame or two before the destination
                  // image stream resolves in the overlay.
                  flightShuttleBuilder: (_, __, dir, fromCtx, toCtx) {
                    final provider = HrAvatar(
                      name: name,
                      photoUrl: photoUrl,
                      employeeId: employeeId,
                      size: 1,
                    ).imageProvider;
                    if (provider == null) {
                      return (dir == HeroFlightDirection.push ? toCtx : fromCtx).widget;
                    }
                    return ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image(image: provider, fit: BoxFit.cover, gaplessPlayback: true),
                    );
                  },
                  child: HrAvatar(
                    name: name,
                    photoUrl: photoUrl,
                    employeeId: employeeId,
                    size: size,
                  ),
                ),
              ),
              Positioned(
                top: 8, right: 8,
                child: IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
                ),
              ),
              Positioned(
                left: 0, right: 0, bottom: 24,
                child: Center(
                  child: Text(
                    name,
                    style: RunqText.bodyStrong.copyWith(color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  final String label;
  final Color? dotColor;
  const _HeroChip({required this.label, this.dotColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dotColor != null) ...[
            Container(
              width: 6, height: 6,
              decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: RunqText.label.copyWith(color: Colors.white),
          ),
        ],
      ),
    );
  }
}

// ─── Quick contact action rail ────────────────────────────────────────────

class _ContactRail extends StatelessWidget {
  final HrEmployee emp;
  const _ContactRail({required this.emp});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _ActionTile(
            icon: Icons.phone_outlined,
            label: 'Call',
            enabled: emp.phone != null,
            onTap: emp.phone == null ? null : () => _launch(context, 'tel:${emp.phone}'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionTile(
            icon: Icons.mail_outline_rounded,
            label: 'Email',
            enabled: emp.email != null,
            onTap: emp.email == null ? null : () => _launch(context, 'mailto:${emp.email}'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionTile(
            icon: Icons.chat_bubble_outline_rounded,
            label: 'Message',
            enabled: emp.phone != null,
            onTap: emp.phone == null ? null : () => _launch(context, 'sms:${emp.phone}'),
          ),
        ),
      ],
    );
  }

  Future<void> _launch(BuildContext context, String uri) async {
    final u = Uri.parse(uri);
    if (await canLaunchUrl(u)) {
      await launchUrl(u);
    } else if (context.mounted) {
      showRunqSnack(context, 'Could not open $uri', kind: SnackKind.error);
    }
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback? onTap;
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = enabled ? HrColors.brand(context) : t.muted2;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: ink, size: 20),
            const SizedBox(height: 6),
            Text(label,
                style: RunqText.label.copyWith(color: ink)),
          ],
        ),
      ),
    );
  }
}

// ─── Info tab ─────────────────────────────────────────────────────────────

// ─── Profile setup guidance ───────────────────────────────────────────────

/// Top-of-Info card that scores the profile and guides HR to the missing
/// pieces. Each incomplete item links straight to the action that fixes it.
class _ProfileSetupCard extends StatelessWidget {
  final HrEmployee emp;
  final bool canManage;
  const _ProfileSetupCard({required this.emp, required this.canManage});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final c = employeeCompleteness(emp);
    final crit = c.criticalMissing;
    final accent = c.isComplete
        ? const Color(0xFF16A34A)
        : (crit > 0 ? const Color(0xFFDC2626) : const Color(0xFFD97706));

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(
          color: c.isComplete ? t.hairline : accent.withValues(alpha: 0.45),
          width: c.isComplete ? 0.5 : 1,
        ),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(c.isComplete ? Icons.check_circle_rounded : Icons.assignment_outlined,
                  color: accent, size: 18),
              const SizedBox(width: 8),
              Text('Profile setup',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const Spacer(),
              Text('${c.percent}%',
                  style: RunqText.tabular(size: 15, w: FontWeight.w800, color: accent)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: c.fraction,
              minHeight: 6,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation<Color>(accent),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            c.isComplete
                ? 'All set — every key detail is filled in.'
                : '${c.missing.length} to add${crit > 0 ? ' · $crit critical for payroll' : ''}',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          if (!c.isComplete) ...[
            const SizedBox(height: 8),
            Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
            for (final m in c.missing)
              _MissingRow(
                check: m,
                onTap: canManage ? () => _runProfileFix(context, m, emp) : null,
              ),
          ],
        ],
      ),
    );
  }
}

class _MissingRow extends StatelessWidget {
  final ProfileCheck check;
  final VoidCallback? onTap;
  const _MissingRow({required this.check, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          children: [
            Icon(check.icon, size: 18, color: t.muted),
            const SizedBox(width: 10),
            Expanded(
              child: Text(check.label, style: RunqText.body.copyWith(color: t.ink)),
            ),
            if (check.critical) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFDC2626).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('Critical',
                    style: RunqText.label.copyWith(color: const Color(0xFFDC2626))),
              ),
              const SizedBox(width: 8),
            ],
            if (onTap != null)
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

/// Routes a missing-item tap to the action that fixes it. Each action already
/// invalidates hrEmployeeProvider, so the card re-scores on return.
void _runProfileFix(BuildContext context, ProfileCheck check, HrEmployee emp) {
  switch (check.fix) {
    case ProfileFix.edit:
      // Jump straight to the wizard step that holds the tapped field.
      context.push('/hr/employees/edit?step=${check.editStep}', extra: emp);
    case ProfileFix.photo:
      _pickAndUploadPhoto(context, emp);
    case ProfileFix.manager:
      _setReportingManager(context, emp);
    case ProfileFix.salary:
      showAssignSalarySheet(context, emp);
  }
}

class _InfoTab extends StatelessWidget {
  final HrEmployee emp;
  final bool canManage;
  const _InfoTab({required this.emp, required this.canManage});

  @override
  Widget build(BuildContext context) {
    // Sections mirror the web HR employee page (Personal / Statutory /
    // Payroll settings / Bank / Contract labour). Dept/designation/code
    // already live in the hero so they don't repeat here.
    final personal = <_InfoRow>[
      if (emp.email != null) _InfoRow(icon: Icons.mail_outline_rounded, label: 'Email', value: emp.email!),
      if (emp.phone != null) _InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: emp.phone!),
      if (emp.dateOfBirth != null)
        _InfoRow(icon: Icons.cake_outlined, label: 'Date of birth', value: _date(emp.dateOfBirth!)),
      if (emp.gender != null) _InfoRow(icon: Icons.person_outline_rounded, label: 'Gender', value: _cap(emp.gender!)),
      if (emp.bloodGroup != null)
        _InfoRow(icon: Icons.bloodtype_outlined, label: 'Blood group', value: emp.bloodGroup!),
      if (emp.address != null)
        _InfoRow(icon: Icons.location_on_outlined, label: 'Address', value: emp.address!),
    ];
    final statutory = <_InfoRow>[
      if (emp.pan != null) _InfoRow(icon: Icons.fingerprint_rounded, label: 'PAN', value: emp.pan!),
      if (emp.aadhaarMasked != null)
        _InfoRow(icon: Icons.credit_card_outlined, label: 'Aadhaar', value: emp.aadhaarMasked!),
      if (emp.uan != null) _InfoRow(icon: Icons.account_balance_outlined, label: 'UAN (PF)', value: emp.uan!),
      if (emp.pfNumber != null)
        _InfoRow(icon: Icons.savings_outlined, label: 'PF number', value: emp.pfNumber!),
      if (emp.esiNumber != null)
        _InfoRow(icon: Icons.medical_services_outlined, label: 'ESI number', value: emp.esiNumber!),
    ];
    final payroll = <_InfoRow>[
      if (emp.ctcAnnual != null) ...[
        _InfoRow(icon: Icons.calendar_month_outlined, label: 'Monthly salary', value: '${hrFormatINR(emp.ctcAnnual! / 12)} / month'),
        _InfoRow(icon: Icons.payments_outlined, label: 'Annual CTC', value: hrFormatINR(emp.ctcAnnual!)),
      ],
      _InfoRow(icon: Icons.category_outlined, label: 'Employment type', value: _emp(emp.employmentType)),
      _InfoRow(icon: Icons.toggle_on_outlined, label: 'Status', value: _statusLabel(emp.status)),
      if (emp.joiningDate != null)
        _InfoRow(icon: Icons.event_outlined, label: 'Joined', value: _date(emp.joiningDate!)),
      if (emp.confirmationDate != null)
        _InfoRow(icon: Icons.verified_outlined, label: 'Confirmed', value: _date(emp.confirmationDate!)),
      if (emp.exitDate != null)
        _InfoRow(icon: Icons.logout_rounded, label: 'Exited', value: _date(emp.exitDate!)),
    ];
    final bank = <_InfoRow>[
      if (emp.bankName != null)
        _InfoRow(icon: Icons.account_balance_rounded, label: 'Bank', value: emp.bankName!),
      if (emp.bankAccountMasked != null)
        _InfoRow(icon: Icons.account_balance_wallet_outlined, label: 'Account no.', value: emp.bankAccountMasked!),
      if (emp.bankIfsc != null) _InfoRow(icon: Icons.code_rounded, label: 'IFSC', value: emp.bankIfsc!),
    ];
    final contract = <_InfoRow>[
      if (emp.agency != null) _InfoRow(icon: Icons.business_outlined, label: 'Agency', value: emp.agency!),
      if (emp.dailyWageRate != null)
        _InfoRow(icon: Icons.engineering_outlined, label: 'Daily wage rate', value: hrFormatINR(emp.dailyWageRate!)),
    ];
    // Always shown — surfaces the reporting line and signals it's unset.
    // Change it via the … menu → Set reporting manager.
    final reporting = <_InfoRow>[
      _InfoRow(
        icon: Icons.account_tree_outlined,
        label: 'Reports to',
        value: emp.reportingToName ?? 'Not set',
      ),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        _ProfileSetupCard(emp: emp, canManage: canManage),
        const SizedBox(height: 14),
        _ContactRail(emp: emp),
        const SizedBox(height: 14),
        _Section(title: 'Reporting', rows: reporting),
        const SizedBox(height: 12),
        if (personal.isNotEmpty) ...[
          _Section(title: 'Personal', rows: personal),
          const SizedBox(height: 12),
        ],
        if (statutory.isNotEmpty) ...[
          _Section(title: 'Statutory', rows: statutory),
          const SizedBox(height: 12),
        ],
        if (payroll.isNotEmpty) ...[
          _Section(title: 'Payroll settings', rows: payroll),
          const SizedBox(height: 12),
        ],
        if (bank.isNotEmpty) ...[
          _Section(title: 'Bank details', rows: bank),
          const SizedBox(height: 12),
        ],
        if (contract.isNotEmpty)
          _Section(title: 'Contract labour', rows: contract),
      ],
    );
  }

  static String _statusLabel(String s) => switch (s) {
        'active' => 'Active',
        'on_leave' => 'On leave',
        'inactive' => 'Inactive',
        'terminated' => 'Terminated',
        _ => _cap(s),
      };

  static String _emp(String s) => switch (s) {
        'permanent' => 'Permanent',
        'contract'  => 'Contract',
        'intern'    => 'Intern',
        'consultant'=> 'Consultant',
        'wage'      => 'Wage worker',
        _           => _cap(s),
      };
  static String _cap(String s) =>
      s.isEmpty ? s : s.substring(0, 1).toUpperCase() + s.substring(1);
  static String _date(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

// ─── Section + Row (reused by Info tab) ───────────────────────────────────

class _Section extends StatelessWidget {
  final String title;
  final List<_InfoRow> rows;
  const _Section({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(
            title.toUpperCase(),
            style: RunqText.label.copyWith(color: t.muted2),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                rows[i],
                if (i < rows.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 46),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label, value;
  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 15, color: HrColors.brand(context)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: RunqText.bodyStrong.copyWith(color: t.ink),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Leave tab ────────────────────────────────────────────────────────────

class _LeaveTab extends ConsumerWidget {
  final String employeeId;
  const _LeaveTab({required this.employeeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final year = DateTime.now().year;
    final balancesAsync =
        ref.watch(hrEmployeeLeaveBalancesProvider((employeeId: employeeId, year: year)));
    final requestsAsync = ref.watch(hrEmployeeLeaveRequestsProvider(employeeId));

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        balancesAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
          ),
          error: (e, _) => Text('$e', style: RunqText.body.copyWith(color: t.muted)),
          data: (rows) {
            if (rows.isEmpty) {
              return const _EmptyState(
                icon: Icons.event_note_outlined,
                title: 'No leave balances yet',
                subtitle: 'Configure leave types and accrue balances from the web app.',
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
                  child: Text('Balances $year',
                      style: RunqText.label.copyWith(color: t.muted2)),
                ),
                ...rows.map((b) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _BalanceCard(b: b),
                )),
              ],
            );
          },
        ),
        // Recent leave history for this employee — quiet when none/loading
        // so the tab never shows a spinner just for the secondary section.
        requestsAsync.maybeWhen(
          data: (reqs) {
            if (reqs.isEmpty) return const SizedBox.shrink();
            final recent = [...reqs]
              ..sort((a, b) => b.fromDate.compareTo(a.fromDate));
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 18),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
                  child: Text('Recent requests',
                      style: RunqText.label.copyWith(color: t.muted2)),
                ),
                ...recent.take(8).map((r) => _LeaveRequestRow(r: r)),
              ],
            );
          },
          orElse: () => const SizedBox.shrink(),
        ),
      ],
    );
  }
}

class _LeaveRequestRow extends StatelessWidget {
  final HrLeaveRequest r;
  const _LeaveRequestRow({required this.r});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(r.typeCode,
                style: RunqText.label.copyWith(color: HrColors.brand(context))),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_leaveRange(r.fromDate, r.toDate),
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text(
                  '${_leaveDays(r.totalDays)}${r.halfDay ? ' · half day' : ''}',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          HrStatusBadge(status: r.status),
        ],
      ),
    );
  }
}

const _kLeaveMon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

String _leaveDayMon(DateTime d) => '${d.day} ${_kLeaveMon[d.month - 1]}';

String _leaveRange(DateTime a, DateTime b) {
  final sameDay = a.year == b.year && a.month == b.month && a.day == b.day;
  if (sameDay) return '${a.day} ${_kLeaveMon[a.month - 1]} ${a.year}';
  return '${_leaveDayMon(a)} – ${_leaveDayMon(b)} ${b.year}';
}

String _leaveDays(double v) {
  final s = v.toStringAsFixed(v % 1 == 0 ? 0 : 1);
  return '$s ${v == 1 ? 'day' : 'days'}';
}

class _BalanceCard extends StatelessWidget {
  final HrLeaveBalance b;
  const _BalanceCard({required this.b});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final available = b.opening + b.accrued;
    final usedPct = available <= 0 ? 0.0 : (b.used / available).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: HrColors.tealSubtle,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(b.typeCode,
                    style: RunqText.label.copyWith(color: HrColors.brand(context))),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(b.typeName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ),
              Text(
                b.balance.toStringAsFixed(b.balance % 1 == 0 ? 0 : 1),
                style: RunqText.tabular(size: 20, w: FontWeight.w800, color: t.ink),
              ),
              const SizedBox(width: 4),
              Text('days',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: usedPct,
              minHeight: 6,
              backgroundColor: t.hairline,
              valueColor: AlwaysStoppedAnimation<Color>(HrColors.brand(context)),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _meta(context, 'Opening', b.opening),
              _meta(context, 'Accrued', b.accrued),
              _meta(context, 'Used', b.used),
            ],
          ),
        ],
      ),
    );
  }

  Widget _meta(BuildContext context, String label, double v) {
    final t = RT(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.muted2)),
          const SizedBox(height: 2),
          Text(v.toStringAsFixed(v % 1 == 0 ? 0 : 1),
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
        ],
      ),
    );
  }
}

// ─── Pay tab ──────────────────────────────────────────────────────────────

class _PayTab extends ConsumerWidget {
  final HrEmployee emp;
  const _PayTab({required this.emp});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final slipsAsync = ref.watch(hrEmployeePayslipsProvider(emp.id));
    final hasBank = emp.bankName != null ||
        emp.bankAccountMasked != null ||
        emp.bankIfsc != null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        if (emp.ctcAnnual != null)
          _CtcCard(annual: emp.ctcAnnual!)
        else if (emp.dailyWageRate != null)
          _WageCard(daily: emp.dailyWageRate!)
        else
          const _EmptyState(
            icon: Icons.payments_outlined,
            title: 'No compensation set',
            subtitle: 'Set CTC or daily wage rate from the web app to surface pay details here.',
          ),
        if (hasBank) ...[
          const SizedBox(height: 14),
          _Section(
            title: 'Payout account',
            rows: [
              if (emp.bankName != null)
                _InfoRow(icon: Icons.account_balance_rounded, label: 'Bank', value: emp.bankName!),
              if (emp.bankAccountMasked != null)
                _InfoRow(icon: Icons.account_balance_wallet_outlined, label: 'Account', value: emp.bankAccountMasked!),
              if (emp.bankIfsc != null)
                _InfoRow(icon: Icons.code_rounded, label: 'IFSC', value: emp.bankIfsc!),
            ],
          ),
        ],
        const SizedBox(height: 18),
        slipsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 28),
            child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
          ),
          error: (e, _) => Text('$e', style: RunqText.body.copyWith(color: t.muted)),
          data: (slips) {
            if (slips.isEmpty) {
              return Padding(
                padding: const EdgeInsets.all(8),
                child: Text(
                  'Payslips appear here after each payroll run is approved.',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                  child: Text('Payslips',
                      style: RunqText.label.copyWith(color: t.muted2)),
                ),
                ...slips.map((ps) => _EmpPayslipRow(ps: ps)),
              ],
            );
          },
        ),
      ],
    );
  }
}

// Mirrors the self-service Pay screen's payslip row so the admin and
// employee views read identically. Taps through to the shared payslip
// breakdown route.
class _EmpPayslipRow extends StatelessWidget {
  final HrPayslip ps;
  const _EmpPayslipRow({required this.ps});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: InkWell(
        onTap: () => context.push('/hr/payslips/${ps.payrollRunId}/${ps.id}'),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ps.periodLabel,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 2),
                    Text('Gross ${hrFormatINR(ps.gross)}',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(hrFormatINR(ps.netPay < 0 ? 0 : ps.netPay),
                      style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
                  if (ps.netPay < 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('${hrFormatINR(-ps.netPay)} owed',
                          style: RunqText.caption.copyWith(
                              color: const Color(0xFFDC2626),
                              fontWeight: FontWeight.w600)),
                    ),
                ],
              ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _CtcCard extends StatelessWidget {
  final double annual;
  const _CtcCard({required this.annual});

  @override
  Widget build(BuildContext context) {
    final monthly = annual / 12;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: HrColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.payments_rounded, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text('Annual CTC',
                  style: RunqText.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w600, letterSpacing: 0.3,
                  )),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            hrFormatINR(annual),
            style: RunqText.tabular(size: 30, w: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text('${hrFormatINR(monthly)} / month',
              style: RunqText.body.copyWith(
                color: Colors.white.withValues(alpha: 0.85),
              )),
        ],
      ),
    );
  }
}

class _WageCard extends StatelessWidget {
  final double daily;
  const _WageCard({required this.daily});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: HrColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.engineering_outlined, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text('Daily wage',
                  style: RunqText.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w600, letterSpacing: 0.3,
                  )),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            hrFormatINR(daily),
            style: RunqText.tabular(size: 30, w: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text('per day worked',
              style: RunqText.body.copyWith(color: Colors.white.withValues(alpha: 0.85))),
        ],
      ),
    );
  }
}

// ─── Documents tab ────────────────────────────────────────────────────────

class _DocsTab extends ConsumerWidget {
  final String employeeId;
  final String employeeName;
  const _DocsTab({required this.employeeId, required this.employeeName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final docsAsync = ref.watch(hrEmployeeDocumentsProvider(employeeId));

    Future<void> upload() async {
      final ok = await startHrDocumentIntake(context, employeeId: employeeId);
      if (ok) ref.invalidate(hrEmployeeDocumentsProvider(employeeId));
    }

    return Stack(
      children: [
        RefreshIndicator(
          color: HrColors.brand(context),
          onRefresh: () async {
            ref.invalidate(hrEmployeeDocumentsProvider(employeeId));
            await Future<void>.delayed(const Duration(milliseconds: 250));
          },
          child: docsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
            error: (e, _) => ListView(children: [
              const SizedBox(height: 40),
              Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
            ]),
            data: (docs) {
              if (docs.isEmpty) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                  padding: const EdgeInsets.fromLTRB(16, 32, 16, 140),
                  children: const [
                    SizedBox(height: 30),
                    _EmptyState(
                      icon: Icons.folder_open_outlined,
                      title: 'No documents yet',
                      subtitle: 'Tap the + button to scan or upload a document.',
                    ),
                  ],
                );
              }
              return _DocsList(docs: docs, employeeName: employeeName);
            },
          ),
        ),
        // Floating upload button — matches the home FAB color/elevation so
        // the action is discoverable but doesn't intrude on the list.
        Positioned(
          right: 16, bottom: 28,
          child: FloatingActionButton.extended(
            heroTag: 'docs-upload',
            backgroundColor: HrColors.teal,
            foregroundColor: Colors.white,
            onPressed: upload,
            icon: const Icon(Icons.add_rounded),
            label: const Text('Add document'),
          ),
        ),
      ],
    );
  }
}

class _DocsList extends StatelessWidget {
  final List<HrDocument> docs;
  final String employeeName;
  const _DocsList({required this.docs, required this.employeeName});

  @override
  Widget build(BuildContext context) {
    // Group documents by kind for at-a-glance browsing. "Other" + nulls
    // sink to the bottom of the list.
    final grouped = <HrDocumentKind?, List<HrDocument>>{};
    for (final d in docs) {
      grouped.putIfAbsent(d.kind, () => []).add(d);
    }
    final orderedKeys = grouped.keys.toList()
      ..sort((a, b) {
        if (a == b) return 0;
        if (a == null || a == HrDocumentKind.other) return 1;
        if (b == null || b == HrDocumentKind.other) return -1;
        return a.label.toLowerCase().compareTo(b.label.toLowerCase());
      });

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        for (final k in orderedKeys) ...[
          _DocSection(
            title: k?.label ?? 'Uncategorised',
            docs: grouped[k]!,
            employeeName: employeeName,
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

class _DocSection extends StatelessWidget {
  final String title;
  final List<HrDocument> docs;
  final String employeeName;
  const _DocSection({required this.title, required this.docs, required this.employeeName});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(
            title.toUpperCase(),
            style: RunqText.label.copyWith(color: t.muted2),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            children: [
              for (var i = 0; i < docs.length; i++) ...[
                _DocRow(doc: docs[i], employeeName: employeeName),
                if (i < docs.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _DocRow extends ConsumerWidget {
  final HrDocument doc;
  final String employeeName;
  const _DocRow({required this.doc, required this.employeeName});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    return InkWell(
      onTap: () => _open(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                doc.isImage
                    ? Icons.image_outlined
                    : (doc.isPdf ? Icons.picture_as_pdf_outlined : Icons.insert_drive_file_outlined),
                size: 18, color: HrColors.brand(context),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    doc.fileName,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${_size(doc.fileSize)} · ${_date(doc.createdAt)}',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                  if (doc.expiryDate != null) ...[
                    const SizedBox(height: 4),
                    _ExpiryChip(expiry: doc.expiryDate!),
                  ],
                ],
              ),
            ),
            IconButton(
              tooltip: 'More',
              icon: Icon(Icons.more_horiz_rounded, color: t.muted),
              visualDensity: VisualDensity.compact,
              onPressed: () => _showMenu(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    if (doc.isImage) {
      // Images render in-app via the same auth'd-photo path the avatar uses.
      Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black.withValues(alpha: 0.92),
        pageBuilder: (_, __, ___) => _DocImageViewer(doc: doc),
        transitionsBuilder: (_, anim, __, c) => FadeTransition(opacity: anim, child: c),
        transitionDuration: const Duration(milliseconds: 200),
      ));
    } else if (doc.isPdf) {
      // PDFs render in-app via PDFView. The viewer's app-bar carries a
      // Share action so the user can hand off to Files / WhatsApp only when
      // they actually want to — tapping the row no longer jumps to share.
      Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute(builder: (_) => _DocPdfViewer(doc: doc)),
      );
    } else {
      // Anything else (no in-app renderer): download and hand off to the OS
      // share sheet so the user can open in Files / Drive / etc.
      await _downloadAndShare(context);
    }
  }

  Future<void> _downloadAndShare(BuildContext context) async {
    // Snapshot the tapped row's rect *before* the async download so iPad
    // share_plus has a popover anchor (and iOS doesn't throw the
    // "sharePositionOrigin: argument must be …" PlatformException).
    final box = context.findRenderObject() as RenderBox?;
    final origin = (box != null && box.hasSize)
        ? box.localToGlobal(Offset.zero) & box.size
        : Rect.fromCenter(
            center: Offset(MediaQuery.of(context).size.width / 2, 0),
            width: 1, height: 1,
          );
    try {
      showRunqSnack(context, 'Preparing ${doc.fileName}…');
      final bytes = await hrRepo.downloadDocument(doc.id);
      final dir = await getTemporaryDirectory();
      final f = File('${dir.path}/${doc.fileName}');
      await f.writeAsBytes(bytes, flush: true);
      if (!context.mounted) return;
      await Share.shareXFiles(
        [XFile(f.path, mimeType: doc.mimeType, name: doc.fileName)],
        sharePositionOrigin: origin,
      );
    } catch (e) {
      if (context.mounted) {
        showRunqSnack(context, 'Could not download: $e', kind: SnackKind.error);
      }
    }
  }

  void _showMenu(BuildContext outerContext, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: outerContext,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) {
        final t = RT(sheetCtx);
        final inset = MediaQuery.of(sheetCtx).viewInsets.bottom;
        return Container(
          padding: EdgeInsets.fromLTRB(8, 12, 8, 12 + inset),
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              // View + Share — primary actions sit together in one card.
              _SheetGroup(rows: [
                _SheetRow(
                  icon: Icons.visibility_outlined,
                  label: 'View / Open',
                  onTap: () {
                    Navigator.of(sheetCtx).pop();
                    _open(outerContext);
                  },
                ),
                _SheetRow(
                  icon: Icons.ios_share_rounded,
                  label: 'Share',
                  onTap: () {
                    Navigator.of(sheetCtx).pop();
                    _downloadAndShare(outerContext);
                  },
                ),
              ]),
              const SizedBox(height: 8),
              // Destructive action in its own card so it visually separates
              // from the safe actions above.
              _SheetGroup(rows: [
                _SheetRow(
                  icon: Icons.delete_outline_rounded,
                  label: 'Delete',
                  danger: true,
                  onTap: () async {
                    Navigator.of(sheetCtx).pop();
                    try {
                      await hrRepo.deleteDocument(doc.id);
                      ref.invalidate(hrEmployeeDocumentsProvider(doc.entityId));
                      if (outerContext.mounted) {
                        showRunqSnack(outerContext, 'Document deleted', kind: SnackKind.success);
                      }
                    } catch (e) {
                      if (outerContext.mounted) {
                        showRunqSnack(outerContext, 'Delete failed: $e', kind: SnackKind.error);
                      }
                    }
                  },
                ),
              ]),
              const SizedBox(height: 6),
              TextButton(
                onPressed: () => Navigator.of(sheetCtx).maybePop(),
                child: Text('Cancel', style: TextStyle(color: t.muted)),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _size(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static String _date(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

/// Full-screen image viewer for HR document attachments. Pulls bytes via
/// the auth'd /common/attachments/:id/download endpoint, then renders them
/// from memory so the same image survives Hero / pinch interactions.
class _DocImageViewer extends StatefulWidget {
  final HrDocument doc;
  const _DocImageViewer({required this.doc});
  @override
  State<_DocImageViewer> createState() => _DocImageViewerState();
}

class _DocImageViewerState extends State<_DocImageViewer> {
  List<int>? _bytes;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final b = await hrRepo.downloadDocument(widget.doc.id);
      if (!mounted) return;
      setState(() => _bytes = b);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: GestureDetector(
        onTap: () => Navigator.of(context).maybePop(),
        onVerticalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0).abs() > 200) Navigator.of(context).maybePop();
        },
        child: SafeArea(
          child: Stack(
            children: [
              Center(child: _body()),
              Positioned(
                top: 8, right: 8,
                child: IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
                ),
              ),
              Positioned(
                left: 0, right: 0, bottom: 24,
                child: Center(
                  child: Text(
                    widget.doc.fileName,
                    style: RunqText.bodyStrong.copyWith(color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body() {
    if (_error != null) {
      return Text(_error!, style: const TextStyle(color: Colors.white));
    }
    if (_bytes == null) {
      return const CircularProgressIndicator(color: Colors.white);
    }
    return InteractiveViewer(
      maxScale: 4,
      child: Image.memory(
        Uint8List.fromList(_bytes!),
        fit: BoxFit.contain,
      ),
    );
  }
}

/// In-app PDF preview for an HR document. Downloads bytes via the auth'd
/// document endpoint, writes them to the app-sandboxed temp dir (PDFView's
/// native iOS renderer won't accept the system temp), then renders inline.
/// The app-bar's Share action hands the same file off to the OS share sheet
/// only when the user asks for it.
class _DocPdfViewer extends StatefulWidget {
  final HrDocument doc;
  const _DocPdfViewer({required this.doc});
  @override
  State<_DocPdfViewer> createState() => _DocPdfViewerState();
}

class _DocPdfViewerState extends State<_DocPdfViewer> {
  File? _file;
  String? _error;
  bool _loading = true;
  int _pages = 0;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _download();
  }

  Future<void> _download() async {
    try {
      final bytes = await hrRepo.downloadDocument(widget.doc.id);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${widget.doc.fileName}');
      await file.writeAsBytes(bytes, flush: true);
      if (!mounted) return;
      setState(() {
        _file = file;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load: $e';
        _loading = false;
      });
    }
  }

  Future<void> _share() async {
    final f = _file;
    if (f == null) return;
    final size = MediaQuery.of(context).size;
    try {
      await Share.shareXFiles(
        [XFile(f.path, mimeType: widget.doc.mimeType, name: widget.doc.fileName)],
        sharePositionOrigin: Rect.fromLTWH(size.width - 60, 0, 40, 40),
      );
    } catch (e) {
      if (mounted) {
        showRunqSnack(context, 'Share failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        backgroundColor: t.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.doc.fileName,
              style: RunqText.bodyStrong,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 1),
            Text(
              _pages > 0 ? 'Page ${_currentPage + 1} of $_pages' : 'PDF',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share, size: 20),
            tooltip: 'Share',
            onPressed: _file == null ? null : _share,
          ),
          const SizedBox(width: 4),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(0.5),
          child: Container(height: 0.5, color: t.hairline),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    final t = RT(context);
    if (_loading) {
      return Center(
        child: SizedBox(
          width: 28, height: 28,
          child: CircularProgressIndicator(strokeWidth: 2.5, color: t.brand),
        ),
      );
    }
    if (_error != null || _file == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded, size: 36, color: RunqColors.redInk),
              const SizedBox(height: 8),
              Text("Couldn't load this document", style: RunqText.bodyStrong),
              const SizedBox(height: 4),
              Text(
                _error ?? 'Unknown error',
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
      );
    }
    return PDFView(
      filePath: _file!.path,
      enableSwipe: true,
      swipeHorizontal: false,
      autoSpacing: true,
      pageSnap: false,
      fitPolicy: FitPolicy.WIDTH,
      onRender: (pages) {
        if (!mounted) return;
        setState(() => _pages = pages ?? 0);
      },
      onPageChanged: (page, _) {
        if (!mounted) return;
        setState(() => _currentPage = page ?? 0);
      },
      onError: (e) {
        if (!mounted) return;
        setState(() => _error = e.toString());
      },
    );
  }
}

// ─── Actions bottom sheet (… menu) ────────────────────────────────────────

Future<void> _showActionsSheet(BuildContext context, HrEmployee emp) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ActionsSheet(emp: emp),
  );
}

class _ActionsSheet extends ConsumerWidget {
  final HrEmployee emp;
  const _ActionsSheet({required this.emp});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final role = ref.watch(appRoleProvider);
    final canInvite = role == AppRole.admin || role == AppRole.hr;
    final inviteAsync = canInvite
        ? ref.watch(hrEmployeeInviteStatusProvider(emp.id))
        : null;
    return Container(
      padding: EdgeInsets.fromLTRB(8, 12, 8, 12 + inset),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 14),
          // Section: edit / manage record
          _SheetGroup(rows: [
            _SheetRow(
              icon: Icons.edit_outlined,
              label: 'Edit details',
              onTap: () {
                Navigator.of(context).pop();
                // Pass the loaded employee via `extra` so the form
                // prefills synchronously — no second network round-trip.
                context.push('/hr/employees/edit', extra: emp);
              },
            ),
            _SheetRow(
              icon: Icons.photo_camera_outlined,
              label: 'Update photo',
              onTap: () async {
                // Grab the root navigator's context (alive for the app's
                // lifetime) before popping — otherwise _pickAndUploadPhoto's
                // mounted-guard sees this sheet's now-defunct context after
                // the gallery picker returns and bails before uploading.
                final rootCtx = Navigator.of(context, rootNavigator: true).context;
                Navigator.of(context).pop();
                await _pickAndUploadPhoto(rootCtx, emp);
              },
            ),
            _SheetRow(
              icon: Icons.payments_outlined,
              label: 'Assign salary',
              onTap: () {
                Navigator.of(context).pop();
                showAssignSalarySheet(context, emp);
              },
            ),
            _SheetRow(
              icon: Icons.account_tree_outlined,
              label: 'Set reporting manager',
              onTap: () {
                Navigator.of(context).pop();
                _setReportingManager(context, emp);
              },
            ),
            _SheetRow(
              icon: Icons.event_available_outlined,
              label: 'Apply leave on behalf',
              onTap: () {
                Navigator.of(context).pop();
                showRunqSnack(context, 'Coming soon', kind: SnackKind.info);
              },
            ),
            if (canInvite) _inviteRow(context, ref, inviteAsync),
          ]),
          const SizedBox(height: 8),
          // Section: copy actions (no Edit flow needed)
          _SheetGroup(rows: [
            _SheetRow(
              icon: Icons.badge_outlined,
              label: 'Copy employee code',
              trailing: emp.employeeCode,
              onTap: () => _copy(context, emp.employeeCode, 'Employee code copied'),
            ),
            if (emp.phone != null)
              _SheetRow(
                icon: Icons.phone_outlined,
                label: 'Copy phone',
                trailing: emp.phone!,
                onTap: () => _copy(context, emp.phone!, 'Phone copied'),
              ),
            if (emp.email != null)
              _SheetRow(
                icon: Icons.mail_outline_rounded,
                label: 'Copy email',
                trailing: emp.email!,
                onTap: () => _copy(context, emp.email!, 'Email copied'),
              ),
            if (emp.uan != null)
              _SheetRow(
                icon: Icons.account_balance_outlined,
                label: 'Copy UAN',
                trailing: emp.uan!,
                onTap: () => _copy(context, emp.uan!, 'UAN copied'),
              ),
          ]),
          const SizedBox(height: 8),
          // Section: status change (danger-ish)
          _SheetGroup(rows: [
            _SheetRow(
              icon: emp.status == 'active' ? Icons.pause_circle_outline : Icons.play_circle_outline,
              label: emp.status == 'active' ? 'Mark inactive' : 'Mark active',
              onTap: () async {
                Navigator.of(context).pop();
                await _toggleStatus(context, emp);
              },
            ),
          ]),
          const SizedBox(height: 6),
          TextButton(
            onPressed: () => Navigator.of(context).maybePop(),
            child: Text('Cancel', style: TextStyle(color: t.muted)),
          ),
        ],
      ),
    );
  }

  Future<void> _copy(BuildContext context, String value, String message) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (context.mounted) {
      Navigator.of(context).pop();
      showRunqSnack(context, message, kind: SnackKind.success);
    }
  }

  /// "Send / Resend app invite" row — relabels based on current state and
  /// disables itself when the employee already has an active app account
  /// or has no email on file. We render a placeholder row while the
  /// status loads rather than hiding it, so the sheet height doesn't
  /// jump after the network call returns.
  _SheetRow _inviteRow(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<HrInviteStatus>? inviteAsync,
  ) {
    final status = inviteAsync?.asData?.value;
    final isLoading = inviteAsync?.isLoading ?? true;

    String label = 'Send app invite';
    String? trailing;
    bool disabled = isLoading;
    IconData icon = Icons.send_outlined;
    if (status != null) {
      switch (status.status) {
        case 'pending':
          label = 'Resend app invite';
          trailing = 'Pending';
          break;
        case 'expired':
          label = 'Resend app invite';
          trailing = 'Expired';
          break;
        case 'accepted':
        case 'active':
          label = 'App access enabled';
          trailing = 'Active';
          icon = Icons.verified_user_outlined;
          disabled = true;
          break;
        case 'inactive':
          label = 'App account inactive';
          trailing = 'Inactive';
          disabled = true;
          break;
        case 'no_email':
          label = 'Add email to invite';
          disabled = true;
          break;
        case 'not_invited':
        default:
          label = 'Send app invite';
      }
    }

    return _SheetRow(
      icon: icon,
      label: label,
      trailing: trailing,
      onTap: disabled ? () {} : () async {
        Navigator.of(context).pop();
        await _sendInvite(context, ref);
      },
    );
  }

  Future<void> _sendInvite(BuildContext context, WidgetRef ref) async {
    try {
      final result = await hrRepo.inviteEmployee(emp.id);
      // Refresh status so the sheet reads "Pending" next time.
      ref.invalidate(hrEmployeeInviteStatusProvider(emp.id));
      // Always stage the link to clipboard so the inviter has a fallback
      // regardless of whether SMTP delivered. Cheap and never harmful.
      await Clipboard.setData(ClipboardData(text: result.inviteUrl));
      if (!context.mounted) return;
      final emailOk = result.emailDelivery == 'sent';
      final to = result.email ?? emp.email ?? 'employee';
      final msg = emailOk
          ? (result.reused
              ? 'Invite re-sent to $to · link copied'
              : 'Invite sent to $to · link copied')
          : 'Email delivery failed — invite link copied to clipboard';
      showRunqSnack(
        context,
        msg,
        kind: emailOk ? SnackKind.success : SnackKind.error,
      );
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, 'Could not send invite: $e', kind: SnackKind.error);
    }
  }
}

class _SheetGroup extends StatelessWidget {
  final List<_SheetRow> rows;
  const _SheetGroup({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i < rows.length - 1)
              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 46),
          ],
        ],
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? trailing;
  /// Destructive action — paints icon tile + label in red so the user
  /// sees it as different from the neutral rows. Used for Delete.
  final bool danger;
  final VoidCallback onTap;
  const _SheetRow({
    required this.icon,
    required this.label,
    this.trailing,
    this.danger = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const dangerInk = Color(0xFFDC2626);
    final dangerInkDark = const Color(0xFFFCA5A5);
    final iconInk = danger ? (isDark ? dangerInkDark : dangerInk) : HrColors.brand(context);
    final iconBg = danger
        ? (isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEE2E2))
        : HrColors.tealSubtle;
    final labelInk = danger ? (isDark ? dangerInkDark : dangerInk) : t.ink;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, size: 15, color: iconInk),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: RunqText.body.copyWith(color: labelInk),
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  trailing!,
                  textAlign: TextAlign.right,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Pick a single photo from gallery and POST to the photo endpoint.
/// Server resizes + stores; we invalidate the detail provider so the
/// gradient hero refreshes immediately.
Future<void> _pickAndUploadPhoto(BuildContext context, HrEmployee emp) async {
  final picked = await ImagePicker().pickImage(
    source: ImageSource.gallery,
    imageQuality: 90,
    maxWidth: 1600,
  );
  if (picked == null || !context.mounted) return;
  try {
    showRunqSnack(context, 'Uploading photo…');
    await hrRepo.uploadEmployeePhoto(emp.id, File(picked.path));
    if (context.mounted) {
      ProviderScope.containerOf(context, listen: false)
        ..invalidate(hrEmployeeProvider(emp.id))
        ..invalidate(hrEmployeesProvider)
        // The More-screen header avatar reads photoUrl from hrMeProvider
        // (GET /hr/me), a separate cache — refresh it too when this is the
        // user's own photo, else their header keeps showing initials.
        ..invalidate(hrMeProvider);
      showRunqSnack(context, 'Photo updated', kind: SnackKind.success);
    }
  } catch (e) {
    if (context.mounted) {
      showRunqSnack(context, 'Photo upload failed: $e', kind: SnackKind.error);
    }
  }
}

/// Flip active ↔ inactive via the update endpoint (status is partial-
/// updateable). Invalidates the detail + list providers so the chips
/// rerender.
Future<void> _toggleStatus(BuildContext context, HrEmployee emp) async {
  final next = emp.status == 'active' ? 'inactive' : 'active';
  final label = next == 'active' ? 'active' : 'inactive';
  final ok = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text('Mark $label?'),
      content: Text('${emp.displayName} will be set to "$label". Payroll and attendance behaviour depends on the new status.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: TextButton.styleFrom(foregroundColor: HrColors.teal),
          child: Text('Mark $label'),
        ),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await hrRepo.updateEmployee(emp.id, {'status': next});
    if (context.mounted) {
      ProviderScope.containerOf(context, listen: false)
        ..invalidate(hrEmployeeProvider(emp.id))
        ..invalidate(hrEmployeesProvider);
      showRunqSnack(context, 'Marked $label', kind: SnackKind.success);
    }
  } catch (e) {
    if (context.mounted) showRunqSnack(context, 'Update failed: $e', kind: SnackKind.error);
  }
}

// ─── Reporting-manager picker ─────────────────────────────────────────────

/// Opens the searchable manager picker. Called synchronously right after the
/// actions sheet pops, so `context` is still valid to anchor the new modal —
/// the same pattern as Assign salary. All the work (load / patch / refresh)
/// lives inside the sheet, which owns a mounted context + ref.
void _setReportingManager(BuildContext context, HrEmployee emp) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ManagerPickerSheet(emp: emp),
  );
}

class _ManagerPickerSheet extends ConsumerStatefulWidget {
  final HrEmployee emp;
  const _ManagerPickerSheet({required this.emp});

  @override
  ConsumerState<_ManagerPickerSheet> createState() => _ManagerPickerSheetState();
}

class _ManagerPickerSheetState extends ConsumerState<_ManagerPickerSheet> {
  String _q = '';
  final _controller = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _apply(String? managerId) async {
    final emp = widget.emp;
    // No-op if unchanged — just dismiss.
    if (managerId == emp.reportingToId) {
      Navigator.of(context).maybePop();
      return;
    }
    setState(() => _saving = true);
    try {
      await hrRepo.updateEmployee(emp.id, {'reportingToId': managerId});
      // Refresh the detail record, the People list, this person's work
      // profile (so its Reporting section appears) and the org chart.
      ref
        ..invalidate(hrEmployeeProvider(emp.id))
        ..invalidate(hrEmployeesProvider)
        ..invalidate(hrWorkProfileProvider(emp.id))
        ..invalidate(hrOrgChartProvider);
      if (mounted) {
        showRunqSnack(
          context,
          managerId == null ? 'Reporting manager cleared' : 'Reporting manager updated',
          kind: SnackKind.success,
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Update failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final async = ref.watch(hrOrgChartProvider);
    final q = _q.trim().toLowerCase();

    return Container(
      padding: EdgeInsets.fromLTRB(8, 12, 8, 12 + inset),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.82,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Reporting manager',
                    style: RunqText.h4.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text('Who does ${widget.emp.displayName} report to?',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: TextField(
              controller: _controller,
              textCapitalization: TextCapitalization.none,
              onChanged: (v) => setState(() => _q = v),
              decoration: InputDecoration(
                hintText: 'Search name or code',
                hintStyle: RunqText.body.copyWith(color: t.muted2),
                prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
                isDense: true,
                filled: true,
                fillColor: t.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: t.hairline, width: 0.5),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                      color: HrColors.teal.withValues(alpha: 0.55), width: 1.5),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Flexible(
            child: async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(24),
                child: Text('$e', style: RunqText.body.copyWith(color: t.muted)),
              ),
              data: (people) {
                // Everyone but this employee can be their manager; a person
                // can't report to themselves.
                final candidates = people
                    .where((e) => e.id != widget.emp.id)
                    .where((e) =>
                        q.isEmpty ||
                        e.displayName.toLowerCase().contains(q) ||
                        e.employeeCode.toLowerCase().contains(q) ||
                        (e.designationName?.toLowerCase().contains(q) ?? false))
                    .toList()
                  ..sort((a, b) =>
                      a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));
                return ListView(
                  shrinkWrap: true,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  children: [
                    if (q.isEmpty)
                      _ManagerOption(
                        leading: Icon(Icons.person_off_outlined, color: t.muted, size: 22),
                        title: 'No manager',
                        subtitle: 'Top of the reporting line',
                        selected: widget.emp.reportingToId == null,
                        onTap: _saving ? null : () => _apply(null),
                      ),
                    for (final e in candidates)
                      _ManagerOption(
                        leading: HrAvatar(
                          name: e.displayName,
                          photoUrl: e.photoUrl,
                          employeeId: e.id,
                          size: 36,
                        ),
                        title: e.displayName,
                        subtitle: [
                          e.employeeCode,
                          if (e.designationName != null) e.designationName!,
                        ].join(' · '),
                        selected: widget.emp.reportingToId == e.id,
                        onTap: _saving ? null : () => _apply(e.id),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ManagerOption extends StatelessWidget {
  final Widget leading;
  final String title, subtitle;
  final bool selected;
  final VoidCallback? onTap;
  const _ManagerOption({
    required this.leading,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? HrColors.teal : t.hairline,
                width: selected ? 1.2 : 0.5,
              ),
            ),
            child: Row(
              children: [
                leading,
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: RunqText.bodyStrong.copyWith(color: t.ink),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      if (subtitle.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(subtitle,
                            style: RunqText.caption.copyWith(color: t.muted),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ],
                  ),
                ),
                if (selected)
                  const Icon(Icons.check_circle_rounded, color: HrColors.teal, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  const _EmptyState({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          Icon(icon, color: t.muted2, size: 32),
          const SizedBox(height: 10),
          Text(title, textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(subtitle, textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

class _ExpiryChip extends StatelessWidget {
  final DateTime expiry;
  const _ExpiryChip({required this.expiry});

  @override
  Widget build(BuildContext context) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days = expiry.difference(today).inDays;
    final (bg, ink, text) = days < 0
        ? (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D),
            'Expired ${-days}d ago')
        : days <= 30
            ? (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D),
                'Expires in $days d')
            : days <= 90
                ? (const Color(0xFFFEF3C7), const Color(0xFF78350F),
                    'Expires in $days d')
                : (const Color(0xFFF1F5F9), const Color(0xFF475569),
                    'Expires ${expiry.day} ${m[expiry.month - 1]} ${expiry.year}');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text,
          style: RunqText.micro.copyWith(color: ink)),
    );
  }
}
