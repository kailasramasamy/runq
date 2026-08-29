// Guards the notification deep-link contract: every targetUrl the API emits
// must resolve, after resolveNotificationTarget(), to a route this app
// actually serves. A target that misses lands the reader on an error page —
// and one that resolves into the ShellRoute must be reached with go(), not
// push(), or the shell's GlobalKey lands in the stack twice and renders blank.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:runq_mobile/router.dart';

/// Every literal targetUrl in apps/api (runq-scoped sources only; `mp_*`
/// targets belong to Dhenu and are checked in that app).
const _apiTargets = <String>[
  '/hr/announcements',
  '/hr/attendance-punches',
  '/hr/directory',
  '/hr/expense-claims',
  '/hr/expense-claims/00000000-0000-0000-0000-000000000001',
  '/hr/fnf',
  '/hr/helpdesk',
  '/hr/leave-requests',
  '/hr/loans',
  '/hr/onboarding',
  '/hr/pay',
  '/hr/payroll-runs/00000000-0000-0000-0000-000000000001',
  '/hr/performance',
  '/hr/regularizations',
  '/hr/rewards/00000000-0000-0000-0000-000000000001',
  '/hr/tax-declarations',
  '/hr/tds-challans',
  '/inventory/alerts',
  '/inventory/alerts?status=low',
  '/inventory/alerts?status=out',
  '/inventory/shortages',
];

void main() {
  late ProviderContainer container;
  late GoRouter router;

  setUp(() {
    // The router's auth listenable restores a session from SharedPreferences.
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    container = ProviderContainer();
    router = container.read(routerProvider);
  });

  tearDown(() => container.dispose());

  test('every API notification target resolves to a real route', () {
    for (final target in _apiTargets) {
      final resolved = resolveNotificationTarget(target);
      final match = router.configuration.findMatch(Uri.parse(resolved));
      expect(
        match.isError,
        isFalse,
        reason: '$target -> $resolved has no route (${match.error})',
      );
      expect(match.matches, isNotEmpty,
          reason: '$target -> $resolved matched nothing');
    }
  });

  test('detail targets keep their id instead of collapsing to a list', () {
    expect(
      resolveNotificationTarget('/hr/expense-claims/abc'),
      '/hr/expense-claims/abc',
    );
    expect(
      resolveNotificationTarget('/hr/payroll-runs/abc'),
      '/hr/payroll-runs/abc',
    );
    // No mobile detail screen for a reward — the list is the best landing.
    expect(resolveNotificationTarget('/hr/rewards/abc'), '/hr/rewards');
  });

  test('aliases merge their own query with the incoming one', () {
    expect(
      resolveNotificationTarget('/hr/expense-claims?status=pending'),
      '/hr/pay?tab=expenses&status=pending',
    );
  });
}
