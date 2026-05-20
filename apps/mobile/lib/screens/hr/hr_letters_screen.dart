// My letters — employee can request letters from HR (offer, experience,
// salary certificate, address proof, etc.) and view ones HR has issued.
//
// Sections:
//   * Pending requests (status='requested') — withdraw if needed.
//   * Issued letters (status='issued')      — tap to view, status pill.

library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/hr_phase_next.dart';
import '../../widgets/runq_snack.dart';

const _hrAccent = Color(0xFF0891B2);

class HrLettersScreen extends ConsumerWidget {
  const HrLettersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myLettersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My letters')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openRequestSheet(context, ref),
        backgroundColor: _hrAccent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Request letter'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myLettersProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (rows) => _Body(rows: rows),
        ),
      ),
    );
  }

  void _openRequestSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Color.alphaBlend(
        _hrAccent.withValues(alpha: 0.10),
        Theme.of(context).colorScheme.surface,
      ),
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: const _RequestLetterForm(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.rows});
  final List<HrLetter> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.all(32),
            child: Column(children: [
              const SizedBox(height: 80),
              Icon(Icons.mark_email_unread_outlined, size: 56, color: Theme.of(context).hintColor),
              const SizedBox(height: 16),
              const Text(
                'No letters yet',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Text(
                'Tap "Request letter" below to ask HR for an offer letter, salary certificate, address proof, and more.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Theme.of(context).hintColor, fontSize: 13),
              ),
            ]),
          ),
        ],
      );
    }
    final pending = rows.where((r) => r.status == 'requested').toList();
    final issued = rows.where((r) => r.status == 'issued').toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 96),
      children: [
        if (pending.isNotEmpty) ...[
          _SectionHeader(label: 'Pending HR review', count: pending.length),
          for (final l in pending) _LetterCard(letter: l),
        ],
        if (issued.isNotEmpty) ...[
          _SectionHeader(label: 'Issued', count: issued.length),
          for (final l in issued) _LetterCard(letter: l),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, required this.count});
  final String label;
  final int count;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
      child: Row(children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.8,
            color: theme.hintColor,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(
            color: theme.hintColor.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text('$count', style: TextStyle(fontSize: 11, color: theme.hintColor, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

class _LetterCard extends ConsumerStatefulWidget {
  const _LetterCard({required this.letter});
  final HrLetter letter;
  @override
  ConsumerState<_LetterCard> createState() => _LetterCardState();
}

class _LetterCardState extends ConsumerState<_LetterCard> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final l = widget.letter;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isIssued = l.status == 'issued';
    final isPending = l.status == 'requested';
    final color = isIssued ? Colors.green : _hrAccent;

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 0),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: isIssued
            ? () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => _LetterDetailScreen(letter: l),
                ))
            : null,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: isDark ? 0.18 : 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_kindIcon(l.kind), color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_kindLabel(l.kind), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  const SizedBox(height: 2),
                  if (isIssued && l.subject != null && l.subject!.isNotEmpty)
                    Text(l.subject!, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: theme.hintColor))
                  else if (isIssued && l.issuedAt != null)
                    Text('Issued ${DateFormat('d MMM y').format(l.issuedAt!.toLocal())}',
                        style: TextStyle(fontSize: 12, color: theme.hintColor))
                  else if (isPending && l.createdAt != null)
                    Text('Requested ${DateFormat('d MMM y').format(l.createdAt!.toLocal())}',
                        style: TextStyle(fontSize: 12, color: theme.hintColor)),
                ]),
              ),
              _StatusPill(
                text: isIssued ? 'Issued' : 'Pending',
                color: isIssued ? Colors.green : Colors.orange,
                icon: isIssued ? Icons.check_circle : Icons.schedule,
              ),
            ]),
            if (isPending && l.requestedReason != null && l.requestedReason!.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.hintColor.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(l.requestedReason!, style: const TextStyle(fontSize: 13)),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _busy ? null : _withdraw,
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('Withdraw'),
                  style: TextButton.styleFrom(foregroundColor: Colors.red),
                ),
              ),
            ],
            if (isIssued)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(children: [
                  Icon(Icons.arrow_outward, size: 14, color: theme.hintColor),
                  const SizedBox(width: 4),
                  Text('Tap to view', style: TextStyle(fontSize: 12, color: theme.hintColor)),
                ]),
              ),
          ]),
        ),
      ),
    );
  }

  Future<void> _withdraw() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Withdraw request?'),
        content: const Text('You can request again later if you need it.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Withdraw')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.withdrawLetterRequest(widget.letter.id);
      ref.invalidate(myLettersProvider);
      if (mounted) showRunqSnack(context, 'Request withdrawn', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.text, required this.color, required this.icon});
  final String text;
  final Color color;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class _LetterDetailScreen extends StatefulWidget {
  const _LetterDetailScreen({required this.letter});
  final HrLetter letter;
  @override
  State<_LetterDetailScreen> createState() => _LetterDetailScreenState();
}

class _LetterDetailScreenState extends State<_LetterDetailScreen> {
  File? _pdfFile;
  bool _loading = true;
  String? _error;
  int _pages = 0;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _fetchPdf();
  }

  Future<void> _fetchPdf() async {
    try {
      final bytes = await hrPhaseNextRepo.downloadLetterPdf(widget.letter.id);
      final dir = await getTemporaryDirectory();
      final safeName = (widget.letter.subject ?? widget.letter.kind)
          .replaceAll(RegExp(r'[^a-zA-Z0-9_\- ]'), '_');
      final file = File('${dir.path}/$safeName.pdf');
      await file.writeAsBytes(bytes);
      if (!mounted) return;
      setState(() {
        _pdfFile = file;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _share() async {
    if (_pdfFile == null) return;
    final fileName = _pdfFile!.path.split('/').last;
    // iPad requires a sharePositionOrigin anchor or the platform throws.
    // Use the screen's RenderBox so the popover anchors somewhere sensible
    // even if we can't reference the trigger button directly.
    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
    await Share.shareXFiles(
      [XFile(_pdfFile!.path, mimeType: 'application/pdf', name: fileName)],
      text: widget.letter.subject ?? 'Letter from your employer',
      sharePositionOrigin: origin,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final letter = widget.letter;
    return Scaffold(
      appBar: AppBar(
        title: Text(_kindLabel(letter.kind)),
        actions: [
          if (_pdfFile != null)
            IconButton(
              tooltip: 'Share / save',
              onPressed: _share,
              icon: const Icon(Icons.ios_share),
            ),
        ],
        bottom: letter.issuedAt == null
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(28),
                child: Container(
                  width: double.infinity,
                  color: _hrAccent.withValues(alpha: theme.brightness == Brightness.dark ? 0.20 : 0.10),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Row(children: [
                    Icon(Icons.verified, size: 14, color: _hrAccent),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Issued on ${DateFormat('d MMMM y').format(letter.issuedAt!.toLocal())}'
                        '${_pages > 0 ? '  •  page ${_currentPage + 1} / $_pages' : ''}',
                        style: TextStyle(fontSize: 12, color: _hrAccent, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ]),
                ),
              ),
      ),
      body: _buildBody(theme),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null || _pdfFile == null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.error_outline, size: 48, color: theme.hintColor),
          const SizedBox(height: 12),
          Text('Could not load PDF', style: TextStyle(color: theme.hintColor)),
          if (_error != null) ...[
            const SizedBox(height: 4),
            Text(_error!, style: TextStyle(color: theme.hintColor, fontSize: 12), textAlign: TextAlign.center),
          ],
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () { setState(() { _loading = true; _error = null; }); _fetchPdf(); },
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ]),
      );
    }
    return Container(
      color: theme.brightness == Brightness.dark ? Colors.black : const Color(0xFFE5E5E5),
      child: PDFView(
        filePath: _pdfFile!.path,
        enableSwipe: true,
        swipeHorizontal: false,
        autoSpacing: true,
        pageSnap: false,
        fitPolicy: FitPolicy.WIDTH,
        onRender: (pages) {
          if (!mounted) return;
          setState(() => _pages = pages ?? 0);
        },
        onPageChanged: (page, _) {
          if (!mounted) return;
          setState(() => _currentPage = page ?? 0);
        },
        onError: (e) {
          if (!mounted) return;
          setState(() => _error = e.toString());
        },
      ),
    );
  }
}

// ─── Request sheet ─────────────────────────────────────────────────────────

class _RequestLetterForm extends ConsumerStatefulWidget {
  const _RequestLetterForm();
  @override
  ConsumerState<_RequestLetterForm> createState() => _RequestLetterFormState();
}

class _RequestLetterFormState extends ConsumerState<_RequestLetterForm> {
  final _formKey = GlobalKey<FormState>();
  String _kind = 'salary_certificate';
  final _reason = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await hrPhaseNextRepo.requestLetter(kind: _kind, reason: _reason.text.trim());
      ref.invalidate(myLettersProvider);
      if (mounted) {
        Navigator.pop(context);
        showRunqSnack(context, 'Request submitted — HR will issue your letter', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Request a letter', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            'HR will review and issue the letter to you in this app.',
            style: TextStyle(color: theme.hintColor, fontSize: 13),
          ),
          const SizedBox(height: 16),
          const Text('Letter type', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _kindOptions.map((opt) {
              final selected = _kind == opt.value;
              return InkWell(
                onTap: () => setState(() => _kind = opt.value),
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: selected ? _hrAccent : Colors.transparent,
                    border: Border.all(
                      color: selected ? _hrAccent : theme.dividerColor,
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(_kindIcon(opt.value), size: 14, color: selected ? Colors.white : _hrAccent),
                    const SizedBox(width: 6),
                    Text(
                      opt.label,
                      style: TextStyle(
                        fontSize: 13,
                        color: selected ? Colors.white : null,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ]),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _reason,
            decoration: InputDecoration(
              labelText: 'Reason for the request',
              hintText: _reasonHint(_kind),
              border: const OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
            textCapitalization: TextCapitalization.sentences,
            inputFormatters: [LengthLimitingTextInputFormatter(2000)],
            maxLines: 4,
            validator: (v) {
              if ((v ?? '').trim().isEmpty) return 'Please add a short reason';
              return null;
            },
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _hrAccent),
              onPressed: _saving ? null : _submit,
              child: Text(_saving ? 'Submitting…' : 'Submit request'),
            ),
          ),
        ]),
      ),
    );
  }
}

class _KindOption {
  final String value, label;
  const _KindOption(this.value, this.label);
}

const _kindOptions = <_KindOption>[
  _KindOption('salary_certificate', 'Salary certificate'),
  _KindOption('address_proof', 'Address proof'),
  _KindOption('experience', 'Experience letter'),
  _KindOption('relieving', 'Relieving letter'),
  _KindOption('confirmation', 'Confirmation letter'),
  _KindOption('appointment', 'Appointment letter'),
  _KindOption('offer', 'Offer letter'),
  _KindOption('increment', 'Increment letter'),
  _KindOption('other', 'Other'),
];

String _kindLabel(String k) {
  for (final o in _kindOptions) {
    if (o.value == k) return o.label;
  }
  return k.replaceAll('_', ' ');
}

IconData _kindIcon(String k) => switch (k) {
  'salary_certificate' => Icons.account_balance_wallet_outlined,
  'address_proof' => Icons.home_work_outlined,
  'experience' => Icons.workspace_premium_outlined,
  'relieving' => Icons.logout,
  'confirmation' => Icons.verified_outlined,
  'appointment' => Icons.event_available_outlined,
  'offer' => Icons.handshake_outlined,
  'increment' => Icons.trending_up,
  _ => Icons.description_outlined,
};

String _reasonHint(String k) => switch (k) {
  'salary_certificate' => 'e.g. bank loan application',
  'address_proof' => 'e.g. rental agreement, utility connection',
  'experience' => 'e.g. for visa or new role application',
  'relieving' => 'e.g. joining a new employer',
  _ => 'Briefly describe why you need this letter',
};
