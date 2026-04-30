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

class PoProcessingScreen extends ConsumerStatefulWidget {
  final File file;
  final String source;
  const PoProcessingScreen({super.key, required this.file, this.source = 'share_sheet'});

  @override
  ConsumerState<PoProcessingScreen> createState() => _PoProcessingScreenState();
}

class _PoProcessingScreenState extends ConsumerState<PoProcessingScreen> {
  _Step _step = _Step.uploading;
  String? _uploadId;
  String? _errorMessage;
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

  Future<void> _start() async {
    try {
      final upload = await poRepo.upload(widget.file, source: widget.source);
      if (!mounted) return;
      setState(() {
        _uploadId = upload.id;
        _step = _Step.parsing;
      });
      _scheduleNextPoll();
    } on ApiException catch (e) {
      _failWith(e.message);
    } catch (_) {
      _failWith('Could not upload the PO. Try again.');
    }
  }

  void _scheduleNextPoll() {
    _poll?.cancel();
    _poll = Timer(const Duration(milliseconds: 1500), _pollOnce);
  }

  Future<void> _pollOnce() async {
    final id = _uploadId;
    if (id == null || !mounted) return;
    try {
      final draft = await poRepo.getDraft(id);
      if (!mounted) return;

      if (draft.uploadStatus == 'parse_error') {
        _failWith(draft.errorMessage ?? 'Could not parse this PO.');
        return;
      }

      if (draft.draftId != null && draft.reviewStatus != null && draft.reviewStatus != 'parsing') {
        setState(() => _step = _Step.ready);
        // Replace this screen with the review screen so back navigation skips it.
        if (mounted) {
          context.pushReplacement('/po-drafts/$id');
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

  void _failWith(String message) {
    if (!mounted) return;
    setState(() {
      _step = _Step.error;
      _errorMessage = message;
    });
  }

  Future<void> _retry() async {
    final id = _uploadId;
    if (id != null) {
      // Best-effort cleanup of the failed upload so we don't leave it in the inbox.
      unawaited(poRepo.discard(id).catchError((_) {}));
    }
    setState(() {
      _uploadId = null;
      _errorMessage = null;
      _step = _Step.uploading;
    });
    _start();
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
              Text('Generating invoice from PO', style: RunqText.h2.copyWith(color: t.ink)),
              const SizedBox(height: 6),
              Text(widget.file.path.split(Platform.pathSeparator).last,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: t.muted)),
              const SizedBox(height: 28),
              if (_step == _Step.error)
                _ErrorCard(message: _errorMessage ?? 'Something went wrong.', onRetry: _retry)
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
      _Item('Uploading PO', _state(_Step.uploading)),
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
  const _ErrorCard({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
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
