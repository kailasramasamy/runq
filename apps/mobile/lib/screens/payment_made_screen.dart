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
import '../services/upi_confirmation_ocr.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';

/// Capture a payment made out-of-band (bank QR/UPI scan) right after paying,
/// so the imported bank debit reconciles against it later instead of being a
/// forgotten "what was this for". Posts a pending payment + optional photo.
class PaymentMadeScreen extends ConsumerStatefulWidget {
  /// When opened from the share sheet, the shared confirmation file — OCR'd
  /// on open to pre-fill the form.
  final File? initialFile;

  /// When set, the screen edits an existing (still-pending) capture instead
  /// of creating a new one.
  final PendingPayment? editPayment;
  const PaymentMadeScreen({super.key, this.initialFile, this.editPayment});

  @override
  ConsumerState<PaymentMadeScreen> createState() => _PaymentMadeScreenState();
}

class _PaymentMadeScreenState extends ConsumerState<PaymentMadeScreen> {
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

  bool get _isEdit => widget.editPayment != null;

  @override
  void initState() {
    super.initState();
    final e = widget.editPayment;
    if (e != null) {
      _bankAccountId = e.bankAccountId;
      _amountCtrl.text = e.amount.toStringAsFixed(2);
      _category = GlAccount(id: e.glAccountId, code: e.glAccountCode ?? '', name: e.glAccountName ?? '', type: 'expense');
      _payeeCtrl.text = e.payeeName ?? '';
      _noteCtrl.text = e.note ?? '';
      _upiCtrl.text = e.upiRef ?? '';
      _date = DateTime.tryParse(e.paymentDate) ?? _date;
      _prefsLoaded = true; // don't override the edited account with the saved default
    } else {
      // Default "Paid from" to the last account used (persisted across sessions).
      SharedPreferences.getInstance().then((p) {
        if (!mounted) return;
        setState(() {
          _bankAccountId ??= p.getString(_kLastAccount);
          _prefsLoaded = true;
        });
      });
    }
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

  /// Read the confirmation and pre-fill empty fields. Local-first: on-device
  /// OCR reads image screenshots instantly and offline; only a PDF or an
  /// unreadable image falls back to the server extractor. Best-effort —
  /// failures are silent so the user can always fill the form by hand.
  Future<void> _runOcr(File file) async {
    setState(() => _ocrBusy = true);
    try {
      final isImage = !file.path.toLowerCase().endsWith('.pdf');
      final local = isImage ? await UpiConfirmationOcr.tryExtract(file) : null;
      final c = local ?? await bankingRepo.extractConfirmation(file);
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
      // OCR is best-effort (covers offline/timeout via NetworkException too);
      // leave fields for manual entry.
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
      if (_isEdit) {
        await bankingRepo.updatePendingPayment(widget.editPayment!.id, {
          'bankAccountId': _bankAccountId,
          'amount': amount,
          'paymentDate': _dateIso,
          'glAccountId': _category!.id,
          'payeeName': _payeeCtrl.text.trim().isEmpty ? null : _payeeCtrl.text.trim(),
          'note': _noteCtrl.text.trim().isEmpty ? null : _noteCtrl.text.trim(),
          'upiRef': _upiCtrl.text.trim().isEmpty ? null : _upiCtrl.text.trim(),
        });
      } else {
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
      }
      if (!mounted) return;
      ref.invalidate(pendingPaymentsProvider);
      showRunqSnack(context, _isEdit ? 'Payment updated.' : 'Payment captured — it\'ll match your bank statement.');
      // Always end on the Payments-made list. From the list's + button a pop
      // returns to it; opened from the share sheet a pop would land on home,
      // so route to the list explicitly instead.
      if (!_isEdit && widget.initialFile != null) {
        context.pushReplacement('/payments-made');
      } else {
        context.pop();
      }
    } on ApiException catch (e) {
      // NetworkException (offline/timeout) arrives here too — the form is left
      // intact (we only pop on success) so a retry is one tap.
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _err(String m) => showRunqSnack(context, m, kind: SnackKind.error);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  String _prettyDate() {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${_date.day} ${m[_date.month - 1]} ${_date.year}';
  }

  String? _selectedAccountLabel(List<BankAccount> accounts) {
    for (final a in accounts) {
      if (a.id == _bankAccountId) return '${a.bankName} ${a.masked}';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accountsAsync = ref.watch(bankAccountsProvider);
    final categoriesAsync = ref.watch(expenseAccountsProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(title: Text(_isEdit ? 'Edit payment' : 'Payment made')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: [
            _amountCard(t),
            if (!_isEdit) ...[
              const SizedBox(height: 12),
              _scanRow(t),
            ],
            const SizedBox(height: 20),
            _sectionHeader(t, 'Details'),
            const SizedBox(height: 8),
            RunqCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  accountsAsync.when(
                    loading: () => _loadingRow(t, 'Paid from'),
                    error: (_, __) => _pickerRow(t,
                        icon: Icons.account_balance_outlined,
                        label: 'Paid from',
                        value: null,
                        placeholder: 'Could not load accounts',
                        onTap: () {}),
                    data: (accounts) {
                      // Default to the last-used account once prefs have loaded.
                      if (_prefsLoaded) {
                        final valid = _bankAccountId != null &&
                            accounts.any((a) => a.id == _bankAccountId);
                        if (!valid && accounts.isNotEmpty) {
                          _bankAccountId = accounts.first.id;
                        }
                      }
                      return _pickerRow(t,
                          icon: Icons.account_balance_outlined,
                          label: 'Paid from',
                          value: _selectedAccountLabel(accounts),
                          placeholder: 'Select account',
                          onTap: () => _pickBankAccount(accounts));
                    },
                  ),
                  _rowDivider(t),
                  categoriesAsync.when(
                    loading: () => _loadingRow(t, 'Category'),
                    error: (_, __) => _pickerRow(t,
                        icon: Icons.sell_outlined,
                        label: 'Category',
                        value: null,
                        placeholder: 'Could not load categories',
                        onTap: () {}),
                    data: (accounts) => _pickerRow(t,
                        icon: Icons.sell_outlined,
                        label: 'Category',
                        value: _category?.label,
                        placeholder: 'Choose a category',
                        onTap: () => _pickCategory(accounts)),
                  ),
                  _rowDivider(t),
                  _pickerRow(t,
                      icon: Icons.event_outlined,
                      label: 'Date',
                      value: _prettyDate(),
                      onTap: _pickDate),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _sectionHeader(t, 'Optional'),
            const SizedBox(height: 8),
            RunqCard(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Column(
                children: [
                  _textRow(t,
                      controller: _payeeCtrl,
                      label: 'Paid to',
                      hint: 'e.g. Ramesh transport',
                      cap: TextCapitalization.words),
                  _rowDivider(t),
                  _textRow(t,
                      controller: _noteCtrl,
                      label: 'Note',
                      hint: 'What was it for?',
                      cap: TextCapitalization.sentences),
                  _rowDivider(t),
                  _textRow(t,
                      controller: _upiCtrl,
                      label: 'UPI reference',
                      hint: 'UTR / UPI txn id',
                      helper: 'Enables an exact match to your bank statement'),
                ],
              ),
            ),
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
                : Text(_isEdit ? 'Save changes' : 'Capture payment'),
          ),
        ),
      ),
    );
  }

  // ── Layout pieces ──────────────────────────────────────────────────────

  Widget _sectionHeader(RunqTokens t, String s) => Padding(
        padding: const EdgeInsets.only(left: 4),
        child: Text(s.toUpperCase(),
            style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
      );

  /// Hero amount input — the number is the point of the screen, so it leads.
  Widget _amountCard(RunqTokens t) {
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('AMOUNT PAID',
              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text('₹',
                  style: RunqText.tabular(size: 28, w: FontWeight.w700, color: t.muted)),
              const SizedBox(width: 6),
              Expanded(
                child: TextField(
                  controller: _amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                  style: RunqText.tabular(size: 28, w: FontWeight.w700, color: t.ink),
                  decoration: InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    hintText: '0.00',
                    hintStyle:
                        RunqText.tabular(size: 28, w: FontWeight.w700, color: t.muted2),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Fast path — snap the confirmation and let OCR fill the form.
  Widget _scanRow(RunqTokens t) {
    final attached = _photo != null;
    return InkWell(
      onTap: _pickPhoto,
      borderRadius: BorderRadius.circular(RunqRadii.card),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: RunqColors.indigo.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(RunqRadii.card),
          border: Border.all(
              color: RunqColors.indigo.withValues(alpha: 0.25), width: 0.8),
        ),
        child: Row(
          children: [
            _ocrBusy
                ? const SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2, color: RunqColors.indigo))
                : Icon(attached ? Icons.check_circle_rounded : Icons.document_scanner_outlined,
                    color: RunqColors.indigo, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _ocrBusy
                        ? 'Reading confirmation…'
                        : (attached ? 'Confirmation attached' : 'Scan confirmation'),
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    attached ? 'Tap to change' : 'Auto-fill amount, payee & date',
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
          ],
        ),
      ),
    );
  }

  /// Tappable selector row inside a grouped card.
  Widget _pickerRow(
    RunqTokens t, {
    required IconData icon,
    required String label,
    required String? value,
    String placeholder = 'Select',
    required VoidCallback onTap,
  }) {
    final hasValue = value != null && value.isNotEmpty;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Row(
          children: [
            Container(
              width: 38, height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: RunqColors.indigo.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: RunqColors.indigo, size: 19),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: RunqText.caption.copyWith(color: t.muted)),
                  const SizedBox(height: 2),
                  Text(hasValue ? value : placeholder,
                      style: RunqText.bodyStrong
                          .copyWith(color: hasValue ? t.ink : t.muted2),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _loadingRow(RunqTokens t, String label) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 18),
        child: Row(children: [
          Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          const Spacer(),
          const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
        ]),
      );

  /// Borderless text field with a label above, for the Optional card.
  Widget _textRow(
    RunqTokens t, {
    required TextEditingController controller,
    required String label,
    required String hint,
    String? helper,
    TextCapitalization cap = TextCapitalization.none,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          TextField(
            controller: controller,
            textCapitalization: cap,
            style: RunqText.body.copyWith(color: t.ink),
            decoration: InputDecoration(
              isDense: true,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 4),
              hintText: hint,
              hintStyle: RunqText.body.copyWith(color: t.muted2),
            ),
          ),
          if (helper != null)
            Text(helper, style: RunqText.micro.copyWith(color: t.muted2)),
        ],
      ),
    );
  }

  Widget _rowDivider(RunqTokens t) =>
      Divider(height: 1, thickness: 0.6, color: t.hairline, indent: 14, endIndent: 14);
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
    final radius = BorderRadius.circular(12);
    // Open near the app bar so the list isn't hidden behind the keyboard.
    return DraggableScrollableSheet(
      initialChildSize: 0.95,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtl) => Column(
          children: [
            sheetHandle(t),
            sheetTitle(t, 'Expense category'),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                controller: _ctl,
                autofocus: true,
                onChanged: (v) => setState(() => _q = v),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: 'Search expense category…',
                  border: OutlineInputBorder(borderRadius: radius),
                  enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: t.hairline)),
                  focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: RunqColors.indigo, width: 1.5)),
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
                              color: RunqColors.indigo.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.sell_outlined, color: RunqColors.indigo, size: 20),
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
    );
  }
}
