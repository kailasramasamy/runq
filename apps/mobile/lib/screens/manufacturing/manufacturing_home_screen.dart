import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/notifications_repo.dart';
import '../../providers/auth_provider.dart';
import '../../api/inventory_models.dart';
import '../../api/manufacturing_models.dart' show WorkOrderListRow;
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_expiry.dart';
import '../../utils/format_qty.dart';
import '../../widgets/module_switcher.dart';
import '../../widgets/profile_avatar_button.dart';
import 'draw_yield_sheet.dart';
import 'mfg_material_sheet.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_doc_list.dart';
import 'widgets/mfg_primitives.dart';

part '_mfg_home_hero.dart';
part '_mfg_home_materials.dart';

/// Manufacturing home screen.
///
/// Visual rhythm matches `purchase_home_screen.dart` (per /module-ui skill
/// §Step 3 "Home" archetype): top bar with switcher + bell, greeting with
/// date + first name, gradient hero KPI strip, then the two things the floor
/// came for — record production, and what there is to make it out of —
/// followed by the runs logged today.

/// The home card is a glance, not a list — anything past this many is reached
/// through "See all" rather than scrolled past on the way to the rest of the
/// page.
///
/// Counts *products* on the card, one line each however many runs made them.
/// The "See all" label still counts runs, because runs are what that screen
/// lists.
const int _recentWoLimit = 10;

class ManufacturingHomeScreen extends ConsumerWidget {
  const ManufacturingHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // Phase 3: single dashboard call replaces the 4 list queries.
    final dashAsync = ref.watch(mfgDashboardProvider);
    // Today's runs — what the floor is actually working on. Keyed on activity,
    // not the schedule: a run planned yesterday and closed this morning still
    // belongs to today, and filtering on scheduled_for alone hid exactly that.
    final todayIso = DateTime.now().toIso8601String().substring(0, 10);
    final todayAsync = ref.watch(workOrderListProvider(
      WoListParams(activeOn: todayIso),
    ));
    // Early in a shift "today" is legitimately empty, and an empty card is a
    // dead home screen. Fall back to the latest runs — relabelled, never
    // dressed up as today's — so there is always something to act on.
    final todayIsEmpty = todayAsync.asData?.value.data.isEmpty ?? false;
    final fallbackAsync = todayIsEmpty
        ? ref.watch(workOrderListProvider(const WoListParams()))
        : null;
    final showingFallback = fallbackAsync != null;
    final woAsync = fallbackAsync ?? todayAsync;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: MfgColors.brand(context),
          onRefresh: () async {
            // Await the real refetches. The old version invalidated and then
            // slept 200ms, so the spinner retracted long before any response
            // landed — the data did reload, just after the gesture had visibly
            // "finished", which reads as a refresh that did nothing.
            await Future.wait([
              ref.refresh(mfgDashboardProvider.future),
              ref.refresh(
                  workOrderListProvider(WoListParams(activeOn: todayIso)).future),
              ref.refresh(workOrderListProvider(const WoListParams()).future),
              ref.refresh(
                  workOrderListProvider(const WoListParams(status: 'draft')).future),
              ref.refresh(mfgStockProvider((warehouseId: null, itemClassGroup: 'inputs')).future),
              // The bell reads scopedUnreadCountProvider, which derives from
              // this — it was never refreshed before, so the count went stale.
              ref.refresh(openDrawsProvider.future),
              ref.refresh(notificationsProvider.future),
            ].map(_settled));
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.only(bottom: 120),
            children: [
              const _TopBar(),
              const _Greeting(),
              _HeroCard(dashboard: dashAsync),
              const SizedBox(height: 16),
              const _RecordProductionButton(),
              // Milk that has left the pool with no yield recorded against it
              // — above stock, because it is stock nobody can see.
              const OpenDrawsSection(),
              // What a run can actually consume. Expiry urgency rides these
              // rows rather than sitting in a second card above them: milk is
              // a perishable raw material, and stating it twice in two shapes
              // made one screen answer the same question two ways.
              const _RawMaterialsSection(),
              // "See all" lives on the header, matching Raw materials above.
              // The card used to carry it as a footer, which put the escape
              // hatch ten rows down the page.
              MfgSectionHeader(
                // The date rides the heading, so the rows below need not
                // repeat it. Every run under "Made today" is from the same
                // day, and a date block on each one only invited the reader
                // to wonder why it sometimes differed — it carries the day
                // the run was worked, which is not always the day it was
                // scheduled for.
                label: showingFallback
                    ? 'Recently made'
                    : 'Made today · ${_headerDate()}',
                trailing: (woAsync.valueOrNull?.data.isNotEmpty ?? false)
                    ? TextButton(
                        onPressed: () => context.push('/manufacturing/wos'),
                        child: Text(
                          woAsync.valueOrNull!.total > _recentWoLimit
                              ? 'See all (${woAsync.valueOrNull!.total}) →'
                              : 'See all →',
                          style: RunqText.caption.copyWith(color: MfgColors.brand(context)),
                        ),
                      )
                    : null,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: woAsync.when(
                  loading: () => const _RecentSkeleton(),
                  error: (e, _) => Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Failed to load: $e',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ),
                  data: (res) {
                    if (res.data.isEmpty) {
                      return MfgEmptyState(
                        icon: Icons.event_available_outlined,
                        title: 'Nothing logged yet',
                        description: 'Record what the plant made and it shows up here.',
                        action: MfgPrimaryButton(
                          label: 'Record production',
                          icon: Icons.bolt_rounded,
                          onPressed: () => context.push('/manufacturing/production/new'),
                        ),
                      );
                    }
                    // An open draw is already sitting above under "Out for
                    // production", where the one question left is asked
                    // directly. Listing it here too gave the same run two
                    // ways to be finished, and finishing it by the second
                    // left the first still claiming the milk was out.
                    // It reappears here once closed — it was made today.
                    final rows = res.data
                        .where((wo) => !(wo.bomId == null && wo.status == 'in_progress'))
                        .toList();
                    if (rows.isEmpty) {
                      return MfgEmptyState(
                        icon: Icons.event_available_outlined,
                        title: 'Nothing made yet',
                        description: 'Close a draw, or record what was made.',
                      );
                    }
                    // Every run goes in: the card caps itself by product, not
                    // by run. Capping here would cut a product's runs in half
                    // and understate its own total — see _MadeTodayList.
                    return _MadeTodayList(
                      rows: rows,
                      showingFallback: showingFallback,
                    );
                  },
                ),
              ),
              // "This week" is a look-back, not something to act on — it sits
              // after the operational sections (what's on hand, what was made
              // today) rather than above them.
              const SizedBox(height: 16),
              dashAsync.whenOrNull(
                    data: (d) => _ThisWeekCard(dashboard: d),
                  ) ??
                  const SizedBox.shrink(),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Top bar ───────────────────────────────────────────────────────────────

class _TopBar extends ConsumerWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(
      scopedUnreadCountProvider(const ['wo_', 'manufacturing_']),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
      child: Row(
        children: [
          const ModuleSwitcher(),
          const Spacer(),
          _BellButton(
            unread: unread,
            onTap: () => context.push('/notifications?scope=manufacturing'),
          ),
          const SizedBox(width: 4),
          ProfileAvatarButton(onTap: () => context.push('/manufacturing/more')),
        ],
      ),
    );
  }
}

class _BellButton extends StatelessWidget {
  const _BellButton({required this.unread, required this.onTap});
  final int unread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 40, height: 40,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Icon(Icons.notifications_outlined, color: t.ink, size: 24),
              if (unread > 0)
                Positioned(
                  right: 4, top: 4,
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: unread > 9 ? 4 : 0),
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade600,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: t.bgWarm, width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      style: RunqText.micro.copyWith(color: Colors.white, height: 1),
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

// ── Greeting ──────────────────────────────────────────────────────────────

class _Greeting extends ConsumerWidget {
  const _Greeting();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final user = ref.watch(authProvider).user;
    final firstName = _firstName(user?.name) ?? 'there';
    final today = DateTime.now();
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    final dateLabel =
        '${weekdays[today.weekday - 1]}, ${today.day} ${months[today.month - 1]}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(dateLabel, style: RunqText.body.copyWith(color: t.muted)),
          const SizedBox(height: 2),
          Text(
            '${_greeting(today)}, $firstName 👋',
            style: RunqText.h2.copyWith(
              color: t.ink,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }

  static String? _firstName(String? name) {
    if (name == null) return null;
    final trimmed = name.trim();
    if (trimmed.isEmpty) return null;
    return trimmed.split(RegExp(r'\s+')).first;
  }

  static String _greeting(DateTime now) {
    final h = now.hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

/// Completes when [f] does, whether it succeeded or failed.
///
/// Pull-to-refresh awaits every card's fetch at once. A card that fails already
/// renders its own error state from its `AsyncValue`, so the failure must not
/// propagate out of `Future.wait` and leave the gesture hanging on an
/// unhandled error — the await here is only about spinner timing.
Future<void> _settled(Future<Object?> f) => f.then((_) {}, onError: (Object _) {});

class _RecentSkeleton extends StatelessWidget {
  const _RecentSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      children: List.generate(3, (_) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Container(
          height: 64,
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
        ),
      )),
    );
  }
}

/// One product's runs for the day, in the order the server sent them.
class _MadeGroup {
  _MadeGroup({required this.key});
  final String key;
  final List<WorkOrderListRow> rows = [];

  WorkOrderListRow get lead => rows.first;

  /// Only what the runs actually put out.
  ///
  /// A single row falls back to the plan when a run has no yield yet, which is
  /// honest sitting beside a status chip. Folded into a combined figure it
  /// would quietly add a plan to an actual and overstate the day — so the
  /// total counts yields alone and the unreported runs are stated separately.
  double get madeQty => rows.fold(0.0, (n, r) => n + r.outputQty);

  /// Runs with no yield reported yet.
  int get openCount => rows.where((r) => r.outputQty <= 0).length;
}

/// Group a day's runs by what they made.
///
/// Keyed on the resolved output item id, never the name: names are not unique
/// across items, and editing one between two runs would split a product in
/// half. The uom joins the key because a draw states its own unit while a
/// recipe run takes the BOM's — two runs of one product can legitimately
/// differ, and litres must never be added to units. Falls back to the name
/// only when an id is genuinely absent.
List<_MadeGroup> _groupByProduct(List<WorkOrderListRow> rows) {
  final byKey = <String, _MadeGroup>{};
  for (final r in rows) {
    final id = (r.outputItemId ?? '').isNotEmpty ? r.outputItemId! : r.outputItemName;
    final key = '$id|${r.outputUom}';
    byKey.putIfAbsent(key, () => _MadeGroup(key: key)).rows.add(r);
  }
  return byKey.values.toList();
}

/// Today's runs, one line per product rather than one per work order.
///
/// Two runs of the same thing on the same day answer a single question — how
/// much was made — and splitting them across two rows left the reader doing
/// the addition. A product made by one run still renders as one plain row: an
/// expander that opens onto a single child is a control that earns nothing.
class _MadeTodayList extends StatefulWidget {
  const _MadeTodayList({required this.rows, required this.showingFallback});

  final List<WorkOrderListRow> rows;
  final bool showingFallback;

  @override
  State<_MadeTodayList> createState() => _MadeTodayListState();
}

class _MadeTodayListState extends State<_MadeTodayList> {
  /// Products the reader has opened, by group key.
  final Set<String> _expanded = {};

  @override
  Widget build(BuildContext context) {
    // Capped by product, never by run. Trimming the runs first would leave a
    // product's total counting only the runs that survived the cut — a number
    // that is wrong rather than merely short. Dropping a whole product past
    // the cap only hides it, and "See all" is right there.
    final groups = _groupByProduct(widget.rows).take(_recentWoLimit).toList();
    return MfgDividedCard(
      children: [
        for (final g in groups)
          if (g.rows.length == 1) _singleRun(g.lead) else _combinedGroup(g),
      ],
    );
  }

  /// Exactly the row this card has always shown.
  Widget _singleRun(WorkOrderListRow wo) => MfgDocListTile(
        flat: true,
        icon: Icons.precision_manufacturing_outlined,
        // Only the fallback list spans more than one day, so only it needs a
        // date per row. Under "Made today" the heading carries the date and
        // the leading block shows the shift, which is what actually separates
        // one run from the next.
        leadingDate: widget.showingFallback ? _activeDate(wo) : null,
        leadingShift: widget.showingFallback ? null : wo.shift,
        title: wo.outputItemName,
        subtitle: wo.bomName,
        status: wo.status,
        // What came out, once anything has. A run still open has no output
        // yet, so the plan stands in — but on a closed run the planned figure
        // is the estimate, not the answer.
        rightValue: formatItemQty(
            wo.outputQty > 0 ? wo.outputQty : wo.plannedQty, null,
            unit: wo.outputUom),
        rightUnit: wo.outputUom,
        reference: wo.woNumber,
        onTap: () => context.push('/manufacturing/wos/${wo.id}'),
      );

  /// A product made by more than one run: the combined figure, and — once
  /// opened — the runs behind it.
  ///
  /// One widget rather than a spread, so [MfgDividedCard] rules its line
  /// between *products* and never between a heading and its own runs. Spliced
  /// in flat, every run took a full-width divider of its own and read as
  /// another product rather than as a child.
  Widget _combinedGroup(_MadeGroup g) {
    final open = _expanded.contains(g.key);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        MfgDocListTile(
          flat: true,
          // The chevron takes the icon slot: on a row that opens, the module
          // glyph said nothing the rows above had not already said.
          icon: open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
          title: g.lead.outputItemName,
          // No work-order number and no status here — the runs differ on both,
          // and naming one of them would read as though it were the whole
          // figure. They are stated per run once the group is opened.
          subtitle: '${g.rows.length} runs'
              '${g.openCount > 0 ? '  ·  ${g.openCount} yet to report' : ''}',
          rightValue: formatItemQty(g.madeQty, null, unit: g.lead.outputUom),
          rightUnit: g.lead.outputUom,
          onTap: () => setState(() {
            if (open) {
              _expanded.remove(g.key);
            } else {
              _expanded.add(g.key);
            }
          }),
        ),
        if (open)
          for (final wo in g.rows) _runRow(wo),
      ],
    );
  }

  /// One run inside an opened product: what it made, how far along it is, and
  /// a way into it. Deliberately lighter than the row above — a child that
  /// looked as heavy as its heading would read as another product.
  Widget _runRow(WorkOrderListRow wo) {
    final t = RT(context);
    final made = wo.outputQty > 0;
    return InkWell(
      onTap: () => context.push('/manufacturing/wos/${wo.id}'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(46, 10, 14, 10),
        child: Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // The pill sits with the run it describes. Held at the right
                // edge it lined up into a column of its own and read as a
                // property of the list rather than of this row.
                Row(mainAxisSize: MainAxisSize.min, children: [
                  // Flexible, so a long WO number gives way to the pill rather
                  // than pushing it off the end.
                  Flexible(
                    child: Text(
                      wo.woNumber,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: RunqText.caption.copyWith(color: t.ink),
                    ),
                  ),
                  const SizedBox(width: 6),
                  MfgStatusPill(status: wo.status),
                ]),
                if ((wo.shift ?? '').isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(wo.shift!, style: RunqText.micro.copyWith(color: t.muted2)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          // Bare number: the product line above already states the unit, and
          // every run under it shares that unit by construction — the uom is
          // part of the grouping key. `unit:` stays because it decides how the
          // figure is formatted, not whether it is labelled.
          //
          // An em dash, not a zero: a run that has not reported is not a run
          // that made nothing.
          Text(
            made ? formatItemQty(wo.outputQty, null, unit: wo.outputUom) : '—',
            style: RunqText.caption.copyWith(
              color: made ? t.ink : t.muted2,
              fontWeight: FontWeight.w600,
            ),
          ),
        ]),
      ),
    );
  }
}

/// Today, as the section heading writes it: `8 Sep`.
String _headerDate() {
  final d = DateTime.now();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return '${d.day} ${months[d.month - 1]}';
}

/// The day a run was actually worked, falling back to the day it was planned.
///
/// "Today's work orders" filters on `activeOn`, which deliberately matches a
/// run scheduled earlier that was started, finished or closed today — a run
/// planned on the 24th and made this morning belongs to today. Showing
/// `scheduledFor` for those put a days-old date under a "Today's" heading.
///
/// Converted to local time first: the timestamps arrive in UTC and the server
/// buckets them by IST, so a late-evening run would otherwise read as
/// yesterday. A run that has not started yet has no activity date and keeps
/// its schedule.
String _activeDate(WorkOrderListRow wo) {
  final iso = wo.closedAt ?? wo.completedAt ?? wo.startedAt;
  final at = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (at == null) return wo.scheduledFor;
  final mm = at.month.toString().padLeft(2, '0');
  final dd = at.day.toString().padLeft(2, '0');
  return '${at.year}-$mm-$dd';
}
