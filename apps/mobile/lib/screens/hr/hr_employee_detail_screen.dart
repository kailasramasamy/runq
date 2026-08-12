// Employee detail — fresh redesign.
//
// Layout:
//   ┌─ Collapsing teal-gradient hero (avatar + name + role + chips) ─────┐
//   ├─ Pinned tab strip (Info | Time | Pay | Docs | Resume) ─────────────┤
//   └─ Tab body — grouped, card-based content per tab ───────────────────┘
//
// The hero uses HrColors.profileGradient (deep cyan → teal). Tab strip
// pins under the hero. Each tab body is a stack of grouped cards.
//
// Each tab body lives in its own `part` file under `employee_detail/` to
// keep this file readable; only the scaffold and the Time tab are here.

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
import 'widgets/hr_attendance_leave_body.dart';
import 'widgets/hr_collapsing_title.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_employment_status_sheet.dart';
import 'widgets/hr_resume_tab.dart';
import 'widgets/hr_widgets.dart';


part 'employee_detail/emp_hero.dart';
part 'employee_detail/emp_info_tab.dart';
part 'employee_detail/emp_pay_tab.dart';
part 'employee_detail/emp_docs_tab.dart';
part 'employee_detail/emp_doc_viewers.dart';
part 'employee_detail/emp_actions_sheet.dart';
part 'employee_detail/emp_manager_picker.dart';
part 'employee_detail/emp_shared.dart';

/// Tab slugs accepted by the `?tab=` query param, in tab-bar order.
const _kTabSlugs = ['info', 'time', 'pay', 'docs', 'resume'];

class HrEmployeeDetailScreen extends ConsumerStatefulWidget {
  final String id;

  /// Which tab to open on — one of [_kTabSlugs]. Lets a caller deep-link
  /// straight to a section, e.g. an employee opening their own attendance
  /// from the Time screen.
  final String? initialTab;

  const HrEmployeeDetailScreen({super.key, required this.id, this.initialTab});

  @override
  ConsumerState<HrEmployeeDetailScreen> createState() => _HrEmployeeDetailScreenState();
}

class _HrEmployeeDetailScreenState extends ConsumerState<HrEmployeeDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    final want = _kTabSlugs.indexOf(widget.initialTab ?? '');
    _tabs = TabController(
      length: _kTabSlugs.length,
      vsync: this,
      initialIndex: want < 0 ? 0 : want,
    );
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
                // The toolbar row lives on the SliverAppBar, not inside the
                // hero. A FlexibleSpaceBar background is bottom-anchored, so
                // collapsing clips it from the top — anything placed up there
                // is the first thing to disappear, which stranded both the
                // back button and the name. Here they stay pinned.
                automaticallyImplyLeading: false,
                leading: IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                ),
                titleSpacing: 0,
                // Left-aligned against the back button. AppBar centres titles
                // on iOS by default, which would strand a two-line name/code
                // block in the middle of the bar.
                centerTitle: false,
                title: HrCollapsingTitle(
                  title: emp.displayName,
                  subtitle: emp.employeeCode,
                ),
                actions: [
                  if (canManage)
                    IconButton(
                      onPressed: () => _showActionsSheet(context, emp),
                      icon: const Icon(Icons.more_horiz_rounded, color: Colors.white),
                    ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: _Hero(emp: emp),
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
                        Tab(height: 54, icon: Icon(Icons.event_available_outlined, size: 20), text: 'Time'),
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
                _TimeTab(employeeId: emp.id, employeeName: emp.displayName),
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


// ─── Time tab ─────────────────────────────────────────────────────────────

/// Attendance + leave, managed in place. Everything — month paging, marking
/// a day or a range, balances, leave history — lives in
/// [HrAttendanceLeaveBody]. There is deliberately no separate detail screen
/// to drill into: it showed the same content, so the push was pure friction.
class _TimeTab extends StatelessWidget {
  final String employeeId;
  final String employeeName;
  const _TimeTab({required this.employeeId, required this.employeeName});

  @override
  Widget build(BuildContext context) => HrAttendanceLeaveBody(
        employeeId: employeeId,
        employeeName: employeeName,
      );
}
