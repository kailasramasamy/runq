import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_card.dart';

enum _Step { uploading, parsing, matching, ready, error }

class CustomerOrderProcessingScreen extends ConsumerStatefulWidget {
  final File file;
  final String source;
  const CustomerOrderProcessingScreen({super.key, required this.file, this.source = 'share_sheet'});

  @override
  ConsumerState<CustomerOrderProcessingScreen> createState() => _CustomerOrderProcessingScreenState();
}

class _CustomerOrderProcessingScreenState extends ConsumerState<CustomerOrderProcessingScreen> {
  _Step _step = _Step.uploading;
  String? _uploadId;
  String? _errorMessage;
  // Set when the failure is a duplicate PO — enables the "View existing" and
  // "Replace" actions on the error card. Holds the existing upload's id.
  String? _duplicateUploadId;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _start({bool replace = false}) async {
    try {
      final upload = await orderRepo.upload(widget.file, source: widget.source, replace: replace);
      if (!mounted) return;
      setState(() {
        _uploadId = upload.id;
        _step = _Step.parsing;
      });
      _scheduleNextPoll();
    } on ApiException catch (e) {
      _failWith(e.message, duplicateUploadId: _duplicateIdFrom(e));
    } catch (_) {
      _failWith('Could not upload the order. Try again.');
    }
  }

  /// A duplicate-PO 409 carries the existing upload's id in `details`.
  String? _duplicateIdFrom(ApiException e) {
    if (e.statusCode != 409) return null;
    final details = e.body?['details'];
    if (details is Map && details['duplicateOfUploadId'] is String) {
      return details['duplicateOfUploadId'] as String;
    }
    return null;
  }

  void _scheduleNextPoll() {
    _poll?.cancel();
    _poll = Timer(const Duration(milliseconds: 1500), _pollOnce);
  }

  Future<void> _pollOnce() async {
    final id = _uploadId;
    if (id == null || !mounted) return;
    try {
      final draft = await orderRepo.getDraft(id);
      if (!mounted) return;

      if (draft.uploadStatus == 'parse_error') {
        _failWith(draft.errorMessage ?? 'Could not parse this order.');
        return;
      }

      if (draft.draftId != null && draft.reviewStatus != null && draft.reviewStatus != 'parsing') {
        setState(() => _step = _Step.ready);
        // Replace this screen with the review screen so back navigation skips it.
        if (mounted) {
          context.pushReplacement('/sales/orders/$id');
        }
        return;
      }

      // Still parsing — refine label between upload-side and matching phases.
      setState(() {
        _step = draft.draftId == null ? _Step.parsing : _Step.matching;
      });
      _scheduleNextPoll();
    } on ApiException catch (e) {
      _failWith(e.message);
    } catch (_) {
      // Transient — keep polling. (Network blip, server warming, etc.)
      _scheduleNextPoll();
    }
  }

  void _failWith(String message, {String? duplicateUploadId}) {
    if (!mounted) return;
    setState(() {
      _step = _Step.error;
      _errorMessage = message;
      _duplicateUploadId = duplicateUploadId;
    });
  }

  Future<void> _retry() async {
    final id = _uploadId;
    if (id != null) {
      // Best-effort cleanup of the failed upload so we don't leave it in the inbox.
      unawaited(orderRepo.discard(id).catchError((_) {}));
    }
    setState(() {
      _uploadId = null;
      _errorMessage = null;
      _duplicateUploadId = null;
      _step = _Step.uploading;
    });
    _start();
  }

  /// Open the PO that already exists for this file (its review screen, which
  /// links to the invoice if it was already approved).
  void _openExisting() {
    final id = _duplicateUploadId;
    if (id == null) return;
    context.pushReplacement('/sales/orders/$id');
  }

  /// Supersede the existing un-approved PO with this file and re-import.
  void _replace() {
    setState(() {
      _errorMessage = null;
      _duplicateUploadId = null;
      _step = _Step.uploading;
    });
    _start(replace: true);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Header(onCancel: () => context.pop()),
              const SizedBox(height: 20),
              Text('Generating invoice from customer PO', style: RunqText.h2.copyWith(color: t.ink)),
              const SizedBox(height: 6),
              Text(widget.file.path.split(Platform.pathSeparator).last,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: t.muted)),
              const SizedBox(height: 28),
              if (_step == _Step.error)
                _ErrorCard(
                  message: _errorMessage ?? 'Something went wrong.',
                  onRetry: _retry,
                  onOpenExisting: _duplicateUploadId != null ? _openExisting : null,
                  onReplace: _duplicateUploadId != null ? _replace : null,
                )
              else
                _StepsCard(step: _step),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final VoidCallback onCancel;
  const _Header({required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        const Spacer(),
        TextButton(
          onPressed: onCancel,
          child: Text('Cancel', style: RunqText.bodyStrong.copyWith(color: t.muted)),
        ),
      ],
    );
  }
}

class _StepsCard extends StatelessWidget {
  final _Step step;
  const _StepsCard({required this.step});

  @override
  Widget build(BuildContext context) {
    final items = [
      _Item('Uploading order', _state(_Step.uploading)),
      _Item('AI parsing line items', _state(_Step.parsing)),
      _Item('Matching customer & SKUs', _state(_Step.matching)),
    ];

    return RunqCard(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i < items.length - 1 ? 18 : 0),
              child: _StepRow(item: items[i]),
            ),
        ],
      ),
    );
  }

  _StepState _state(_Step item) {
    if (step == _Step.ready) return _StepState.done;
    if (step.index > item.index) return _StepState.done;
    if (step.index == item.index) return _StepState.active;
    return _StepState.pending;
  }
}

enum _StepState { pending, active, done }

class _Item {
  final String label;
  final _StepState state;
  const _Item(this.label, this.state);
}

class _StepRow extends StatelessWidget {
  final _Item item;
  const _StepRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isActive = item.state == _StepState.active;
    final isPending = item.state == _StepState.pending;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _Indicator(state: item.state),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            item.label,
            style: RunqText.body.copyWith(
              color: isPending ? t.muted2 : t.ink,
              fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _Indicator extends StatelessWidget {
  final _StepState state;
  const _Indicator({required this.state});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    switch (state) {
      case _StepState.done:
        return Container(
          width: 22,
          height: 22,
          decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF10B981)),
          alignment: Alignment.center,
          child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
        );
      case _StepState.active:
        return Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: RunqColors.indigo.withValues(alpha: 0.12),
          ),
          alignment: Alignment.center,
          child: SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2, color: RT(context).brand),
          ),
        );
      case _StepState.pending:
        return Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: t.hairline, width: 2),
          ),
        );
    }
  }
}

class _ErrorCard extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  // Non-null only for a duplicate-PO error: navigate to the existing PO and
  // re-import over the old one, respectively.
  final VoidCallback? onOpenExisting;
  final VoidCallback? onReplace;
  const _ErrorCard({required this.message, required this.onRetry, this.onOpenExisting, this.onReplace});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDuplicate = onOpenExisting != null;
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.error_outline_rounded, size: 22, color: Color(0xFFEF4444)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(message,
                    style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w500)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (isDuplicate) ...[
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: RunqColors.indigo,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: onOpenExisting,
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('View existing PO'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: t.ink,
                side: BorderSide(color: t.muted.withValues(alpha: 0.45), width: 1),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: onReplace,
              icon: const Icon(Icons.swap_horiz_rounded, size: 18),
              label: const Text('Replace with this file'),
            ),
          ] else
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: RunqColors.indigo,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Try again'),
            ),
        ],
      ),
    );
  }
}
