import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../providers/auth_provider.dart';
import '../providers/mp_context_provider.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/centre_switcher.dart';
import '../widgets/dhenu_states.dart';
import 'admin/centre_picker_screen.dart';
import 'auth/splash_screen.dart';
import 'no_access_screen.dart';
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
    final node = ref.watch(mpActiveNodeProvider);
    if (node == null) return const CentrePickerScreen();
    final header = CentreSwitcherBar(node: node);
    if (node.isPp) return PpShell(node: node, header: header);
    if (node.isCc) return CcShell(node: node, header: header);
    return VmccShell(node: node, header: header);
  }
}

/// Resolves the operator's assigned node and shows the matching dashboard.
class _OperatorHome extends ConsumerWidget {
  const _OperatorHome();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nodes = ref.watch(operatorNodesProvider);
    return nodes.when(
      loading: () => const SplashScreen(animate: false),
      error: (e, _) => _OperatorError(message: e.toString()),
      data: (list) {
        if (list.isEmpty) return const NoAccessScreen();
        // An operator's assignment now resolves to their whole subtree (a CC
        // also sees its child VMCCs). Land them on their management tier — the
        // highest node in the set: PP ▸ CC ▸ VMCC.
        final node = _primaryNode(list);
        if (node.isPp) return PpShell(node: node);
        if (node.isCc) return CcShell(node: node);
        return VmccShell(node: node);
      },
    );
  }
}

/// The node whose shell an operator lands on: the highest tier they manage.
MpNode _primaryNode(List<MpNode> nodes) {
  int rank(MpNode n) => n.isPp ? 3 : (n.isCc ? 2 : 1);
  return nodes.reduce((a, b) => rank(b) > rank(a) ? b : a);
}

class _OperatorError extends ConsumerWidget {
  const _OperatorError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(DhenuSpacing.xl),
          child: DhenuEmptyState(
            icon: DhenuIcons.cloudOff,
            title: 'Could not load your centre',
            subtitle: message,
            action: TextButton(
              onPressed: () => ref.invalidate(operatorNodesProvider),
              child: Text('Retry', style: DhenuText.label.copyWith(color: t.brand)),
            ),
          ),
        ),
      ),
    );
  }
}
