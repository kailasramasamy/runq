import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_snack.dart';
import 'new_expense_screen.dart' show fieldDecoration;

/// Capture a payment made out-of-band (bank QR/UPI scan) right after paying,
/// so the imported bank debit reconciles against it later instead of being a
/// forgotten "what was this for". Posts a pending payment + optional photo.
class QuickPaymentScreen extends ConsumerStatefulWidget {
  const QuickPaymentScreen({super.key});

  @override
  ConsumerState<QuickPaymentScreen> createState() => _QuickPaymentScreenState();
}

class _QuickPaymentScreenState extends ConsumerState<QuickPaymentScreen> {
  final _amountCtrl = TextEditingController();
  final _payeeCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  final _upiCtrl = TextEditingController();
  String? _bankAccountId;
  GlAccount? _category;
  DateTime _date = DateTime.now();
  File? _photo;
  bool _saving = false;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _payeeCtrl.dispose();
    _noteCtrl.dispose();
    _upiCtrl.dispose();
    super.dispose();
  }

  String get _dateIso =>
      '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';

  Future<void> _pickPhoto() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.camera_alt_outlined),
            title: const Text('Take photo'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ]),
      ),
    );
    if (source == null) return;
    final x = await ImagePicker().pickImage(source: source, imageQuality: 85, maxWidth: 2400);
    if (x != null) setState(() => _photo = File(x.path));
  }

  Future<void> _pickCategory(List<GlAccount> accounts) async {
    final picked = await showModalBottomSheet<GlAccount>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _CategorySheet(accounts: accounts),
    );
    if (picked != null) setState(() => _category = picked);
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amountCtrl.text.trim());
    if (_bankAccountId == null) return _err('Pick the bank account paid from.');
    if (amount == null || amount <= 0) return _err('Enter a valid amount.');
    if (_category == null) return _err('Pick an expense category.');
    setState(() => _saving = true);
    try {
      await bankingRepo.createPendingPayment(
        bankAccountId: _bankAccountId!,
        amount: amount,
        paymentDate: _dateIso,
        glAccountId: _category!.id,
        payeeName: _payeeCtrl.text,
        note: _noteCtrl.text,
        upiRef: _upiCtrl.text,
        photo: _photo,
      );
      if (!mounted) return;
      showRunqSnack(context, 'Payment captured — it\'ll match your bank statement.');
      context.pop();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _err(String m) => showRunqSnack(context, m, kind: SnackKind.error);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accountsAsync = ref.watch(bankAccountsProvider);
    final categoriesAsync = ref.watch(expenseAccountsProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(title: const Text('Quick payment')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _label(t, 'Paid from'),
            accountsAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => Text('Could not load accounts', style: RunqText.body.copyWith(color: t.muted)),
              data: (accounts) => _accountField(t, accounts),
            ),
            const SizedBox(height: 16),
            _label(t, 'Amount'),
            TextField(
              controller: _amountCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              decoration: fieldDecoration(t, hint: '0.00', prefix: '₹ '),
            ),
            const SizedBox(height: 16),
            _label(t, 'Expense category'),
            categoriesAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => Text('Could not load categories', style: RunqText.body.copyWith(color: t.muted)),
              data: (accounts) => _categoryField(t, accounts),
            ),
            const SizedBox(height: 16),
            _label(t, 'Paid to (optional)'),
            TextField(
              controller: _payeeCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: fieldDecoration(t, hint: 'e.g. Ramesh transport'),
            ),
            const SizedBox(height: 16),
            _label(t, 'Note — what for (optional)'),
            TextField(
              controller: _noteCtrl,
              textCapitalization: TextCapitalization.sentences,
              decoration: fieldDecoration(t, hint: 'e.g. sand for plant flooring'),
            ),
            const SizedBox(height: 16),
            _label(t, 'UPI reference (optional — enables exact match)'),
            TextField(
              controller: _upiCtrl,
              decoration: fieldDecoration(t, hint: 'UTR / UPI txn id'),
            ),
            const SizedBox(height: 16),
            _label(t, 'Payment date'),
            _dateField(t),
            const SizedBox(height: 16),
            _photoField(t),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Capture payment'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(RunqTokens t, String s) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(s, style: RunqText.caption.copyWith(color: t.muted)),
      );

  Widget _accountField(RunqTokens t, List<BankAccount> accounts) {
    _bankAccountId ??= accounts.isNotEmpty ? accounts.first.id : null;
    return DropdownButtonFormField<String>(
      initialValue: _bankAccountId,
      isExpanded: true,
      decoration: fieldDecoration(t),
      items: accounts
          .map((a) => DropdownMenuItem(value: a.id, child: Text('${a.bankName} ${a.masked}', style: RunqText.body.copyWith(color: t.ink))))
          .toList(),
      onChanged: (v) => setState(() => _bankAccountId = v),
    );
  }

  Widget _categoryField(RunqTokens t, List<GlAccount> accounts) {
    return InkWell(
      onTap: () => _pickCategory(accounts),
      child: InputDecorator(
        decoration: fieldDecoration(t),
        child: Text(
          _category?.label ?? 'Select category',
          style: RunqText.body.copyWith(color: _category == null ? t.muted2 : t.ink),
        ),
      ),
    );
  }

  Widget _dateField(RunqTokens t) {
    return InkWell(
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: _date,
          firstDate: DateTime(2020),
          lastDate: DateTime.now(),
        );
        if (picked != null) setState(() => _date = picked);
      },
      child: InputDecorator(
        decoration: fieldDecoration(t),
        child: Text(_dateIso, style: RunqText.body.copyWith(color: t.ink)),
      ),
    );
  }

  Widget _photoField(RunqTokens t) {
    return InkWell(
      onTap: _pickPhoto,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: t.hairline),
        ),
        child: Row(children: [
          Icon(_photo == null ? Icons.add_a_photo_outlined : Icons.check_circle_outline, color: t.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _photo == null ? 'Attach payment confirmation' : 'Photo attached — tap to change',
              style: RunqText.body.copyWith(color: t.ink),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Searchable bottom-sheet picker for the (long) expense account list.
class _CategorySheet extends StatefulWidget {
  final List<GlAccount> accounts;
  const _CategorySheet({required this.accounts});

  @override
  State<_CategorySheet> createState() => _CategorySheetState();
}

class _CategorySheetState extends State<_CategorySheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final q = _q.toLowerCase();
    final filtered = q.isEmpty
        ? widget.accounts
        : widget.accounts.where((a) => a.label.toLowerCase().contains(q)).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              autofocus: true,
              decoration: fieldDecoration(t, hint: 'Search category…'),
              onChanged: (v) => setState(() => _q = v),
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: filtered.length,
              itemBuilder: (_, i) => ListTile(
                title: Text(filtered[i].label, style: RunqText.body.copyWith(color: t.ink)),
                onTap: () => Navigator.pop(context, filtered[i]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
