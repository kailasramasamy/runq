import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/centre_switcher.dart';
import '../widgets/dhenu_states.dart';
import '../widgets/farmer_view.dart';
import '../widgets/operator_switcher.dart';
import 'admin/centre_picker_screen.dart';
import 'auth/splash_screen.dart';
import 'no_access_screen.dart';
import 'operator/operator_node_selector_screen.dart';
import 'vmcc/vmcc_shell.dart';
import 'cc/cc_shell.dart';
import 'pp/pp_shell.dart';
import 'farmer/farmer_shell.dart';

/// The `/home` destination — routes the signed-in user to their persona home.
/// Farmer/CC/PP/Admin homes are placeholders until their wave; VMCC + the
/// operator node-type resolution are real.
class HomeDispatcher extends ConsumerWidget {
  const HomeDispatcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (!auth.hasMilkProcurement) return const NoAccessScreen();
    switch (auth.persona) {
      case Persona.farmer:
        return const FarmerShell();
      case Persona.operator:
        return const _OperatorHome();
      case Persona.admin:
        return const _AdminHome();
      case Persona.unknown:
        return const NoAccessScreen();
    }
  }
}

/// Owner/accountant/viewer: pick a centre, then operate the app as that node's
/// VMCC/CC/PP. A switcher bar lets them hop between centres without logging out.
class _AdminHome extends ConsumerWidget {
  const _AdminHome();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // "View as farmer" takes precedence over any active centre.
    final farmer = ref.watch(mpViewAsFarmerProvider);
    if (farmer != null) return FarmerShell(header: FarmerViewBar(farmer: farmer));
    var node = ref.watch(mpActiveNodeProvider);
    if (node == null) {
      // Cold start: resume the last-operated centre (audit E7) instead of
      // dropping back to the picker. One-shot per session — an explicit "back
      // to picker" must not be overridden by the saved pick. While the lookup
      // runs, hold on the splash so the picker doesn't flash before restore.
      if (ref.watch(activeNodeRestoreConsumedProvider)) return const CentrePickerScreen();
      final restored = ref.watch(restoredActiveNodeProvider);
      if (restored.isLoading) return const SplashScreen(animate: false);
      final r = restored.asData?.value;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(activeNodeRestoreConsumedProvider.notifier).state = true;
        if (r != null) ref.read(mpActiveNodeProvider.notifier).state = r;
      });
      if (r == null) return const CentrePickerScreen();
      node = r;
    }
    final header = CentreSwitcherBar(node: node);
    if (node.isPp) return PpShell(node: node, header: header);
    if (node.isCc) return CcShell(node: node, header: header);
    return VmccShell(node: node, header: header);
  }
}

/// Resolves the operator's directly-assigned node(s) and shows the matching
/// dashboard. One assignment → land straight in its shell. More than one → a
/// node-selector landing screen, then the chosen shell with a switcher header.
class _OperatorHome extends ConsumerWidget {
  const _OperatorHome();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodes = ref.watch(operatorAssignedNodesProvider);
    return nodes.when(
      loading: () => const SplashScreen(animate: false),
      error: (e, _) => _OperatorError(message: e.toString()),
      data: (list) {
        final active = list.where((n) => n.isActive).toList();
        if (active.isEmpty) return const NoAccessScreen();
        // Single assignment: no picker, no switcher — land directly.
        if (active.length == 1) return _shellFor(active.single, null);
        // Multiple: pick which centre to operate. Guard against a stale pick
        // left over from a previous login (not in the current assigned set).
        final selected = ref.watch(mpActiveNodeProvider);
        final node = selected != null && active.any((n) => n.id == selected.id) ? selected : null;
        if (node == null) return const OperatorNodeSelectorScreen();
        return _shellFor(node, OperatorSwitcherBar(node: node));
      },
    );
  }
}

/// The persona shell for a node, with an optional header (the operator switcher).
Widget _shellFor(MpNode node, Widget? header) {
  if (node.isPp) return PpShell(node: node, header: header);
  if (node.isCc) return CcShell(node: node, header: header);
  return VmccShell(node: node, header: header);
}

class _OperatorError extends ConsumerWidget {
  const _OperatorError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(DhenuSpacing.xl),
          child: DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: l.homeCouldNotLoadCentre,
            subtitle: message,
            action: TextButton(
              onPressed: () => ref.invalidate(operatorNodesProvider),
              child: Text(l.commonRetry, style: DhenuText.label.copyWith(color: t.brand)),
            ),
          ),
        ),
      ),
    );
  }
}
