import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'mp_context_provider.dart';
import 'mp_payout_providers.dart';
import 'transfer_providers.dart';

/// Every provider holding node-scoped operational data — collection, transfer,
/// closure and payout figures that one centre's actions can change for another.
///
/// These are plain (non-autoDispose) families, so a mode the operator has left
/// keeps its last answer cached for the life of the process. An operator who
/// runs a CC *and* the PP it feeds would dispatch a tanker in CC mode and find
/// PP mode still showing the pre-dispatch queue, because nothing invalidates a
/// provider keyed by the destination node. [refreshMpNodeData] drops the lot on
/// every mode switch, so each shell opens against the server rather than
/// against whatever was true when it was last on screen.
///
/// Invalidating a family clears ALL its keys, and a provider with no listeners
/// is merely dropped — only what the incoming shell actually watches refetches,
/// so the switch costs one round of requests for the mode being entered.
///
/// ADD NEW NODE-SCOPED PROVIDERS HERE. Anything left out silently keeps serving
/// stale data across a mode switch, which is the bug this list exists to close.
/// Deliberately excluded: identity, config and device state (auth, locale,
/// theme, sync queue, notifications, operator/assigned node lists) — those are
/// not per-centre, and refetching them on every hop is waste.
final _mpNodeDataProviders = <ProviderOrFamily>[
  // ── transfer_providers.dart — consignment legs, availability, closures ──
  nodeInboundConsignmentsProvider,
  nodePendingInboundProvider,
  nodeInboundByDateProvider,
  nodeReceivedRangeProvider,
  nodeReceivedDailyProvider,
  nodeReceivedDayDetailProvider,
  nodeDaySummaryProvider,
  nodeOutboundConsignmentsProvider,
  nodeOutboundForDateProvider,
  nodeDispatchedRangeProvider,
  nodeAvailabilityProvider,
  nodeAvailabilityForDateProvider,
  pendingDispatchProvider,
  shiftStatusProvider,
  shiftStatusForDateProvider,
  nodesByTypeProvider,
  recentQcTestsProvider,
  ccVmccCollectionsProvider,
  receiptRateProvider,

  // ── mp_context_provider.dart — pours, summaries, farmers, bands ──
  nodeFarmersProvider,
  nodeTodaySummaryProvider,
  tenantTodaySummaryProvider,
  nodeSummaryForDateProvider,
  nodePoursDailyProvider,
  nodeTodayPoursProvider,
  nodePoursForDateProvider,
  nodeHistoryPoursProvider,
  farmerHistoryPoursProvider,
  qualityBandsProvider,

  // ── mp_payout_providers.dart — cycles and ledgers, per centre ──
  nodeCyclesProvider,
  cycleDetailProvider,
  farmerLedgerProvider,
  recentCyclePeriodsProvider,
  operatorPayoutComputeProvider,
];

/// Providers in the MP provider files that are deliberately NOT refreshed on a
/// centre switch: identity, the switch mechanism itself, and network/roster
/// lookups that do not describe a centre's day. Kept explicit so
/// `mp_refresh_test` can prove every MP provider was classified one way or the
/// other, rather than missed.
const mpRefreshExemptProviders = <String>{
  'mpActiveNodeProvider',
  'activeNodeRestoreConsumedProvider',
  'restoredActiveNodeProvider',
  'mpViewAsFarmerProvider',
  'tenantFarmersProvider',
  'operatorAssignedNodesProvider',
  'operatorNodesProvider',
  'operatorSelfProvider',
  'primaryNodeProvider',
};

/// Names of the providers in [_mpNodeDataProviders], for the same test. Riverpod
/// providers carry no reliable runtime name, so the roster is spelled out.
const mpRefreshedProviderNames = <String>{
  'nodeInboundConsignmentsProvider',
  'nodePendingInboundProvider',
  'nodeInboundByDateProvider',
  'nodeReceivedRangeProvider',
  'nodeReceivedDailyProvider',
  'nodeReceivedDayDetailProvider',
  'nodeDaySummaryProvider',
  'nodeOutboundConsignmentsProvider',
  'nodeOutboundForDateProvider',
  'nodeDispatchedRangeProvider',
  'nodeAvailabilityProvider',
  'nodeAvailabilityForDateProvider',
  'pendingDispatchProvider',
  'shiftStatusProvider',
  'shiftStatusForDateProvider',
  'nodesByTypeProvider',
  'recentQcTestsProvider',
  'ccVmccCollectionsProvider',
  'receiptRateProvider',
  'nodeFarmersProvider',
  'nodeTodaySummaryProvider',
  'tenantTodaySummaryProvider',
  'nodeSummaryForDateProvider',
  'nodePoursDailyProvider',
  'nodeTodayPoursProvider',
  'nodePoursForDateProvider',
  'nodeHistoryPoursProvider',
  'farmerHistoryPoursProvider',
  'qualityBandsProvider',
  'nodeCyclesProvider',
  'cycleDetailProvider',
  'farmerLedgerProvider',
  'recentCyclePeriodsProvider',
  'operatorPayoutComputeProvider',
};

/// Drop every cached node-scoped figure. Call when the operated centre changes;
/// the next shell then reads fresh. Safe to call from a listener — invalidation
/// is deferred to the end of the frame by Riverpod.
void refreshMpNodeData(WidgetRef ref) {
  for (final p in _mpNodeDataProviders) {
    ref.invalidate(p);
  }
}
