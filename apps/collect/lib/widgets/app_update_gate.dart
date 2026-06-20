import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/app_update_provider.dart';
import '../screens/update/update_required_screen.dart';

/// Wraps the whole app (in [MaterialApp.router]'s `builder`) and replaces it
/// with a blocking update screen when the running build is below the server's
/// `dhenu.minVersion`. Route-independent, so it can't be bypassed by deep
/// links. Fails open: while loading or on any error it shows [child].
class AppUpdateGate extends ConsumerWidget {
  const AppUpdateGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(appUpdateStatusProvider).valueOrNull;
    if (status != null && status.forceUpdate && status.config != null) {
      return UpdateRequiredScreen(config: status.config!);
    }
    return child;
  }
}
