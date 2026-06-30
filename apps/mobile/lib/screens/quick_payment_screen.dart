import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  /// When opened from the share sheet, the shared confirmation file — OCR'd
  /// on open to pre-fill the form.
  final File? initialFile;
  const QuickPaymentScreen({super.key, this.initialFile});

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
  bool _ocrBusy = false;
  bool _prefsLoaded = false;

  static const _kLastAccount = 'qp_last_bank_account_id';

  @override
  void initState() {
    super.initState();
    // Default "Paid from" to the last account used (persisted across sessions).
    SharedPreferences.getInstance().then((p) {
      if (!mounted) return;
      setState(() {
        _bankAccountId ??= p.getString(_kLastAccount);
        _prefsLoaded = true;
      });
    });
    final f = widget.initialFile;
    if (f != null) {
      _photo = f;
      WidgetsBinding.instance.addPostFrameCallback((_) => _runOcr(f));
    }
  }

  Future<void> _rememberAccount(String id) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kLastAccount, id);
  }

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
      useSafeArea: true,
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
    if (x == null) return;
    final file = File(x.path);
    setState(() => _photo = file);
    await _runOcr(file);
  }

  /// Read the confirmation and pre-fill empty fields. Best-effort: failures
  /// are silent so the user can always fill the form by hand.
  Future<void> _runOcr(File file) async {
    setState(() => _ocrBusy = true);
    try {
      final c = await bankingRepo.extractConfirmation(file);
      if (!mounted) return;
      setState(() {
        if (c.amount != null && _amountCtrl.text.trim().isEmpty) {
          _amountCtrl.text = c.amount!.toStringAsFixed(2);
        }
        if (c.payeeName != null && _payeeCtrl.text.trim().isEmpty) _payeeCtrl.text = c.payeeName!;
        if (c.upiRef != null && _upiCtrl.text.trim().isEmpty) _upiCtrl.text = c.upiRef!;
        if (c.paymentDate != null) _date = DateTime.tryParse(c.paymentDate!) ?? _date;
      });
    } on ApiException catch (_) {
      // OCR is best-effort; leave fields for manual entry.
    } finally {
      if (mounted) setState(() => _ocrBusy = false);
    }
  }

  Future<void> _pickCategory(List<GlAccount> accounts) async {
    final picked = await showModalBottomSheet<GlAccount>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => _CategorySheet(accounts: accounts, selectedId: _category?.id),
    );
    if (picked != null) setState(() => _category = picked);
  }

  Future<void> _pickBankAccount(List<BankAccount> accounts) async {
    final t = RT(context);
    final picked = await showModalBottomSheet<BankAccount>(
      context: context,
      backgroundColor: t.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            sheetHandle(t),
            sheetTitle(t, 'Paid from'),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                itemCount: accounts.length,
                separatorBuilder: (_, __) => Divider(height: 1, color: t.hairline, indent: 16, endIndent: 16),
                itemBuilder: (_, i) {
                  final a = accounts[i];
                  return ListTile(
                    leading: _acctAvatar(t, a),
                    title: Text(a.bankName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    subtitle: Text(a.masked, style: RunqText.caption.copyWith(color: t.muted)),
                    trailing: a.id == _bankAccountId ? const Icon(Icons.check, color: RunqColors.indigo, size: 18) : null,
                    onTap: () => Navigator.pop(ctx, a),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked != null) {
      setState(() => _bankAccountId = picked.id);
      _rememberAccount(picked.id);
    }
  }

  Widget _acctAvatar(RunqTokens t, BankAccount a) {
    final isCash = a.accountType.toLowerCase() == 'cash' || a.bankName.toLowerCase() == 'cash';
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: RunqColors.indigo.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(
        isCash ? Icons.account_balance_wallet_outlined : Icons.account_balance_outlined,
        color: RunqColors.indigo,
        size: 20,
      ),
    );
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
      await _rememberAccount(_bankAccountId!);
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
          ],
        ),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: t.bgWarmer,
          border: Border(top: BorderSide(color: t.hairline)),
        ),
        child: SafeArea(
          minimum: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Capture payment'),
          ),
        ),
      ),
    );
  }

  Widget _label(RunqTokens t, String s) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(s, style: RunqText.caption.copyWith(color: t.muted)),
      );

  Widget _accountField(RunqTokens t, List<BankAccount> accounts) {
    // Wait for the saved last-used account before defaulting, so we don't
    // flash the first account then jump to the remembered one.
    if (_prefsLoaded) {
      final valid = _bankAccountId != null && accounts.any((a) => a.id == _bankAccountId);
      if (!valid && accounts.isNotEmpty) _bankAccountId = accounts.first.id;
    }
    BankAccount? selected;
    for (final a in accounts) {
      if (a.id == _bankAccountId) { selected = a; break; }
    }
    return InkWell(
      onTap: () => _pickBankAccount(accounts),
      child: InputDecorator(
        decoration: fieldDecoration(t),
        child: Text(
          selected != null ? '${selected.bankName} ${selected.masked}' : 'Select account',
          style: RunqText.body.copyWith(color: selected == null ? t.muted2 : t.ink),
        ),
      ),
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
          _ocrBusy
              ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: t.muted))
              : Icon(_photo == null ? Icons.add_a_photo_outlined : Icons.check_circle_outline, color: t.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _ocrBusy
                  ? 'Reading confirmation…'
                  : (_photo == null ? 'Attach payment confirmation' : 'Photo attached — tap to change'),
              style: RunqText.body.copyWith(color: t.ink),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Shared bottom-sheet chrome — matches the app's other selector sheets
/// (drag handle + title), e.g. the goods-received item picker.
Widget sheetHandle(RunqTokens t) => Container(
      width: 40,
      height: 4,
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
    );

Widget sheetTitle(RunqTokens t, String s) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Align(alignment: Alignment.centerLeft, child: Text(s, style: RunqText.h3)),
    );

/// Searchable bottom-sheet picker for the (long) expense account list.
class _CategorySheet extends StatefulWidget {
  final List<GlAccount> accounts;
  final String? selectedId;
  const _CategorySheet({required this.accounts, this.selectedId});

  @override
  State<_CategorySheet> createState() => _CategorySheetState();
}

class _CategorySheetState extends State<_CategorySheet> {
  final _ctl = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final q = _q.toLowerCase();
    final filtered = q.isEmpty
        ? widget.accounts
        : widget.accounts.where((a) => a.label.toLowerCase().contains(q)).toList();
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtl) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          children: [
            sheetHandle(t),
            sheetTitle(t, 'Expense category'),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                controller: _ctl,
                autofocus: true,
                onChanged: (v) => setState(() => _q = v),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search category…',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            Expanded(
              child: filtered.isEmpty
                  ? Center(child: Text('No matching category', style: RunqText.caption.copyWith(color: t.muted)))
                  : ListView.separated(
                      controller: scrollCtl,
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => Divider(height: 1, color: t.hairline),
                      itemBuilder: (_, i) {
                        final a = filtered[i];
                        return ListTile(
                          leading: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: const Color(0xFF22C55E).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.sell_outlined, color: Color(0xFF22C55E), size: 20),
                          ),
                          title: Text(a.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                          subtitle: Text(a.code, style: RunqText.caption.copyWith(color: t.muted)),
                          trailing: a.id == widget.selectedId
                              ? const Icon(Icons.check, color: RunqColors.indigo, size: 18)
                              : null,
                          onTap: () => Navigator.pop(context, a),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
