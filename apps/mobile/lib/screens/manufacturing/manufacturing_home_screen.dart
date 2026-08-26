import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/notifications_repo.dart';
import '../../providers/auth_provider.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../inventory/widgets/inv_primitives.dart' show compactINR;
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/module_switcher.dart';
import '../../widgets/profile_avatar_button.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_doc_list.dart';
import 'widgets/mfg_primitives.dart';

part '_mfg_home_hero.dart';

/// Manufacturing home screen.
///
/// Visual rhythm matches `purchase_home_screen.dart` (per /module-ui skill
/// §Step 3 "Home" archetype): top bar with switcher + bell, greeting with
/// date + first name, gradient hero KPI strip, perishables + raw-material
/// sections, recent work orders card. Actions live on the centre FAB and the
/// Menu sheet, not in a grid the bottom nav already duplicates.

/// The home card is a glance, not a list — anything past this many rows is
/// reached through "See all" rather than scrolled past on the way to the rest
/// of the page.
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
              ref.refresh(invExpiringProvider(2).future),
              ref.refresh(invOnHandProvider((
                warehouseId: null,
                lowOnly: false,
                itemClassGroup: 'inputs',
              )).future),
              // The bell reads scopedUnreadCountProvider, which derives from
              // this — it was never refreshed before, so the count went stale.
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
              // Perishable raw-material batches expiring in the next 2 days
              // (or already expired). Hidden when nothing's on the clock, so
              // non-perishable tenants don't see noise. Driven by the same
              // /inventory/stock/expiring endpoint as the web Mfg tile.
              const _PerishablesSection(),
              // What a run can actually consume. Previously this was only
              // answerable by leaving for the Inventory module, which is the
              // wrong place to be standing when writing a BOM.
              const _RawMaterialsSection(),
              // "See all" lives on the header, matching Perishables and Raw
              // materials above. The card used to carry it as a footer, which
              // put the escape hatch ten rows down the page.
              MfgSectionHeader(
                label: showingFallback ? 'Recent work orders' : "Today's work orders",
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
                        title: 'No work orders yet',
                        description:
                            'Schedule a run, or log what was made without one.',
                        action: MfgPrimaryButton(
                          label: 'New WO',
                          icon: Icons.add_rounded,
                          onPressed: () => context.push('/manufacturing/wos/new'),
                        ),
                      );
                    }
                    final top = res.data.take(_recentWoLimit).toList();
                    return MfgDividedCard(
                      children: [
                        for (final wo in top)
                          MfgDocListTile(
                            flat: true,
                            icon: Icons.precision_manufacturing_outlined,
                            // Every row here is today, so the date block would
                            // repeat identically down the card. Shift is what
                            // separates one run from the next; the date falls
                            // back in only when a run carries no shift.
                            leadingDate: wo.scheduledFor,
                            leadingShift: showingFallback ? null : wo.shift,
                            title: wo.woNumber,
                            subtitle: wo.bomName,
                            status: wo.status,
                            headline: wo.outputItemName,
                            rightValue: _fmtQty(wo.plannedQty),
                            rightUnit: wo.outputUom,
                            reference: wo.woNumber,
                            onTap: () => context.push('/manufacturing/wos/${wo.id}'),
                          ),
                      ],
                    );
                  },
                ),
              ),
              // "This week" is a look-back, not something to act on — it sits
              // after the operational sections (what's expiring, what's on
              // do, what's on hand, today's runs) rather than above them.
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

// ── Perishables section ───────────────────────────────────────────────────
//
// Raw-material batches near expiry. Hides itself entirely when nothing is on
// the clock, so non-perishable tenants see no empty card and no header.
class _PerishablesSection extends ConsumerWidget {
  const _PerishablesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Window of 2 days + includeExpired = the dairy operator's daily horizon:
    // "what's at risk if I don't run a WO now."
    final async = ref.watch(invExpiringProvider(2));
    return async.maybeWhen(
      data: (rows) {
        if (rows.isEmpty) return const SizedBox.shrink();
        // Group batches by item: one tile shows total-on-hand + a per-batch
        // expiry breakdown, so the planner sees "how much A1 milk total"
        // without losing which slice expires first (FEFO). Groups are sorted
        // soonest-expiry-first.
        final groups = _groupPerishables(rows);
        final top = groups.take(5).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MfgSectionHeader(
              label: 'Perishables on-hand',
              trailing: TextButton(
                onPressed: () => context.push('/inventory/reports/expiry'),
                child: Text(
                  groups.length > top.length ? 'See all (${groups.length}) →' : 'See all →',
                  style: RunqText.caption.copyWith(color: MfgColors.brand(context)),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                children: [
                  for (final g in top)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _PerishableGroupTile(group: g),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

/// One item's expiring stock, aggregated across its batches.
class _PerishableGroup {
  final String itemId;
  final String itemName;
  final String? itemUnit;

  /// Batches sorted soonest-expiry first (FEFO order).
  final List<InvExpiringBatch> batches;
  const _PerishableGroup(this.itemId, this.itemName, this.itemUnit, this.batches);

  double get totalQty => batches.fold(0.0, (s, b) => s + b.qty);
  int get soonest => batches.first.daysToExpiry;
}

/// Collapse expiring batches into per-item groups: each group's batches are
/// FEFO-sorted, and groups are ordered by their soonest-expiring batch so the
/// most-at-risk item sits on top.
List<_PerishableGroup> _groupPerishables(List<InvExpiringBatch> rows) {
  final byItem = <String, List<InvExpiringBatch>>{};
  for (final r in rows) {
    (byItem[r.itemId] ??= []).add(r);
  }
  return byItem.values.map((b) {
    final sorted = [...b]..sort((x, y) => x.daysToExpiry.compareTo(y.daysToExpiry));
    final f = sorted.first;
    return _PerishableGroup(f.itemId, f.itemName, f.itemUnit, sorted);
  }).toList()
    ..sort((a, b) => a.soonest.compareTo(b.soonest));
}

/// Urgency pill colours/label off days-to-expiry — red = today/expired,
/// amber = tomorrow+.
(Color, Color, String) _perishUrgency(int days) {
  if (days < 0) return (MfgColors.errorBg, MfgColors.error, 'Expired');
  if (days == 0) return (MfgColors.errorBg, MfgColors.error, 'Today');
  if (days == 1) return (MfgColors.orangeAlertBg, MfgColors.orangeAlert, 'Tomorrow');
  return (MfgColors.orangeAlertBg, MfgColors.orangeAlert, '${days}d');
}

/// Grouped perishables tile: item header + total-on-hand pill, then a
/// per-batch FEFO breakdown when more than one batch exists. The headline
/// urgency pill tracks the SOONEST batch — that's the run-now signal a single
/// blended total would hide. Tap = jump into WO create.
class _PerishableGroupTile extends StatelessWidget {
  final _PerishableGroup group;
  const _PerishableGroupTile({required this.group});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final (bg, fg, label) = _perishUrgency(group.soonest);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => context.push('/manufacturing/wos/new'),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: MfgColors.roseSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.inventory_2_outlined, color: brand, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(child: _body(t, bg, fg, label)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(RunqTokens t, Color bg, Color fg, String label) {
    final multi = group.batches.length > 1;
    final first = group.batches.first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header: item name + headline (soonest-batch) urgency pill.
        Row(
          children: [
            Expanded(
              child: Text(
                group.itemName,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 6),
            _pill(label, bg, fg),
          ],
        ),
        const SizedBox(height: 6),
        // Total-on-hand line: solid rose qty pill + batch count (or, for a
        // single batch, its warehouse/batch meta inline — no redundant list).
        Wrap(
          spacing: 6,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _qtyPill('${_fmtQty(group.totalQty)} ${group.itemUnit ?? ''}'.trim()),
            Text(
              multi
                  ? '${group.batches.length} batches'
                  : '${first.warehouseName}'
                      '${first.batchNo.isEmpty ? '' : ' · ${first.batchNo}'}',
              style: RunqText.caption.copyWith(color: t.muted),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        // Per-batch FEFO breakdown — only when it adds information.
        if (multi) ...[
          const SizedBox(height: 8),
          for (final b in group.batches) _batchRow(t, b),
        ],
      ],
    );
  }

  Widget _batchRow(RunqTokens t, InvExpiringBatch b) {
    final (bg, fg, label) = _perishUrgency(b.daysToExpiry);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Container(
            width: 4, height: 4,
            margin: const EdgeInsets.only(left: 2, right: 8),
            decoration: BoxDecoration(color: t.muted, shape: BoxShape.circle),
          ),
          Text(
            '${_fmtQty(b.qty)} ${b.itemUnit ?? ''}'.trim(),
            style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w600),
          ),
          const SizedBox(width: 6),
          _pill(label, bg, fg),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '${b.warehouseName}${b.batchNo.isEmpty ? '' : ' · ${b.batchNo}'}',
              style: RunqText.caption.copyWith(color: t.muted),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill(String label, Color bg, Color fg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
        child: Text(
          label,
          style: RunqText.caption.copyWith(color: fg, fontWeight: FontWeight.w600),
        ),
      );

  // Saturated rose (not theme-aware brand(), which flips to roseLight in dark
  // mode and would wash out white text). Per palette: rose is the solid-fill
  // token for light-text pills.
  Widget _qtyPill(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: MfgColors.rose,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          text,
          style: RunqText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        ),
      );
}

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


// ── Raw materials on hand ─────────────────────────────────────────────────

/// The inputs a work order can draw from, rolled up per item. Tapping an item
/// reveals its batches in place — jumping to the Inventory module to answer
/// "which batches?" loses your place in the middle of planning a run.
///
/// `inputs` is the item-class group covering raw_material + packaging, i.e.
/// exactly the set consumption pulls from.
class _RawMaterialsSection extends ConsumerStatefulWidget {
  const _RawMaterialsSection();
  @override
  ConsumerState<_RawMaterialsSection> createState() => _RawMaterialsSectionState();
}

class _RawMaterialsSectionState extends ConsumerState<_RawMaterialsSection> {
  final _expanded = <String>{};

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = ref
            .watch(invOnHandProvider(
                (warehouseId: null, lowOnly: false, itemClassGroup: 'inputs')))
            .asData
            ?.value ??
        const <InvOnHandRow>[];
    if (rows.isEmpty) return const SizedBox.shrink();

    // Batches grouped under their item, biggest holding first.
    final byItem = <String, List<InvOnHandRow>>{};
    for (final r in rows) {
      byItem.putIfAbsent(r.itemId, () => []).add(r);
    }
    final itemIds = byItem.keys.toList()
      ..sort((x, y) => _qtyOf(byItem[y]!).compareTo(_qtyOf(byItem[x]!)));

    return Column(children: [
      MfgSectionHeader(
        label: 'Raw materials on hand',
        trailing: TextButton(
          onPressed: () => context.push('/manufacturing/raw-materials'),
          child: Text('See all →',
              style: RunqText.caption.copyWith(color: MfgColors.brand(context))),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: MfgCard(
          child: Column(children: [
            for (var i = 0; i < itemIds.length; i++) ...[
              if (i > 0) Divider(color: t.hairline, height: 24),
              ..._itemBlock(t, itemIds[i], byItem[itemIds[i]]!),
            ],
          ]),
        ),
      ),
      const SizedBox(height: 8),
    ]);
  }

  static double _qtyOf(List<InvOnHandRow> rs) =>
      rs.fold<double>(0, (sum, r) => sum + r.qty);

  List<Widget> _itemBlock(RunqTokens t, String itemId, List<InvOnHandRow> batches) {
    final first = batches.first;
    final qty = _qtyOf(batches);
    final value = batches.fold<double>(0, (sum, r) => sum + r.value);
    final unit = first.itemUnit != null && first.itemUnit!.isNotEmpty ? ' ${first.itemUnit}' : '';
    final open = _expanded.contains(itemId);
    return [
      InkWell(
        onTap: () => setState(() {
          if (open) {
            _expanded.remove(itemId);
          } else {
            _expanded.add(itemId);
          }
        }),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(first.itemName,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.body.copyWith(color: t.ink)),
                Text('${batches.length} batch${batches.length == 1 ? '' : 'es'}',
                    style: RunqText.micro.copyWith(color: t.muted)),
              ]),
            ),
            const SizedBox(width: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${_trimQty(qty)}$unit',
                  style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
              // Uncosted stock is worth surfacing: anything made from it carries
              // an understated cost.
              Text(value > 0 ? compactINR(value) : 'not costed',
                  style: RunqText.micro.copyWith(color: t.muted)),
            ]),
            Icon(open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                size: 20, color: t.muted2),
          ]),
        ),
      ),
      if (open)
        for (final b in batches)
          Padding(
            padding: const EdgeInsets.only(left: 8, bottom: 6),
            child: Row(children: [
              Icon(Icons.label_outline_rounded, size: 13, color: t.muted2),
              const SizedBox(width: 6),
              Expanded(
                child: Text(b.batchNo.isEmpty ? 'No batch' : b.batchNo,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: RunqText.micro.copyWith(color: t.muted)),
              ),
              Text(b.warehouseName,
                  style: RunqText.micro.copyWith(color: t.muted2)),
              const SizedBox(width: 8),
              Text('${_trimQty(b.qty)}$unit',
                  style: RunqText.micro.copyWith(color: t.ink)),
            ]),
          ),
    ];
  }

  static String _trimQty(double v) =>
      v == v.truncateToDouble() ? v.toInt().toString() : v.toStringAsFixed(3);
}


/// Date and shift, on their own line beneath the WO number so neither truncates.
String _fmtQty(double v) =>
    v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
