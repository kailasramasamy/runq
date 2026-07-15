import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'centre_switcher.dart' show nodeTierLabel, nodeTierIcon;
import 'dhenu_card.dart';
import 'dhenu_states.dart';
import 'sheet_grabber.dart';

/// Tier role description for the secondary card line (CC/PP cards, where a pour
/// "today" total isn't meaningful).
String operatorNodeRole(AppLocalizations l, MpNode n) => n.isPp
    ? l.operatorSwitchRolePp
    : (n.isCc ? l.operatorSwitchRoleCc : l.operatorSwitchRoleVmcc);

/// The directly-assigned-node list, shared by the full-screen selector and the
/// in-shell switcher sheet. One tappable card per node; a VMCC card also shows
/// today's collected litres + farmer count.
class OperatorNodeList extends ConsumerWidget {
  const OperatorNodeList({super.key, required this.onPick, this.currentId});

  final ValueChanged<MpNode> onPick;
  final String? currentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return ref.watch(operatorAssignedNodesProvider).when(
          loading: () => const Padding(
            padding: EdgeInsets.all(DhenuSpacing.screen),
            child: DhenuLoadingList(rows: 2),
          ),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: l.operatorSwitchLoadError, subtitle: '$e'),
          data: (nodes) {
            final active = nodes.where((n) => n.isActive).toList();
            if (active.isEmpty) {
              return DhenuEmptyState(
                icon: DhenuIcons.store,
                title: l.operatorSwitchNoneTitle,
                subtitle: l.operatorSwitchNoneSubtitle,
              );
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.bottomGap),
              itemCount: active.length,
              separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.md),
              itemBuilder: (_, i) => _NodeCard(
                node: active[i],
                selected: active[i].id == currentId,
                onTap: () => onPick(active[i]),
              ),
            );
          },
        );
  }
}

class _NodeCard extends ConsumerWidget {
  const _NodeCard({required this.node, required this.selected, required this.onTap});

  final MpNode node;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return DhenuCard(
      elevated: true,
      onTap: onTap,
      child: Row(children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: t.brandSubtle, shape: BoxShape.circle),
          child: Icon(nodeTierIcon(node), size: 22, color: t.brand),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(node.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DhenuText.title.copyWith(color: t.ink)),
            const SizedBox(height: 2),
            Text('${nodeTierLabel(node)} · ${node.code}',
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const SizedBox(height: DhenuSpacing.xs),
            _subtitle(context, ref, t),
          ]),
        ),
        const SizedBox(width: DhenuSpacing.sm),
        Icon(selected ? DhenuIcons.check : DhenuIcons.arrowRight, size: 20, color: t.brand),
      ]),
    );
  }

  /// VMCC → today's collection snapshot (brand-tinted); CC/PP → tier role.
  Widget _subtitle(BuildContext context, WidgetRef ref, DhenuTokens t) {
    final l = AppLocalizations.of(context);
    if (!node.isVmcc) {
      return Text(operatorNodeRole(l, node), style: DhenuText.caption.copyWith(color: t.inkSoft));
    }
    return ref.watch(nodeTodaySummaryProvider(node.id)).when(
          loading: () => Text(l.operatorSwitchTodayLoading, style: DhenuText.caption.copyWith(color: t.inkSoft)),
          error: (_, _) => Text(operatorNodeRole(l, node), style: DhenuText.caption.copyWith(color: t.inkSoft)),
          data: (s) {
            if (s == null || s.totalQty == 0) {
              return Text(l.operatorSwitchNoCollection, style: DhenuText.caption.copyWith(color: t.inkSoft));
            }
            return Text(
              l.operatorSwitchTodaySummary(litres(s.totalQty, unit: true), s.farmerCount),
              style: DhenuText.label.copyWith(color: t.brand),
            );
          },
        );
  }
}

/// Slim "tier · name ▾ Switch" bar pinned above a multi-node operator's shell —
/// the active centre plus a tap target to change it. Passed to RoleShell as its
/// optional header.
class OperatorSwitcherBar extends ConsumerWidget {
  const OperatorSwitcherBar({super.key, required this.node});

  final MpNode node;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Material(
      color: t.brandSubtle,
      child: InkWell(
        onTap: () => showOperatorSwitcher(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.screen, vertical: DhenuSpacing.sm),
          child: Row(children: [
            Icon(nodeTierIcon(node), size: 16, color: t.brand),
            const SizedBox(width: DhenuSpacing.sm),
            Flexible(
              child: Text(
                '${nodeTierLabel(node)} · ${node.name}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700),
              ),
            ),
            Icon(DhenuIcons.chevronDown, size: 18, color: t.brand),
            const Spacer(),
            Text(l.operatorSwitchButton,
                style: DhenuText.caption.copyWith(color: t.brand, fontWeight: FontWeight.w700)),
          ]),
        ),
      ),
    );
  }
}

/// Opens the operator switcher — their directly-assigned centres, current one
/// ticked. Picking sets [mpActiveNodeProvider] and pops.
Future<void> showOperatorSwitcher(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _OperatorSwitcherSheet(),
  );
}

class _OperatorSwitcherSheet extends ConsumerWidget {
  const _OperatorSwitcherSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final current = ref.watch(mpActiveNodeProvider);
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.78),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SheetGrabber(),
        Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.screen, 0, DhenuSpacing.screen, DhenuSpacing.sm),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(l.adminSwitchSheetTitle, style: DhenuText.h2.copyWith(color: t.ink)),
          ),
        ),
        Flexible(
          child: OperatorNodeList(
            currentId: current?.id,
            onPick: (n) {
              ref.read(mpActiveNodeProvider.notifier).state = n;
              Navigator.of(context).pop();
            },
          ),
        ),
      ]),
    );
  }
}
