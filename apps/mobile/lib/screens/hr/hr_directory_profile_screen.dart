// Directory work-profile — opened when a colleague is tapped in the
// directory (or org chart). Unscoped: any employee can view anyone.
//
// Shows only collaboration-safe data — identity, contact, reporting line
// and the resume/about profile. Salary, bank and statutory fields are
// never fetched (the /hr/directory/:id endpoint omits them). The full HR
// record stays behind the scoped HrEmployeeDetailScreen.
//
// Layout: a teal hero that sizes to its content (no fixed height, so no
// dead space), a pinned pill bar, and one section shown at a time —
// Reporting / About / Experience / Education / Skills / …

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_reporting_section.dart';
import 'widgets/hr_resume_sections.dart';
import 'widgets/hr_widgets.dart';

class HrDirectoryProfileScreen extends ConsumerStatefulWidget {
  final String id;
  const HrDirectoryProfileScreen({super.key, required this.id});

  @override
  ConsumerState<HrDirectoryProfileScreen> createState() =>
      _HrDirectoryProfileScreenState();
}

class _HrDirectoryProfileScreenState
    extends ConsumerState<HrDirectoryProfileScreen> {
  /// Index into the section list built from the loaded profile.
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(hrWorkProfileProvider(widget.id));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => _ErrorBody(message: '$e'),
        data: (profile) {
          final sections = _sectionsFor(profile);
          final sel = sections.isEmpty
              ? 0
              : _selected.clamp(0, sections.length - 1);
          return CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              // Thin pinned bar — owns the status-bar inset and the back
              // button. tealDeep matches the hero gradient's top so the
              // two read as one continuous teal block when expanded.
              SliverAppBar(
                pinned: true,
                elevation: 0,
                scrolledUnderElevation: 0,
                backgroundColor: HrColors.tealDeep,
                systemOverlayStyle: SystemUiOverlayStyle.light,
                leading: IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                ),
              ),
              SliverToBoxAdapter(child: _HeroBody(emp: profile.employee)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: _ContactRail(emp: profile.employee),
                ),
              ),
              if (sections.isNotEmpty)
                SliverPersistentHeader(
                  pinned: true,
                  delegate: _PillBarDelegate(
                    labels: [for (final s in sections) s.label],
                    selected: sel,
                    background: t.bgWarm,
                    onTap: (i) => setState(() => _selected = i),
                  ),
                ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
                sliver: SliverToBoxAdapter(
                  child: sections.isEmpty
                      ? const SizedBox.shrink()
                      : sections[sel].widget,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  /// Reporting first, then the resume sections (About / Experience / …).
  List<({String label, Widget widget})> _sectionsFor(HrWorkProfile p) {
    final out = <({String label, Widget widget})>[];
    final reporting = HrReportingSection(profile: p);
    if (reporting.hasContent) out.add((label: 'Reporting', widget: reporting));
    final resume = p.resume;
    if (resume != null) out.addAll(hrResumeSections(resume));
    return out;
  }
}

// ─── Hero ───────────────────────────────────────────────────────────────────

/// Teal hero card — sizes to its own content (mainAxisSize.min), so there
/// is never trailing dead space below the chips.
class _HeroBody extends StatelessWidget {
  final HrEmployee emp;
  const _HeroBody({required this.emp});

  @override
  Widget build(BuildContext context) {
    final role = [
      if (emp.designationName != null) emp.designationName!,
      if (emp.departmentName != null) emp.departmentName!,
    ].join(' · ');
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(gradient: HrColors.profileGradient),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 22),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          HrAvatar(
            name: emp.displayName,
            photoUrl: emp.photoUrl,
            employeeId: emp.id,
            size: 88,
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
          if (role.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              role,
              textAlign: TextAlign.center,
              style: RunqText.body.copyWith(
                color: Colors.white.withValues(alpha: 0.78),
              ),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              _HeroChip(label: _statusLabel(emp.status)),
              _HeroChip(label: _empTypeLabel(emp.employmentType)),
              _HeroChip(label: emp.employeeCode),
              if (emp.joiningDate != null)
                _HeroChip(label: 'Joined ${_monthYear(emp.joiningDate!)}'),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  final String label;
  const _HeroChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 0.5),
      ),
      child: Text(label, style: RunqText.label.copyWith(color: Colors.white)),
    );
  }
}

// ─── Pill nav bar ────────────────────────────────────────────────────────────

/// Pinned, horizontally-scrollable section selector. Stays put under the
/// app bar while the active section scrolls beneath it.
class _PillBarDelegate extends SliverPersistentHeaderDelegate {
  final List<String> labels;
  final int selected;
  final Color background;
  final ValueChanged<int> onTap;
  const _PillBarDelegate({
    required this.labels,
    required this.selected,
    required this.background,
    required this.onTap,
  });

  static const double _height = 54;

  @override
  double get minExtent => _height;
  @override
  double get maxExtent => _height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      height: _height,
      color: background,
      alignment: Alignment.centerLeft,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 9, 16, 9),
        itemCount: labels.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) => _Pill(
          label: labels[i],
          selected: i == selected,
          onTap: () => onTap(i),
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(_PillBarDelegate old) =>
      old.selected != selected ||
      old.background != background ||
      old.labels.length != labels.length;
}

class _Pill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Pill({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? HrColors.teal : t.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? HrColors.teal : t.hairline,
            width: 0.5,
          ),
        ),
        child: Text(
          label,
          style: RunqText.label.copyWith(
            color: selected ? Colors.white : t.muted,
          ),
        ),
      ),
    );
  }
}

// ─── Contact rail ────────────────────────────────────────────────────────────

class _ContactRail extends StatelessWidget {
  final HrEmployee emp;
  const _ContactRail({required this.emp});

  @override
  Widget build(BuildContext context) {
    final hasPhone = emp.phone != null && emp.phone!.isNotEmpty;
    final hasEmail = emp.email != null && emp.email!.isNotEmpty;
    return Row(
      children: [
        Expanded(
          child: _ActionTile(
            icon: Icons.phone_outlined,
            label: 'Call',
            onTap: hasPhone ? () => _launch(context, 'tel:${emp.phone}') : null,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionTile(
            icon: Icons.chat_bubble_outline_rounded,
            label: 'Message',
            onTap: hasPhone ? () => _launch(context, 'sms:${emp.phone}') : null,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionTile(
            icon: Icons.mail_outline_rounded,
            label: 'Email',
            onTap: hasEmail ? () => _launch(context, 'mailto:${emp.email}') : null,
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
  final VoidCallback? onTap;
  const _ActionTile({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = onTap != null ? HrColors.brand(context) : t.muted2;
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
            Text(label, style: RunqText.label.copyWith(color: ink)),
          ],
        ),
      ),
    );
  }
}

// ─── Error state ─────────────────────────────────────────────────────────────

class _ErrorBody extends StatelessWidget {
  final String message;
  const _ErrorBody({required this.message});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: () => Navigator.of(context).maybePop(),
              icon: Icon(Icons.arrow_back_rounded, color: t.ink),
            ),
          ),
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(message,
                    textAlign: TextAlign.center,
                    style: RunqText.body.copyWith(color: t.muted)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Labels ──────────────────────────────────────────────────────────────────

String _statusLabel(String s) => switch (s) {
      'active' => 'Active',
      'on_leave' => 'On leave',
      'inactive' => 'Inactive',
      'terminated' => 'Left',
      _ => s,
    };

String _empTypeLabel(String s) => switch (s) {
      'permanent' => 'Permanent',
      'contract' => 'Contract',
      'intern' => 'Intern',
      'consultant' => 'Consultant',
      'wage' => 'Wage worker',
      _ => s,
    };

String _monthYear(DateTime d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return '${m[d.month - 1]} ${d.year}';
}
