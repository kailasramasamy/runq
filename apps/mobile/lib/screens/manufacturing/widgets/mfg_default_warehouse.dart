// Pre-selecting the warehouse on a manufacturing form.
//
// Most plants run everything out of one warehouse, so making the operator pick
// it every time is a tap that can only be got wrong.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../providers/manufacturing_providers.dart';

/// Hand [set] the warehouse a form should start on, as soon as the list lands.
///
/// Call once from `initState`. [current] is read at that moment, so a form
/// restoring a saved selection keeps it — the default only fills a blank.
///
/// Two things this does that the obvious `await ref.read(provider.future)` did
/// not, and both of them are why the field sat on "Select warehouse":
///
///  * It *listens*. Reading `.future` off an autoDispose provider from
///    `initState` leaves it with no subscriber, so it is disposed the moment
///    the read returns and the await can simply never complete.
///  * It reads [mfgWarehousesProvider] — the same list the pickers on these
///    forms are now pointed at. The floor holds `manufacturing` and nothing
///    else, so `/inventory/warehouses` returns them nothing to default to.
void mfgApplyDefaultWarehouse(
  WidgetRef ref, {
  required String? Function() current,
  required void Function(String id) set,
}) {
  ref.listenManual(
    mfgWarehousesProvider,
    (_, next) {
      final list = next.valueOrNull;
      if (list == null || list.isEmpty || current() != null) return;
      // Falls back to the sole warehouse when none is flagged default — a
      // plant with one warehouse rarely bothers to flag it.
      set(list.firstWhere((w) => w.isDefault, orElse: () => list.first).id);
    },
    fireImmediately: true,
  );
}
