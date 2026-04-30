import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  ExtractedBill? _aiOriginal;
  _EditableBill? _edited;
  String? _error;
  bool _committing = false;
  // Existing bills that look like duplicates of what we're about to save.
  // Empty when not yet checked or vendor isn't known. Re-evaluated whenever
  // invoice number / date / total / vendor change.
  List<DuplicateMatch> _duplicates = const [];
  bool _checkingDuplicates = false;
  String? _lastDupKey;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _extract(widget.file));
  }

  @override
  void dispose() {
    _edited?.dispose();
    super.dispose();
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
        _aiOriginal = result;
        _edited = _EditableBill.fromExtracted(result);
        step = _Step.review;
      });
      // Kick off a duplicate check in the background — non-blocking; the
      // banner appears as soon as the API responds.
      _refreshDuplicates();
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

  /// Re-runs duplicate detection. Cheap to call — the API is keyed on
  /// (vendor, invoiceNumber, date, total) so we de-dupe identical lookups
  /// via _lastDupKey. Skips the call entirely when vendor isn't matched
  /// (a brand-new vendor can't have past bills).
  Future<void> _refreshDuplicates() async {
    final ai = _aiOriginal;
    final edited = _edited;
    if (ai == null || edited == null) return;
    final vendorId = ai.vendorMatch?.id;
    if (vendorId == null) return;

    final invoiceNumber = edited.invoiceNumber.text.trim();
    final dateStr = edited.invoiceDate.text.trim();
    final total = double.tryParse(edited.totalAmount.text) ?? 0;
    if (invoiceNumber.isEmpty || dateStr.isEmpty || total <= 0) return;
    final invoiceDate = DateTime.tryParse(dateStr);
    if (invoiceDate == null) return;

    final key = '$vendorId|$invoiceNumber|$dateStr|$total';
    if (key == _lastDupKey) return;
    _lastDupKey = key;

    setState(() => _checkingDuplicates = true);
    try {
      final matches = await billsRepo.checkDuplicates(
        vendorId: vendorId,
        invoiceNumber: invoiceNumber,
        invoiceDate: invoiceDate,
        totalAmount: total,
      );
      if (!mounted) return;
      setState(() => _duplicates = matches);
    } catch (_) {
      // Silent failure — duplicate check is advisory, never blocks saving.
    } finally {
      if (mounted) setState(() => _checkingDuplicates = false);
    }
  }

  /// If duplicates exist, ask before saving. Returns true to continue,
  /// false to bail. Only the highest-confidence match is shown to keep the
  /// dialog scannable.
  Future<bool> _confirmIfDuplicate() async {
    if (_duplicates.isEmpty) return true;
    final top = _duplicates.first;
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: RunqColors.amberInk, size: 32),
        title: const Text('Possible duplicate'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'A bill from this vendor with similar details already exists.',
              style: RunqText.body.copyWith(fontSize: 14),
            ),
            const SizedBox(height: 10),
            Text(
              'Bill #${top.invoiceNumber} · ${top.invoiceDate} · ${formatINR(top.totalAmount)}',
              style: RunqText.bodyStrong.copyWith(fontSize: 13),
            ),
            const SizedBox(height: 4),
            Text(
              top.reasonLabel,
              style: RunqText.caption.copyWith(color: RunqColors.amberInk, fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Review'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: RunqColors.amberInk),
            child: const Text('Save anyway'),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _commit() async {
    final ai = _aiOriginal;
    final edited = _edited;
    if (ai == null || edited == null) return;
    if (!await _confirmIfDuplicate()) return;
    if (!mounted) return;
    setState(() => _committing = true);
    try {
      await billsRepo.commitScan(
        edited.toJson(),
        vendorId: ai.vendorMatch?.id,
        // Keep AI's raw output immutable so the server can compute the
        // user-correction diff for downstream learning.
        aiOutput: _extractedToJson(ai),
        // Bind the file the server already staged in S3 to this bill.
        extractionId: ai.extractionId,
      );
      if (!mounted) return;
      ref.invalidate(billsProvider(const BillFilter()));
      ref.invalidate(billsSummaryProvider);
      ref.invalidate(dashboardSummaryProvider);
      ref.invalidate(activityProvider);
      showRunqSnack(context, 'Bill saved as draft', kind: SnackKind.success);
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      // Surface field-path validation errors so the user knows where to look.
      final details = e.body?['details'];
      String msg = e.message;
      if (details is List && details.isNotEmpty) {
        msg = details
            .take(3)
            .map((d) {
              if (d is! Map) return d.toString();
              final field = (d['field'] ?? '').toString().replaceAll('extracted.', '').replaceAll('.', ' ');
              return '$field: ${d['message']}';
            })
            .join(' · ');
      }
      showRunqSnack(context, msg, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _committing = false);
    }
  }

  Future<void> _restartIntake() async {
    if (context.canPop()) context.pop();
    await startBillIntake(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: switch (step) {
        _Step.extracting => const _Extracting(),
        _Step.review => _Review(
            ai: _aiOriginal!,
            edited: _edited!,
            committing: _committing,
            duplicates: _duplicates,
            checkingDuplicates: _checkingDuplicates,
            onCommit: _commit,
            onRetake: _restartIntake,
            onChange: () {
              setState(() {});
              // Re-evaluate duplicates whenever the user fixes the
              // invoice number / date / total. _refreshDuplicates
              // de-dupes via _lastDupKey so this is cheap.
              _refreshDuplicates();
            },
          ),
        _Step.error => _ErrorView(message: _error ?? 'Something went wrong', onRetry: _restartIntake),
      },
    );
  }
}

// ─── Editable state holder ──────────────────────────────────────────────

class _EditableItem {
  final TextEditingController itemName;
  final TextEditingController hsnSacCode;
  final TextEditingController quantity;
  final TextEditingController unitPrice;
  final TextEditingController amount;
  final TextEditingController taxRate;

  _EditableItem.fromExtracted(ExtractedBillItem item)
      : itemName = TextEditingController(text: item.itemName),
        hsnSacCode = TextEditingController(text: item.hsnSacCode ?? ''),
        // If the AI couldn't read a quantity but did pick up an amount
        // (common for utility bills, lump-sum services), default qty to 1
        // so the line saves cleanly without making the user touch it.
        quantity = TextEditingController(
          text: (item.quantity == 0 && item.amount != 0 ? 1 : item.quantity).toString(),
        ),
        unitPrice = TextEditingController(text: item.unitPrice.toString()),
        amount = TextEditingController(text: item.amount.toString()),
        taxRate = TextEditingController(text: item.taxRate?.toString() ?? '');

  _EditableItem.empty()
      : itemName = TextEditingController(),
        hsnSacCode = TextEditingController(),
        quantity = TextEditingController(text: '1'),
        unitPrice = TextEditingController(text: '0'),
        amount = TextEditingController(text: '0'),
        taxRate = TextEditingController();

  void dispose() {
    itemName.dispose();
    hsnSacCode.dispose();
    quantity.dispose();
    unitPrice.dispose();
    amount.dispose();
    taxRate.dispose();
  }

  Map<String, dynamic> toJson() => {
        'itemName': itemName.text.trim(),
        if (hsnSacCode.text.trim().isNotEmpty) 'hsnSacCode': hsnSacCode.text.trim(),
        'quantity': double.tryParse(quantity.text) ?? 0,
        'unitPrice': double.tryParse(unitPrice.text) ?? 0,
        'amount': double.tryParse(amount.text) ?? 0,
        if (taxRate.text.trim().isNotEmpty) 'taxRate': double.tryParse(taxRate.text),
      };
}

class _EditableBill {
  final TextEditingController vendorName;
  final TextEditingController vendorGstin;
  final TextEditingController vendorPan;
  final TextEditingController vendorPhone;
  final TextEditingController vendorEmail;
  final TextEditingController invoiceNumber;
  final TextEditingController invoiceDate; // YYYY-MM-DD
  final TextEditingController dueDate; // YYYY-MM-DD
  final TextEditingController subtotal;
  final TextEditingController taxAmount;
  final TextEditingController totalAmount;
  final TextEditingController tdsSection;
  final List<_EditableItem> items;
  final double confidence;

  _EditableBill.fromExtracted(ExtractedBill e)
      : vendorName = TextEditingController(text: e.vendorName),
        vendorGstin = TextEditingController(text: e.vendorGstin ?? ''),
        vendorPan = TextEditingController(text: e.vendorPan ?? ''),
        vendorPhone = TextEditingController(text: e.vendorPhone ?? ''),
        vendorEmail = TextEditingController(text: e.vendorEmail ?? ''),
        invoiceNumber = TextEditingController(text: e.invoiceNumber ?? ''),
        invoiceDate = TextEditingController(text: e.invoiceDate?.toIso8601String().substring(0, 10) ?? ''),
        dueDate = TextEditingController(text: e.dueDate?.toIso8601String().substring(0, 10) ?? ''),
        // Drop zero-amount lines from the AI output — utility bills often
        // include sub-headers ("Energy Charges:", "Taxes & Levies:") that
        // the model emits as line items with amount 0. They add noise and
        // make the user fix validation errors that aren't theirs.
        items = e.items.where((it) => it.amount != 0).map(_EditableItem.fromExtracted).toList(),
        // Subtotal is always the sum of line items — every printed line on
        // the bill (goods, charges, GST rows, round-off) is captured as
        // its own item, so summing them is exactly the bill total minus
        // any rounding the printer did. Tax stays 0 because the bill's
        // own tax rows are line items now. Total comes from the printed
        // figure — the mismatch banner below catches transcription errors.
        subtotal = TextEditingController(
          text: e.items
              .where((it) => it.amount != 0)
              .fold<double>(0, (s, it) => s + it.amount)
              .toStringAsFixed(2),
        ),
        taxAmount = TextEditingController(text: '0'),
        totalAmount = TextEditingController(text: e.totalAmount.toStringAsFixed(2)),
        tdsSection = TextEditingController(text: e.tdsSection ?? ''),
        confidence = e.confidence;

  void addItem() => items.add(_EditableItem.empty());
  void removeItem(int idx) {
    if (idx >= 0 && idx < items.length) {
      items.removeAt(idx).dispose();
    }
  }

  void recomputeAmount(int idx) {
    if (idx < 0 || idx >= items.length) return;
    final it = items[idx];
    final qty = double.tryParse(it.quantity.text) ?? 0;
    final rate = double.tryParse(it.unitPrice.text) ?? 0;
    it.amount.text = (qty * rate).toStringAsFixed(2);
  }

  void recomputeSubtotal() {
    final sum = items.fold<double>(0, (s, it) => s + (double.tryParse(it.amount.text) ?? 0));
    subtotal.text = sum.toStringAsFixed(2);
  }

  List<String> validate() {
    final issues = <String>[];
    if (vendorName.text.trim().isEmpty) issues.add('Vendor name is required');
    if (invoiceNumber.text.trim().isEmpty) issues.add('Invoice number is required');
    if (invoiceDate.text.trim().isEmpty) issues.add('Invoice date is required');
    final total = double.tryParse(totalAmount.text) ?? 0;
    if (total <= 0) issues.add('Total must be greater than 0');
    if (items.isEmpty) issues.add('Add at least one line item');
    for (var i = 0; i < items.length; i++) {
      final it = items[i];
      if (it.itemName.text.trim().isEmpty) issues.add('Line item ${i + 1}: item name is required');
      if ((double.tryParse(it.quantity.text) ?? 0) <= 0) issues.add('Line item ${i + 1}: quantity must be > 0');
      // Negative amounts are valid (discount lines, credit adjustments).
      // Only zero is meaningless on a bill line.
      if ((double.tryParse(it.amount.text) ?? 0) == 0) issues.add('Line item ${i + 1}: amount cannot be zero');
    }
    return issues;
  }

  Map<String, dynamic> toJson() => {
        'vendorName': vendorName.text.trim(),
        'vendorGstin': _orNull(vendorGstin.text),
        'vendorPan': _orNull(vendorPan.text),
        'vendorPhone': _orNull(vendorPhone.text),
        'vendorEmail': _orNull(vendorEmail.text),
        'invoiceNumber': invoiceNumber.text.trim(),
        'invoiceDate': invoiceDate.text.trim(),
        if (dueDate.text.trim().isNotEmpty) 'dueDate': dueDate.text.trim(),
        'subtotal': double.tryParse(subtotal.text) ?? 0,
        'taxAmount': double.tryParse(taxAmount.text) ?? 0,
        'totalAmount': double.tryParse(totalAmount.text) ?? 0,
        'tdsSection': _orNull(tdsSection.text),
        'confidence': confidence,
        'items': items.map((i) => i.toJson()).toList(),
      };

  void dispose() {
    vendorName.dispose();
    vendorGstin.dispose();
    vendorPan.dispose();
    vendorPhone.dispose();
    vendorEmail.dispose();
    invoiceNumber.dispose();
    invoiceDate.dispose();
    dueDate.dispose();
    subtotal.dispose();
    taxAmount.dispose();
    totalAmount.dispose();
    tdsSection.dispose();
    for (final it in items) {
      it.dispose();
    }
  }
}

dynamic _orNull(String s) => s.trim().isEmpty ? null : s.trim();

/// Snapshot of the AI's original extraction as a JSON map (used for `aiOutput`).
Map<String, dynamic> _extractedToJson(ExtractedBill e) => {
      'vendorName': e.vendorName,
      'vendorGstin': e.vendorGstin,
      'vendorPan': e.vendorPan,
      'vendorPhone': e.vendorPhone,
      'vendorEmail': e.vendorEmail,
      'vendorAddress': e.vendorAddress,
      'vendorCity': e.vendorCity,
      'vendorState': e.vendorState,
      'vendorPincode': e.vendorPincode,
      'vendorBankAccount': e.vendorBankAccount,
      'vendorBankIfsc': e.vendorBankIfsc,
      'vendorBankName': e.vendorBankName,
      'invoiceNumber': e.invoiceNumber,
      'invoiceDate': e.invoiceDate?.toIso8601String().substring(0, 10),
      'dueDate': e.dueDate?.toIso8601String().substring(0, 10),
      'tdsSection': e.tdsSection,
      'subtotal': e.subtotal,
      'taxAmount': e.taxAmount,
      'totalAmount': e.totalAmount,
      'confidence': e.confidence,
      'items': e.items
          .map((i) => {
                'itemName': i.itemName,
                'hsnSacCode': i.hsnSacCode,
                'quantity': i.quantity,
                'unitPrice': i.unitPrice,
                'amount': i.amount,
                'taxRate': i.taxRate,
                'taxCategory': i.taxCategory,
              })
          .toList(),
    };

// ─── Extracting ────────────────────────────────────────────────────────

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

// ─── Review (editable) ─────────────────────────────────────────────────

class _Review extends StatelessWidget {
  final ExtractedBill ai;
  final _EditableBill edited;
  final bool committing;
  final List<DuplicateMatch> duplicates;
  final bool checkingDuplicates;
  final VoidCallback onCommit, onRetake, onChange;
  const _Review({
    required this.ai,
    required this.edited,
    required this.committing,
    required this.duplicates,
    required this.checkingDuplicates,
    required this.onCommit,
    required this.onRetake,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final issues = edited.validate();
    final hasErrors = issues.isNotEmpty;

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
                Expanded(child: Center(child: Text('Review & edit', style: RunqText.bodyStrong))),
                const SizedBox(width: 40),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              physics: const BouncingScrollPhysics(),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                if (ai.vendorMatch != null) _VendorMatchCard(match: ai.vendorMatch!),
                if (ai.vendorMatch != null) const SizedBox(height: 12),
                _ConfidenceBadge(confidence: edited.confidence),
                const SizedBox(height: 12),
                if (duplicates.isNotEmpty) ...[
                  _DuplicateBanner(matches: duplicates),
                  const SizedBox(height: 12),
                ],
                if (hasErrors) _IssuesBanner(issues: issues),
                if (hasErrors) const SizedBox(height: 12),
                _VendorSection(edited: edited, onChange: onChange),
                const SizedBox(height: 12),
                _InvoiceSection(edited: edited, onChange: onChange),
                const SizedBox(height: 12),
                _ItemsSection(edited: edited, onChange: onChange),
                const SizedBox(height: 12),
                _TotalsSection(edited: edited, onChange: onChange),
                const SizedBox(height: 80),
              ],
            ),
          ),
          _ReviewFooter(
            committing: committing,
            disabled: hasErrors,
            onSave: onCommit,
            onRetake: onRetake,
          ),
        ],
      ),
    );
  }
}

class _ConfidenceBadge extends StatelessWidget {
  final double confidence;
  const _ConfidenceBadge({required this.confidence});

  @override
  Widget build(BuildContext context) {
    final pct = (confidence * 100).round();
    final low = confidence < 0.7;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: (low ? RunqColors.amberBg : RunqColors.greenBg).withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(low ? Icons.warning_amber_rounded : Icons.check_circle_outline_rounded,
              size: 16, color: low ? RunqColors.amberInk : RunqColors.greenInk),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              low
                  ? '$pct% confidence — review every field carefully before saving.'
                  : '$pct% confidence — AI extracted this bill.',
              style: RunqText.caption.copyWith(color: low ? RunqColors.amberInk : RunqColors.greenInk, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _DuplicateBanner extends StatelessWidget {
  final List<DuplicateMatch> matches;
  const _DuplicateBanner({required this.matches});

  @override
  Widget build(BuildContext context) {
    final ink = RunqColors.amberInk;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RunqColors.amberBg.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: ink.withValues(alpha: 0.18), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.warning_amber_rounded, size: 16, color: ink),
            const SizedBox(width: 8),
            Text(
              matches.length == 1 ? 'Possible duplicate' : 'Possible duplicates (${matches.length})',
              style: RunqText.bodyStrong.copyWith(color: ink, fontSize: 13),
            ),
          ]),
          const SizedBox(height: 8),
          ...matches.take(3).map((m) => Padding(
                padding: const EdgeInsets.only(left: 24, top: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Bill #${m.invoiceNumber} · ${m.invoiceDate} · ${formatINR(m.totalAmount)}',
                      style: RunqText.bodyStrong.copyWith(color: ink, fontSize: 12),
                    ),
                    Text(
                      m.reasonLabel,
                      style: RunqText.caption.copyWith(color: ink, fontSize: 11),
                    ),
                  ],
                ),
              )),
          if (matches.length > 3)
            Padding(
              padding: const EdgeInsets.only(left: 24, top: 4),
              child: Text('… and ${matches.length - 3} more', style: RunqText.caption.copyWith(color: ink, fontSize: 11)),
            ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 24),
            child: Text(
              'You can still save — we\'ll ask once more.',
              style: RunqText.caption.copyWith(color: ink, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

class _IssuesBanner extends StatelessWidget {
  final List<String> issues;
  const _IssuesBanner({required this.issues});

  @override
  Widget build(BuildContext context) {
    final ink = RunqColors.redInk;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RunqColors.redBg.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: ink.withValues(alpha: 0.18), width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.error_outline_rounded, size: 16, color: ink),
            const SizedBox(width: 8),
            Text('Fix before saving:', style: RunqText.bodyStrong.copyWith(color: ink, fontSize: 13)),
          ]),
          const SizedBox(height: 6),
          ...issues.take(6).map((msg) => Padding(
                padding: const EdgeInsets.only(left: 24, top: 2),
                child: Text('• $msg', style: RunqText.caption.copyWith(color: ink, fontSize: 12)),
              )),
          if (issues.length > 6)
            Padding(
              padding: const EdgeInsets.only(left: 24, top: 2),
              child: Text('… and ${issues.length - 6} more', style: RunqText.caption.copyWith(color: ink, fontSize: 12)),
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RunqColors.greenBg.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.check_rounded, size: 18, color: ink),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Matched vendor: ${match.name}', style: RunqText.bodyStrong.copyWith(color: ink, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

class _VendorSection extends StatelessWidget {
  final _EditableBill edited;
  final VoidCallback onChange;
  const _VendorSection({required this.edited, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('VENDOR', style: RunqText.label.copyWith(fontSize: 11)),
          const SizedBox(height: 8),
          _Input(controller: edited.vendorName, label: 'Name', required: true, onChange: onChange),
          _Input(controller: edited.vendorGstin, label: 'GSTIN', mono: true, onChange: onChange),
          _Input(controller: edited.vendorPan, label: 'PAN', mono: true, onChange: onChange),
          _Input(controller: edited.vendorPhone, label: 'Phone', keyboard: TextInputType.phone, onChange: onChange),
          _Input(controller: edited.vendorEmail, label: 'Email', keyboard: TextInputType.emailAddress, onChange: onChange),
        ],
      ),
    );
  }
}

class _InvoiceSection extends StatelessWidget {
  final _EditableBill edited;
  final VoidCallback onChange;
  const _InvoiceSection({required this.edited, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('INVOICE', style: RunqText.label.copyWith(fontSize: 11)),
          const SizedBox(height: 8),
          _Input(controller: edited.invoiceNumber, label: 'Bill #', required: true, mono: true, onChange: onChange),
          _Input(controller: edited.invoiceDate, label: 'Bill date (YYYY-MM-DD)', required: true, onChange: onChange),
          _Input(controller: edited.dueDate, label: 'Due date (YYYY-MM-DD)', onChange: onChange),
          _Input(controller: edited.tdsSection, label: 'TDS section', onChange: onChange),
        ],
      ),
    );
  }
}

class _ItemsSection extends StatelessWidget {
  final _EditableBill edited;
  final VoidCallback onChange;
  const _ItemsSection({required this.edited, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('LINE ITEMS (${edited.items.length})', style: RunqText.label.copyWith(fontSize: 11)),
              const Spacer(),
              TextButton.icon(
                onPressed: () {
                  edited.addItem();
                  onChange();
                },
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add'),
                style: TextButton.styleFrom(foregroundColor: RunqColors.indigo),
              ),
            ],
          ),
          for (var i = 0; i < edited.items.length; i++) ...[
            const SizedBox(height: 4),
            _ItemEditor(
              item: edited.items[i],
              index: i,
              onRemove: edited.items.length > 1
                  ? () {
                      edited.removeItem(i);
                      edited.recomputeSubtotal();
                      onChange();
                    }
                  : null,
              onAmountChange: () {
                edited.recomputeSubtotal();
                onChange();
              },
              onQtyOrPriceChange: () {
                edited.recomputeAmount(i);
                edited.recomputeSubtotal();
                onChange();
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemEditor extends StatelessWidget {
  final _EditableItem item;
  final int index;
  final VoidCallback? onRemove;
  final VoidCallback onAmountChange, onQtyOrPriceChange;

  const _ItemEditor({
    required this.item,
    required this.index,
    required this.onRemove,
    required this.onAmountChange,
    required this.onQtyOrPriceChange,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: RT(context).bgWarm,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: RT(context).hairline, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Item ${index + 1}', style: RunqText.label.copyWith(fontSize: 10)),
              const Spacer(),
              if (onRemove != null)
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.close, size: 16),
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  color: RT(context).muted,
                ),
            ],
          ),
          _Input(controller: item.itemName, label: 'Item name', required: true, onChange: onAmountChange),
          _Input(controller: item.hsnSacCode, label: 'HSN / SAC', mono: true, onChange: onAmountChange),
          Row(
            children: [
              Expanded(child: _Input(controller: item.quantity, label: 'Qty', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onQtyOrPriceChange)),
              const SizedBox(width: 8),
              Expanded(child: _Input(controller: item.unitPrice, label: 'Unit ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onQtyOrPriceChange)),
            ],
          ),
          Row(
            children: [
              Expanded(child: _Input(controller: item.amount, label: 'Amount ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onAmountChange)),
              const SizedBox(width: 8),
              Expanded(child: _Input(controller: item.taxRate, label: 'Tax %', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onAmountChange)),
            ],
          ),
        ],
      ),
    );
  }
}

class _TotalsSection extends StatelessWidget {
  final _EditableBill edited;
  final VoidCallback onChange;
  const _TotalsSection({required this.edited, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final subtotal = double.tryParse(edited.subtotal.text) ?? 0;
    final tax = double.tryParse(edited.taxAmount.text) ?? 0;
    final total = double.tryParse(edited.totalAmount.text) ?? 0;
    final mismatch = total > 0 && (subtotal + tax - total).abs() > 2;

    return RunqCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('TOTALS', style: RunqText.label.copyWith(fontSize: 11)),
          const SizedBox(height: 8),
          _Input(controller: edited.subtotal, label: 'Subtotal ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onChange),
          _Input(controller: edited.taxAmount, label: 'Tax ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onChange),
          _Input(controller: edited.totalAmount, label: 'Total ₹', keyboard: const TextInputType.numberWithOptions(decimal: true), onChange: onChange),
          if (mismatch) ...[
            const SizedBox(height: 6),
            Text(
              'Subtotal + Tax (${formatINR(subtotal + tax)}) ≠ Total (${formatINR(total)})',
              style: RunqText.caption.copyWith(color: RunqColors.amberInk, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}

class _Input extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final bool required, mono;
  final TextInputType? keyboard;
  final VoidCallback? onChange;

  const _Input({
    required this.controller,
    required this.label,
    this.required = false,
    this.mono = false,
    this.keyboard,
    this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(label.toUpperCase(), style: RunqText.label.copyWith(fontSize: 10)),
            if (required) const Text(' *', style: TextStyle(color: RunqColors.redInk, fontSize: 10)),
          ]),
          const SizedBox(height: 2),
          TextField(
            controller: controller,
            keyboardType: keyboard,
            inputFormatters: keyboard?.toString().contains('numberWithOptions') == true
                ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.\-]'))]
                : null,
            onChanged: (_) => onChange?.call(),
            style: RunqText.body.copyWith(
              fontSize: 14,
              fontFamily: mono ? 'monospace' : null,
            ),
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(6),
                borderSide: BorderSide(color: RT(context).hairline),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(6),
                borderSide: BorderSide(color: RT(context).hairline),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(6),
                borderSide: const BorderSide(color: RunqColors.indigo, width: 1.5),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Footer + Error ────────────────────────────────────────────────────

class _ReviewFooter extends StatelessWidget {
  final bool committing, disabled;
  final VoidCallback onSave, onRetake;
  const _ReviewFooter({
    required this.committing,
    required this.disabled,
    required this.onSave,
    required this.onRetake,
  });

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
              child: OutlinedButton.icon(
                onPressed: committing ? null : onRetake,
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: t.muted.withValues(alpha: 0.45), width: 1),
                  foregroundColor: t.ink,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.document_scanner_outlined, size: 18),
                label: const Text('Rescan', style: TextStyle(height: 1.0)),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 48,
              child: FilledButton.icon(
                onPressed: committing || disabled ? null : onSave,
                icon: committing
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.check_rounded, size: 18),
                label: const Text('Save bill', style: TextStyle(height: 1.0)),
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
