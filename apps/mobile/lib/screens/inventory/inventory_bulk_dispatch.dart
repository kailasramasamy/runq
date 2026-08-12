// "Dispatch all" — working the whole Awaiting-dispatch queue in one go.
//
// The queue is a server-side list, not the rows on screen: the list request
// is capped at 100 while the count behind it can be several hundred. So this
// pages the queue rather than shipping what happens to be loaded.
//
// Shape of the loop, and why:
//
//   * The server takes 25 ids per call and ships them strictly one after
//     another — two dispatches in flight race for the same batches. Chunking
//     is what keeps each request short enough to survive a proxy timeout and
//     gives us something to report progress against.
//   * A dispatched invoice leaves the queue, so page 1 refills as we work.
//     A *skipped* one doesn't — it sits there forever. Tracking the ids we
//     have already handled is what stops that from looping. When a whole
//     page is nothing but already-handled rows we step to the next page,
//     which is how a backlog of >100 skips still terminates.
//   * Cancel takes effect between batches. Everything already posted stays
//     posted: these are real stock movements, not a transaction to roll back.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/sales_dispatch_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../widgets/runq_snack.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

/// Ids per request. The server's own cap — raising it here only produces a
/// 400.
const _kBatch = 25;

/// Running totals, rebuilt into the progress dialog after every batch.
class _Progress {
  final int done, total, shipped, skipped, failed;
  const _Progress({
    required this.done,
    required this.total,
    this.shipped = 0,
    this.skipped = 0,
    this.failed = 0,
  });
}

/// One invoice that didn't ship, for the closing report.
typedef _Problem = ({String invoiceNumber, String reason, bool failed});

/// Confirms, runs, and reports. Returns true when anything was posted, so
/// the caller can refresh the queue.
Future<bool> runBulkDispatch(
  BuildContext context,
  WidgetRef ref, {
  required int pendingTotal,
  required String? from,
}) async {
  if (!await _confirm(context, pendingTotal)) return false;
  if (!context.mounted) return false;

  final progress = ValueNotifier(_Progress(done: 0, total: pendingTotal));
  final cancelled = ValueNotifier(false);

  final dialog = showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ProgressDialog(progress: progress, cancelled: cancelled),
  );

  _Progress result;
  List<_Problem> problems;
  String? fatal;
  try {
    (result, problems) = await _run(from: from, progress: progress, cancelled: cancelled);
  } on ApiException catch (e) {
    // The batch call itself failed — auth, network, a 400. Whatever shipped
    // before this point is still shipped, so report rather than pretend.
    result = progress.value;
    problems = const [];
    fatal = e.message;
  }

  if (context.mounted) Navigator.of(context).pop();
  await dialog;
  progress.dispose();
  cancelled.dispose();

  if (result.shipped > 0) ref.invalidate(invPendingDispatchProvider);
  if (context.mounted) {
    await _report(context, result, problems, fatal: fatal);
  }
  return result.shipped > 0;
}

/// The cut-over. Clears the queue without moving stock, for invoices raised
/// before inventory was ever tracked — there is nothing on hand to draw and
/// back-filling an opening balance to fit would invent a history.
///
/// Returns true when anything was waived.
Future<bool> runWaiveDispatch(
  BuildContext context,
  WidgetRef ref, {
  required int pendingTotal,
}) async {
  final t = RT(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Clear the queue without stock?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Marks every invoice up to today as settled outside inventory. '
            'No stock moves, no delivery notes, no cost postings — the '
            'invoices simply stop asking to be dispatched.',
            style: RunqText.body.copyWith(color: t.ink),
          ),
          const SizedBox(height: 10),
          Text(
            'Use this once, when starting to track stock: everything billed '
            'before today is written off the queue, and tomorrow starts '
            'clean. Invoices raised from tomorrow will queue as normal.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text('Clear queue'),
        ),
      ],
    ),
  );
  if (ok != true || !context.mounted) return false;

  final messenger = ScaffoldMessenger.of(context);
  try {
    final waived = await salesDispatchRepo.waiveDispatch(upto: _today());
    ref.invalidate(invPendingDispatchProvider);
    showRunqSnackOn(
      messenger,
      waived == 0
          ? 'Nothing to clear'
          : '$waived ${waived == 1 ? 'invoice' : 'invoices'} cleared from the queue',
      kind: SnackKind.success,
    );
    return waived > 0;
  } on ApiException catch (e) {
    showRunqSnackOn(messenger, e.message, kind: SnackKind.error);
    return false;
  }
}

String _today() => DateTime.now().toIso8601String().substring(0, 10);

/// Pages the queue and ships it, batch by batch.
Future<(_Progress, List<_Problem>)> _run({
  required String? from,
  required ValueNotifier<_Progress> progress,
  required ValueNotifier<bool> cancelled,
}) async {
  final handled = <String>{};
  final numberOf = <String, String>{};
  final problems = <_Problem>[];
  var done = 0, shipped = 0, skipped = 0, failed = 0;
  var total = progress.value.total;
  var page = 1;

  while (!cancelled.value) {
    final queue = await salesDispatchRepo.pending(from: from, page: page);
    if (queue.rows.isEmpty) break;
    // The count can only be trusted from a live page — invoices may have
    // been raised or shipped elsewhere since the screen loaded.
    total = queue.total > total ? queue.total : total;
    for (final r in queue.rows) {
      numberOf[r.id] = r.invoiceNumber;
    }

    final batch =
        queue.rows.where((r) => !handled.contains(r.id)).take(_kBatch).toList();
    if (batch.isEmpty) {
      page++; // Whole page already handled — everything on it was skipped.
      continue;
    }
    handled.addAll(batch.map((r) => r.id));

    final outcomes = await salesDispatchRepo.dispatchBulk(
      invoiceIds: batch.map((r) => r.id).toList(),
    );
    for (final o in outcomes) {
      done++;
      if (o.shipped) {
        shipped++;
        continue;
      }
      o.failed ? failed++ : skipped++;
      problems.add((
        invoiceNumber: numberOf[o.invoiceId] ?? '—',
        reason: o.reason ?? 'No reason given',
        failed: o.failed,
      ));
    }
    progress.value = _Progress(
      done: done, total: total, shipped: shipped, skipped: skipped, failed: failed,
    );
  }

  return (progress.value, problems);
}

Future<bool> _confirm(BuildContext context, int total) async {
  final t = RT(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Dispatch $total ${total == 1 ? 'invoice' : 'invoices'}?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Each invoice gets a delivery note dated to its own invoice date. '
            'Stock moves FEFO from the default warehouse and the cost of goods '
            'posts to that date.',
            style: RunqText.body.copyWith(color: t.ink),
          ),
          const SizedBox(height: 10),
          Text(
            'Backdating puts those costs into months you may already have '
            'reported. Invoices with nothing stocked to ship, or that already '
            'have a delivery note, are left alone.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text('Dispatch all'),
        ),
      ],
    ),
  );
  return ok ?? false;
}

class _ProgressDialog extends StatelessWidget {
  final ValueNotifier<_Progress> progress;
  final ValueNotifier<bool> cancelled;
  const _ProgressDialog({required this.progress, required this.cancelled});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return PopScope(
      canPop: false,
      child: AlertDialog(
        title: const Text('Dispatching'),
        content: ValueListenableBuilder<_Progress>(
          valueListenable: progress,
          builder: (_, p, __) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LinearProgressIndicator(
                value: p.total == 0 ? null : (p.done / p.total).clamp(0.0, 1.0),
                color: InvColors.brand(context),
                backgroundColor: t.hairline,
              ),
              const SizedBox(height: 12),
              Text('${p.done} of ${p.total}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 4),
              Text(
                '${p.shipped} dispatched'
                '${p.skipped > 0 ? ' · ${p.skipped} skipped' : ''}'
                '${p.failed > 0 ? ' · ${p.failed} failed' : ''}',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
        actions: [
          ValueListenableBuilder<bool>(
            valueListenable: cancelled,
            builder: (_, stopping, __) => TextButton(
              onPressed: stopping ? null : () => cancelled.value = true,
              child: Text(stopping ? 'Finishing batch…' : 'Stop'),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _report(
  BuildContext context,
  _Progress p,
  List<_Problem> problems, {
  String? fatal,
}) async {
  final t = RT(context);
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(p.shipped > 0 ? 'Dispatched ${p.shipped}' : 'Nothing dispatched'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (fatal != null) ...[
              Text('Stopped early: $fatal',
                  style: RunqText.body.copyWith(color: InvColors.error)),
              const SizedBox(height: 10),
            ],
            Text(
              '${p.shipped} delivery notes posted'
              '${p.skipped > 0 ? ', ${p.skipped} skipped' : ''}'
              '${p.failed > 0 ? ', ${p.failed} failed' : ''}.',
              style: RunqText.body.copyWith(color: t.ink),
            ),
            if (problems.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('Still in the queue', style: RunqText.label.copyWith(color: t.muted2)),
              const SizedBox(height: 6),
              ...problems.take(20).map((x) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(
                      '${x.invoiceNumber} — ${x.reason}',
                      style: RunqText.caption.copyWith(
                        color: x.failed ? InvColors.error : t.muted,
                      ),
                    ),
                  )),
              if (problems.length > 20)
                Text('…and ${problems.length - 20} more',
                    style: RunqText.caption.copyWith(color: t.muted2)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Done'),
        ),
      ],
    ),
  );
}
