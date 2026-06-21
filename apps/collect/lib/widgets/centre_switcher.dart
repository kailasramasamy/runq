import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_card.dart';
import 'dhenu_states.dart';
import 'sheet_grabber.dart';

/// Tier label for a node — the "mode" the app runs in for it.
String nodeTierLabel(MpNode n) => n.isPp ? 'PP' : (n.isCc ? 'CC' : 'VMCC');

/// Tier icon, matching each home's iconography (store/snowflake/tanker).
IconData nodeTierIcon(MpNode n) => _iconForType(n.nodeType);

IconData _iconForType(String type) =>
    type == 'pp' ? DhenuIcons.tankers : (type == 'cc' ? DhenuIcons.snowflake : DhenuIcons.store);

String _titleForType(String type) => type == 'pp'
    ? 'Processing plants'
    : (type == 'cc' ? 'Chilling centres' : 'Village collection centres');

/// A slim "tier · name ▾ Switch" bar shown at the top of an admin's shell —
/// the active centre plus a tap target to change it. Only built for admins
/// (owner/accountant/viewer) — a
/// field-operator's single-node shell never gets one.
class CentreSwitcherBar extends ConsumerWidget {
  const CentreSwitcherBar({super.key, required this.node});
  final MpNode node;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Material(
      color: t.brandSubtle,
      child: InkWell(
        onTap: () => showCentreSwitcher(context, ref),
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
            Text('Switch',
                style: DhenuText.caption.copyWith(color: t.brand, fontWeight: FontWeight.w700)),
          ]),
        ),
      ),
    );
  }
}

/// Opens the centre switcher — every centre grouped by tier, current one ticked.
/// Picking one sets [mpActiveNodeProvider] and pops.
Future<void> showCentreSwitcher(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _CentreSwitcherSheet(),
  );
}

class _CentreSwitcherSheet extends ConsumerWidget {
  const _CentreSwitcherSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
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
            child: Text('Switch centre', style: DhenuText.h2.copyWith(color: t.ink)),
          ),
        ),
        Flexible(
          child: CentrePickerList(
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

/// The grouped, tappable list of every centre — VMCC / CC / PP sections.
/// Shared by the first-run picker screen and the in-shell switcher sheet.
class CentrePickerList extends ConsumerWidget {
  const CentrePickerList({super.key, required this.onPick, this.currentId});
  final ValueChanged<MpNode> onPick;
  final String? currentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return ref.watch(operatorNodesProvider).when(
          loading: () => const DhenuLoadingList(rows: 4),
          error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: 'Could not load centres', subtitle: '$e'),
          data: (nodes) {
            final active = nodes.where((n) => n.isActive).toList();
            if (active.isEmpty) {
              return const DhenuEmptyState(
                icon: DhenuIcons.store,
                title: 'No centres yet',
                subtitle: 'Add VMCCs, chilling centres or plants in the web admin first',
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.screen, 0, DhenuSpacing.screen, DhenuSpacing.lg),
              children: [
                for (final type in const ['vmcc', 'cc', 'pp'])
                  ..._section(t, type, active.where((n) => n.nodeType == type).toList()),
              ],
            );
          },
        );
  }

  List<Widget> _section(DhenuTokens t, String type, List<MpNode> nodes) {
    if (nodes.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.only(top: DhenuSpacing.lg, bottom: DhenuSpacing.sm),
        child: Text(_titleForType(type).toUpperCase(),
            style: DhenuText.label.copyWith(color: t.inkSoft, letterSpacing: 0.5)),
      ),
      DhenuCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var i = 0; i < nodes.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.hairline),
            _row(t, nodes[i]),
          ],
        ]),
      ),
    ];
  }

  Widget _row(DhenuTokens t, MpNode n) {
    final selected = n.id == currentId;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => onPick(n),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          child: Row(children: [
            Container(
              width: 38,
              height: 38,
              decoration:
                  BoxDecoration(color: t.brand.withValues(alpha: 0.10), shape: BoxShape.circle),
              child: Icon(_iconForType(n.nodeType), size: 20, color: t.brand),
            ),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(n.name,
                    style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(n.code, style: DhenuText.caption.copyWith(color: t.inkSoft)),
              ]),
            ),
            Icon(selected ? DhenuIcons.check : DhenuIcons.chevronRight,
                size: 20, color: selected ? t.brand : t.inkSoft),
          ]),
        ),
      ),
    );
  }
}
