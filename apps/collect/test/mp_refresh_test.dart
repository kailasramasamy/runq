import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:dhenu/providers/mp_refresh.dart';

/// A centre switch refreshes only the providers named in [mpRefreshedProviderNames].
/// A node-scoped provider added later but left out of that roster would silently
/// keep serving another centre's stale figures — the exact bug the refresh
/// exists to close, and one no runtime test would catch.
///
/// So: every provider declared in the MP provider files must be classified as
/// either refreshed or explicitly exempt. Adding one without deciding which
/// fails here, with the name to classify.
const _providerFiles = [
  'lib/providers/mp_context_provider.dart',
  'lib/providers/transfer_providers.dart',
  'lib/providers/mp_payout_providers.dart',
];

final _declaration = RegExp(r'^final\s+([a-zA-Z_][a-zA-Z0-9_]*Provider)\b', multiLine: true);

Set<String> _declaredProviders() {
  final names = <String>{};
  for (final path in _providerFiles) {
    final file = File(path);
    expect(file.existsSync(), isTrue,
        reason: '$path moved — update _providerFiles in this test');
    for (final m in _declaration.allMatches(file.readAsStringSync())) {
      names.add(m.group(1)!);
    }
  }
  return names;
}

void main() {
  test('every MP provider is either refreshed on centre switch or exempt', () {
    final declared = _declaredProviders();
    expect(declared, isNotEmpty);

    final classified = {...mpRefreshedProviderNames, ...mpRefreshExemptProviders};
    final unclassified = declared.difference(classified);
    expect(unclassified, isEmpty,
        reason: 'New MP provider(s) ${unclassified.toList()..sort()} — add each to '
            '_mpNodeDataProviders (node-scoped data) or mpRefreshExemptProviders '
            '(identity/config) in lib/providers/mp_refresh.dart');
  });

  test('the refresh roster names only providers that still exist', () {
    final declared = _declaredProviders();
    final stale = mpRefreshedProviderNames.difference(declared);
    expect(stale, isEmpty,
        reason: 'Renamed or deleted: ${stale.toList()..sort()}');
    final staleExempt = mpRefreshExemptProviders.difference(declared);
    expect(staleExempt, isEmpty,
        reason: 'Renamed or deleted: ${staleExempt.toList()..sort()}');
  });

  test('a provider is not both refreshed and exempt', () {
    final both = mpRefreshedProviderNames.intersection(mpRefreshExemptProviders);
    expect(both, isEmpty, reason: 'Classified twice: ${both.toList()..sort()}');
  });

  // The roster is hand-maintained alongside the typed list it mirrors; a
  // count mismatch means one was edited without the other.
  test('the destination the reported bug hinged on is refreshed', () {
    expect(mpRefreshedProviderNames, contains('nodePendingInboundProvider'));
    expect(mpRefreshedProviderNames, contains('nodeInboundConsignmentsProvider'));
    expect(mpRefreshedProviderNames, contains('pendingDispatchProvider'));
  });
}
