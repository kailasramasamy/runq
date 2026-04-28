import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../services/bill_intake.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/sparkle.dart';

enum _Step { extracting, review, error }

class BillExtractScreen extends ConsumerStatefulWidget {
  final File file;
  const BillExtractScreen({super.key, required this.file});

  @override
  ConsumerState<BillExtractScreen> createState() => _BillExtractScreenState();
}

class _BillExtractScreenState extends ConsumerState<BillExtractScreen> {
  _Step step = _Step.extracting;
  ExtractedBill? _extracted;
  String? _error;
  bool _committing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _extract(widget.file));
  }

  Future<void> _extract(File file) async {
    setState(() {
      step = _Step.extracting;
      _error = null;
    });
    try {
      final result = await billsRepo.extract(file);
      if (!mounted) return;
      setState(() {
        _extracted = result;
        step = _Step.review;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        step = _Step.error;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not extract this bill. Try a clearer photo.';
        step = _Step.error;
      });
    }
  }

  Future<void> _commit() async {
    final ex = _extracted;
    if (ex == null) return;
    setState(() => _committing = true);
    try {
      await billsRepo.commitScan(_extractedToJson(ex), vendorId: ex.vendorMatch?.id);
      if (!mounted) return;
      ref.invalidate(billsProvider(const BillFilter()));
      ref.invalidate(billsSummaryProvider);
      ref.invalidate(dashboardSummaryProvider);
      showRunqSnack(context, 'Bill saved as draft', kind: SnackKind.success);
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _committing = false);
    }
  }

  Future<void> _restartIntake() async {
    // Replace the current extract route with a fresh intake — chooser, then
    // capture, then push a new extract route with the new file.
    if (context.canPop()) context.pop();
    await startBillIntake(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: switch (step) {
        _Step.extracting => const _Extracting(),
        _Step.review => _Review(
            extracted: _extracted!,
            committing: _committing,
            onCommit: _commit,
            onRetake: _restartIntake,
          ),
        _Step.error => _ErrorView(message: _error ?? 'Something went wrong', onRetry: _restartIntake),
      },
    );
  }
}

Map<String, dynamic> _extractedToJson(ExtractedBill e) => {
      'vendorName': e.vendorName,
      if (e.vendorGstin != null) 'vendorGstin': e.vendorGstin,
      if (e.invoiceNumber != null) 'invoiceNumber': e.invoiceNumber,
      if (e.invoiceDate != null) 'invoiceDate': e.invoiceDate!.toIso8601String().substring(0, 10),
      if (e.dueDate != null) 'dueDate': e.dueDate!.toIso8601String().substring(0, 10),
      'subtotal': e.subtotal,
      'taxAmount': e.taxAmount,
      'totalAmount': e.totalAmount,
      'confidence': e.confidence,
      'items': e.items
          .map((i) => {
                'itemName': i.itemName,
                'quantity': i.quantity,
                'unitPrice': i.unitPrice,
                'amount': i.amount,
              })
          .toList(),
    };

class _Extracting extends StatelessWidget {
  const _Extracting();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: RunqCard(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Sparkle(size: 56, color: RunqColors.accent, animated: true),
                const SizedBox(height: 14),
                Text('Reading the bill…', style: RunqText.h3),
                const SizedBox(height: 6),
                Text('Detecting vendor, line items, and totals',
                    textAlign: TextAlign.center,
                    style: RunqText.caption.copyWith(color: RT(context).muted)),
                const SizedBox(height: 18),
                const SizedBox(
                  width: 24, height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: RunqColors.indigo),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Review extends StatelessWidget {
  final ExtractedBill extracted;
  final bool committing;
  final VoidCallback onCommit, onRetake;
  const _Review({
    required this.extracted,
    required this.committing,
    required this.onCommit,
    required this.onRetake,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                  onPressed: () => Navigator.pop(context),
                ),
                Expanded(child: Center(child: Text('Review extracted bill', style: RunqText.bodyStrong))),
                const SizedBox(width: 40),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                _ReviewFields(extracted: extracted),
                if (extracted.vendorMatch != null) ...[
                  const SizedBox(height: 14),
                  _VendorMatchCard(match: extracted.vendorMatch!),
                ],
              ],
            ),
          ),
          _ReviewFooter(committing: committing, onSave: onCommit, onRetake: onRetake),
        ],
      ),
    );
  }
}

class _ReviewFields extends StatelessWidget {
  final ExtractedBill extracted;
  const _ReviewFields({required this.extracted});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Field(label: 'Vendor', value: extracted.vendorName, sub: extracted.vendorGstin, ai: true),
          _Field(label: 'Bill #', value: extracted.invoiceNumber ?? '—', ai: extracted.invoiceNumber != null),
          if (extracted.invoiceDate != null)
            _Field(label: 'Bill date', value: _date(extracted.invoiceDate!), ai: true),
          if (extracted.dueDate != null)
            _Field(label: 'Due date', value: _date(extracted.dueDate!), ai: true),
          _Field(label: 'Subtotal', value: formatINR(extracted.subtotal)),
          _Field(label: 'Tax', value: formatINR(extracted.taxAmount)),
          _Field(label: 'Total', value: formatINR(extracted.totalAmount), strong: true),
          if (extracted.items.isNotEmpty) ...[
            const SizedBox(height: 8),
            _Field(label: 'Line items', value: '${extracted.items.length} extracted', ai: true),
          ],
          const SizedBox(height: 4),
          Text(
            'Confidence ${(extracted.confidence * 100).round()}%',
            style: RunqText.caption.copyWith(color: RT(context).muted2, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label, value;
  final String? sub;
  final bool ai, strong;
  const _Field({required this.label, required this.value, this.sub, this.ai = false, this.strong = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (ai)
            const Padding(
              padding: EdgeInsets.only(top: 4, right: 8),
              child: Sparkle(size: 12, color: RunqColors.accent),
            )
          else
            const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label.toUpperCase(), style: RunqText.label.copyWith(fontSize: 11)),
                const SizedBox(height: 2),
                Text(value, style: RunqText.bodyStrong.copyWith(fontSize: strong ? 16 : 15)),
                if (sub != null && sub!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(sub!, style: RunqText.caption.copyWith(fontSize: 11, fontFamily: 'monospace')),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VendorMatchCard extends StatelessWidget {
  final ExtractedVendorMatch match;
  const _VendorMatchCard({required this.match});

  @override
  Widget build(BuildContext context) {
    final ink = RunqColors.greenInk;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: RunqColors.greenBg.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: ink.withValues(alpha: 0.18), width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(color: ink.withValues(alpha: 0.15), shape: BoxShape.circle),
            child: const Icon(Icons.check_rounded, color: RunqColors.greenInk, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Matched vendor: ${match.name}', style: RunqText.bodyStrong.copyWith(color: ink)),
                const SizedBox(height: 2),
                Text(match.matchType == 'gstin' ? 'Matched by GSTIN' : 'Matched by name',
                    style: RunqText.caption.copyWith(color: ink, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReviewFooter extends StatelessWidget {
  final bool committing;
  final VoidCallback onSave, onRetake;
  const _ReviewFooter({required this.committing, required this.onSave, required this.onRetake});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: committing ? null : onRetake,
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: t.hairline, width: 0.5),
                  foregroundColor: t.ink,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Rescan'),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: committing ? null : onSave,
                child: committing
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Save bill'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.pop(context),
              ),
            ),
            const Spacer(),
            const Icon(Icons.error_outline_rounded, size: 48, color: RunqColors.redInk),
            const SizedBox(height: 12),
            Text("Couldn't read this bill", style: RunqText.h3),
            const SizedBox(height: 6),
            Text(message,
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: RT(context).muted)),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.document_scanner_outlined, size: 18),
              label: const Text('Try again'),
            ),
            const Spacer(),
          ],
        ),
      ),
    );
  }
}
