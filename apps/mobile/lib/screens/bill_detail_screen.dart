import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/status_pill.dart';

/// Bills are amendable while the user can still walk it back: drafts edit
/// freely, and matched/approved bills can be edited or deleted until a
/// payment goes out. After that, adjustments need a debit note — direct
/// edits would break the matched payment allocation.
bool _canAmendBill(BillWithDetails bill) {
  final paid = bill.amountPaid;
  if (bill.status == 'draft') return true;
  if ((bill.status == 'matched' || bill.status == 'approved') && paid == 0) return true;
  return false;
}

/// Bottom card now hosts only the primary state-CTA — Approve (drafts) or
/// Mark as paid (approved / partially-paid with a balance). Edit + Delete
/// moved to the top-right options menu.
bool _hasPrimaryCta(BillWithDetails bill) {
  if (bill.status == 'draft') return true;
  if ((bill.status == 'approved' || bill.status == 'partially_paid') &&
      bill.balanceDue > 0) {
    return true;
  }
  return false;
}

class BillDetailScreen extends ConsumerWidget {
  final String id;
  const BillDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(billDetailProvider(id));
    // Single mutation hook used by every action on this screen (approve,
    // mark paid, delete). Invalidates the detail AND the list/summary so
    // the bills screen reflects the change without a manual pull-to-refresh.
    void onMutated() {
      ref.invalidate(billDetailProvider(id));
      ref.invalidate(billsProvider);
      ref.invalidate(billsSummaryProvider);
    }
    return Scaffold(
      body: SafeArea(
        child: AsyncSlot<BillWithDetails>(
          value: detail,
          onRetry: () => ref.invalidate(billDetailProvider(id)),
          data: (bill) => Column(
            children: [
              _Header(bill: bill, onMutated: onMutated),
              Expanded(
                child: ListView(
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _HeroCard(bill: bill),
                    const SizedBox(height: 14),
                    if (bill.items.isNotEmpty) ...[
                      _LineItemsCard(items: bill.items),
                      const SizedBox(height: 14),
                    ],
                    _GstBreakdownCard(bill: bill),
                    const SizedBox(height: 14),
                    _AttachmentsCard(billId: id),
                    if (_hasPrimaryCta(bill)) ...[
                      const SizedBox(height: 14),
                      _ActionsCard(bill: bill, onChanged: onMutated),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatefulWidget {
  final BillWithDetails bill;
  /// Called after a header mutation (delete) so the parent can invalidate
  /// the detail + bills list providers.
  final VoidCallback onMutated;
  const _Header({required this.bill, required this.onMutated});

  @override
  State<_Header> createState() => _HeaderState();
}

class _HeaderState extends State<_Header> {
  bool _busy = false;

  void _openEditor() {
    if (_busy) return;
    // Push the full edit screen. It owns its own save flow and refreshes
    // providers on success; the detail page rerenders when we come back.
    context.push('/bills/${widget.bill.id}/edit');
  }

  Future<void> _showOptionsSheet() async {
    if (_busy) return;
    final t = RT(context);
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: t.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sctx) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: 14),
              _OptionTile(
                icon: Icons.edit_outlined,
                tint: RunqColors.indigo,
                title: 'Edit bill',
                subtitle: 'Change invoice number, dates, line items',
                onTap: () => Navigator.pop(sctx, 'edit'),
              ),
              _OptionTile(
                icon: Icons.delete_outline_rounded,
                tint: RunqColors.redInk,
                title: 'Delete bill',
                subtitle: 'Permanently remove the bill and its attachment',
                destructive: true,
                onTap: () => Navigator.pop(sctx, 'delete'),
              ),
              const SizedBox(height: 4),
            ],
          ),
        ),
      ),
    );
    if (!mounted) return;
    switch (picked) {
      case 'edit':
        _openEditor();
        break;
      case 'delete':
        await _delete();
        break;
    }
  }

  Future<void> _delete() async {
    if (_busy) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete bill'),
        content: Text(
          'Permanently delete bill ${widget.bill.invoiceNumber}? '
          'The line items and any attached scanned document will be removed. This cannot be undone.',
          style: RunqText.body.copyWith(fontSize: 14),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: RunqColors.redInk),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await billsRepo.remove(widget.bill.id);
      if (!mounted) return;
      showRunqSnack(context, 'Bill deleted', kind: SnackKind.success);
      // Refresh list/summary first so the row disappears as soon as the
      // user lands back on the bills screen — then pop off the detail.
      widget.onMutated();
      context.pop();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not delete.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final canEdit = _canAmendBill(widget.bill);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
            color: t.ink,
          ),
          Expanded(child: Center(child: Text(widget.bill.invoiceNumber, style: RunqText.bodyStrong.copyWith(color: t.ink)))),
          if (canEdit)
            // Tap opens a clean bottom sheet with Edit / Delete tiles instead
            // of a Material popup menu — sits better with the rest of the
            // app's bottom-sheet conventions (bill intake, invoice quick).
            Material(
              color: t.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: BorderSide(color: t.hairline, width: 0.5),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: _busy ? null : _showOptionsSheet,
                child: SizedBox(
                  width: 40,
                  height: 40,
                  child: Center(
                    child: _busy
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(Icons.more_vert_rounded, size: 20, color: t.ink),
                  ),
                ),
              ),
            )
          else
            const SizedBox(width: 40),
        ],
      ),
    );
  }
}

/// Tile used inside the header options bottom sheet. Mirrors the bill-intake
/// chooser tiles so the two sheets feel like part of the same family.
class _OptionTile extends StatelessWidget {
  final IconData icon;
  final Color tint;
  final String title, subtitle;
  final bool destructive;
  final VoidCallback onTap;
  const _OptionTile({
    required this.icon,
    required this.tint,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final titleColor = destructive ? tint : t.ink;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: tint, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: RunqText.bodyStrong.copyWith(color: titleColor)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: RunqText.caption.copyWith(color: t.muted, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

class _BillEditResult {
  final String invoiceNumber;
  final DateTime invoiceDate;
  final DateTime dueDate;
  _BillEditResult({required this.invoiceNumber, required this.invoiceDate, required this.dueDate});
}

class _BillEditSheet extends StatefulWidget {
  final BillWithDetails bill;
  const _BillEditSheet({required this.bill});

  @override
  State<_BillEditSheet> createState() => _BillEditSheetState();
}

class _BillEditSheetState extends State<_BillEditSheet> {
  late final TextEditingController _number;
  late DateTime _invoiceDate;
  late DateTime _dueDate;

  @override
  void initState() {
    super.initState();
    _number = TextEditingController(text: widget.bill.invoiceNumber);
    _invoiceDate = widget.bill.invoiceDate;
    _dueDate = widget.bill.dueDate;
  }

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  String _fmt(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  Future<void> _pickDate({required bool isDueDate}) async {
    final initial = isDueDate ? _dueDate : _invoiceDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      if (isDueDate) {
        _dueDate = picked;
      } else {
        _invoiceDate = picked;
      }
    });
  }

  void _save() {
    final num = _number.text.trim();
    if (num.isEmpty) {
      showRunqSnack(context, 'Invoice number is required', kind: SnackKind.error);
      return;
    }
    if (_dueDate.isBefore(_invoiceDate)) {
      showRunqSnack(context, 'Due date cannot be before invoice date', kind: SnackKind.error);
      return;
    }
    Navigator.pop(context, _BillEditResult(
      invoiceNumber: num,
      invoiceDate: _invoiceDate,
      dueDate: _dueDate,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            width: 40, height: 4,
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
          ),
          Text('Edit bill', style: RunqText.h3),
          const SizedBox(height: 14),
          TextField(
            controller: _number,
            decoration: const InputDecoration(labelText: 'Invoice number'),
          ),
          const SizedBox(height: 12),
          _DateField(label: 'Invoice date', value: _fmt(_invoiceDate), onTap: () => _pickDate(isDueDate: false)),
          const SizedBox(height: 12),
          _DateField(label: 'Due date', value: _fmt(_dueDate), onTap: () => _pickDate(isDueDate: true)),
          const SizedBox(height: 20),
          SizedBox(
            height: 48,
            child: FilledButton(onPressed: _save, child: const Text('Save changes')),
          ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  final String label, value;
  final VoidCallback onTap;
  const _DateField({required this.label, required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: Icon(Icons.calendar_today_rounded, size: 16, color: t.muted),
        ),
        child: Text(value, style: RunqText.body.copyWith(color: t.ink)),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  final BillWithDetails bill;
  const _HeroCard({required this.bill});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  String _shortDate(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RqAvatar(name: bill.vendorName, size: 44, filled: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(bill.vendorName,
                        style: RunqText.h3.copyWith(fontSize: 16),
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text(
                      'Issued ${_shortDate(bill.invoiceDate)}  ·  Due ${_date(bill.dueDate)}',
                      style: RunqText.caption.copyWith(fontSize: 12, color: t.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Status + match-state chips live next to the vendor so the
              // bill's posture is answered at the same glance as "from whom?"
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  StatusPill(bill.status),
                  if (bill.matchStatus == 'matched') ...[
                    const SizedBox(height: 4),
                    _MatchChip(matched: true),
                  ] else if (bill.status == 'pending_match' || bill.matchStatus == 'mismatch') ...[
                    const SizedBox(height: 4),
                    _MatchChip(matched: false),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 18),
          // Drop the redundant 'TOTAL' eyebrow — the giant rupee number
          // is self-evidently the bill total, especially with the SUMMARY
          // card right below.
          Text(formatINR(bill.totalAmount, paise: true),
              style: RunqText.display.copyWith(fontSize: 30, color: t.ink, height: 1.0)),
          if (bill.balanceDue > 0 && bill.balanceDue != bill.totalAmount) ...[
            const SizedBox(height: 6),
            Text('${formatINR(bill.balanceDue, paise: true)} balance due',
                style: RunqText.caption.copyWith(color: RunqColors.redInk, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}

class _MatchChip extends StatelessWidget {
  final bool matched;
  const _MatchChip({required this.matched});

  @override
  Widget build(BuildContext context) {
    final color = matched ? RunqColors.greenInk : RunqColors.amberInk;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(matched ? Icons.check_circle_rounded : Icons.error_outline_rounded, size: 12, color: color),
        const SizedBox(width: 3),
        Text(matched ? '3WM' : 'Match needed',
            style: RunqText.caption.copyWith(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _LineItemsCard extends StatelessWidget {
  final List<BillItem> items;
  const _LineItemsCard({required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('LINE ITEMS', style: RunqText.label),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1.5),
                decoration: BoxDecoration(
                  color: RunqColors.indigo.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('${items.length}',
                    style: RunqText.caption.copyWith(
                      fontSize: 10.5,
                      color: RunqColors.indigo,
                      fontWeight: FontWeight.w800,
                    )),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < items.length; i++) ...[
            _ItemRow(item: items[i]),
            if (i < items.length - 1)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Container(height: 1, color: t.muted2.withValues(alpha: 0.30)),
              ),
          ],
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final BillItem item;
  const _ItemRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.itemName.isEmpty ? item.description : item.itemName,
                style: RunqText.bodyStrong.copyWith(fontSize: 14, color: t.ink, height: 1.3),
              ),
              const SizedBox(height: 4),
              Text(
                '${item.quantity.toStringAsFixed(item.quantity == item.quantity.toInt() ? 0 : 2)} × ${formatINR(item.unitPrice, paise: true)}',
                style: RunqText.caption.copyWith(fontSize: 11.5, color: t.muted),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Text(formatINR(item.amount, paise: true),
            style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
      ],
    );
  }
}

class _GstBreakdownCard extends StatelessWidget {
  final BillWithDetails bill;
  const _GstBreakdownCard({required this.bill});

  // Derive the GST split from line item names. Bills are now transcribed
  // verbatim — CGST / SGST / IGST / UTGST / Cess rows are stored as ordinary
  // line items, not in the header columns. Reconstitute the breakdown by
  // pattern-matching the item names so the detail page can still show the
  // expected Subtotal / CGST / SGST / Total layout.
  ({double subtotal, double cgst, double sgst, double igst, double cess}) _split() {
    var cgst = 0.0, sgst = 0.0, igst = 0.0, cess = 0.0, other = 0.0;
    for (final it in bill.items) {
      final n = it.itemName.toUpperCase();
      // Strip "OUTPUT " / "INPUT " prefixes so a B2B bill's "Output CGST" and
      // an inward bill's "Input CGST" both classify the same way.
      final stripped = n.replaceFirst(RegExp(r'^(OUTPUT|INPUT)\s+'), '');
      if (stripped.startsWith('CGST') || stripped.contains(' CGST')) {
        cgst += it.amount;
      } else if (stripped.startsWith('SGST') || stripped.contains(' SGST') || stripped.startsWith('UTGST')) {
        sgst += it.amount;
      } else if (stripped.startsWith('IGST') || stripped.contains(' IGST')) {
        igst += it.amount;
      } else if (stripped.startsWith('CESS') || stripped.contains(' CESS')) {
        cess += it.amount;
      } else {
        other += it.amount;
      }
    }
    return (subtotal: other, cgst: cgst, sgst: sgst, igst: igst, cess: cess);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final s = _split();
    final hasGst = s.cgst > 0 || s.sgst > 0 || s.igst > 0 || s.cess > 0;
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('SUMMARY', style: RunqText.label),
          const SizedBox(height: 10),
          _LineRow(label: 'Subtotal', value: formatINR(s.subtotal, paise: true)),
          if (hasGst) ...[
            if (s.igst > 0) _LineRow(label: 'IGST', value: formatINR(s.igst, paise: true)),
            if (s.cgst > 0) _LineRow(label: 'CGST', value: formatINR(s.cgst, paise: true)),
            if (s.sgst > 0) _LineRow(label: 'SGST', value: formatINR(s.sgst, paise: true)),
            if (s.cess > 0) _LineRow(label: 'Cess', value: formatINR(s.cess, paise: true)),
          ] else
            _LineRow(label: 'GST', value: '₹0.00'),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Container(height: 1, color: t.muted2.withValues(alpha: 0.30)),
          ),
          _LineRow(label: 'Total', value: formatINR(bill.totalAmount, paise: true), strong: true),
          if (!hasGst) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: t.bgWarm,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, size: 14, color: t.muted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'No GST charged. Bill of supply — not eligible for input tax credit.',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final String label, value;
  final bool strong;
  const _LineRow({required this.label, required this.value, this.strong = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final labelStyle = strong
        ? RunqText.bodyStrong.copyWith(fontSize: 15, color: t.ink)
        : RunqText.body.copyWith(fontSize: 13, color: t.ink2);
    final valueStyle = strong
        ? RunqText.tabular(size: 16, w: FontWeight.w800, color: t.ink)
        : RunqText.tabular(size: 13, w: FontWeight.w600, color: t.ink);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(child: Text(label, style: labelStyle)),
          Text(value, style: valueStyle),
        ],
      ),
    );
  }
}

class _AttachmentsCard extends ConsumerStatefulWidget {
  final String billId;
  const _AttachmentsCard({required this.billId});

  @override
  ConsumerState<_AttachmentsCard> createState() => _AttachmentsCardState();
}

class _AttachmentsCardState extends ConsumerState<_AttachmentsCard> {
  @override
  Widget build(BuildContext context) {
    final attachments = ref.watch(billAttachmentsProvider(widget.billId));
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ORIGINAL DOCUMENT', style: RunqText.label),
          const SizedBox(height: 8),
          attachments.when(
            data: (list) {
              if (list.isEmpty) {
                return Text(
                  'No file attached. New scans automatically save the original.',
                  style: RunqText.caption.copyWith(color: RT(context).muted, fontSize: 12),
                );
              }
              return Column(
                children: [
                  for (final a in list)
                    _AttachmentRow(
                      attachment: a,
                      onTap: () => _viewAttachment(a),
                    ),
                ],
              );
            },
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
            error: (_, __) => Text(
              "Couldn't load attachments.",
              style: RunqText.caption.copyWith(color: RunqColors.redInk, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  void _viewAttachment(BillAttachment a) {
    // Push the dedicated viewer screen — it owns download, in-app preview,
    // and the share action. Keeps the bill detail snappy and gives the
    // user a chance to inspect before sharing.
    context.push('/attachments/view', extra: a);
  }
}

class _AttachmentRow extends StatelessWidget {
  final BillAttachment attachment;
  final VoidCallback onTap;
  const _AttachmentRow({required this.attachment, required this.onTap});

  IconData get _icon {
    final m = attachment.mimeType;
    if (m == 'application/pdf') return Icons.picture_as_pdf_outlined;
    if (m.startsWith('image/')) return Icons.image_outlined;
    return Icons.insert_drive_file_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: t.bgWarm,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_icon, size: 18, color: t.muted),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(attachment.fileName, style: RunqText.bodyStrong.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(attachment.prettySize, style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Actions on a draft bill — Approve (post to GL, ready for payment) or
/// Delete (permanent removal of the bill, line items, and attached file).
/// Hidden for non-draft statuses.
class _ActionsCard extends StatefulWidget {
  final BillWithDetails bill;
  final VoidCallback onChanged;
  const _ActionsCard({required this.bill, required this.onChanged});

  @override
  State<_ActionsCard> createState() => _ActionsCardState();
}

class _ActionsCardState extends State<_ActionsCard> {
  bool _busy = false;

  Future<bool> _confirm({
    required String title,
    required String body,
    required String confirmLabel,
    Color? confirmColor,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body, style: RunqText.body.copyWith(fontSize: 14)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: confirmColor != null ? FilledButton.styleFrom(backgroundColor: confirmColor) : null,
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _approve() async {
    final ok = await _confirm(
      title: 'Approve bill',
      body: 'Approve bill ${widget.bill.invoiceNumber} for ${formatINR(widget.bill.totalAmount, paise: true)}? '
          'It will be posted to your books and become available for payment.',
      confirmLabel: 'Approve',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await billsRepo.approve(widget.bill.id);
      if (!mounted) return;
      showRunqSnack(context, 'Bill approved', kind: SnackKind.success);
      widget.onChanged();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not approve.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _markPaid() async {
    final amount = widget.bill.balanceDue;
    if (amount <= 0) return;
    final ok = await _confirm(
      title: 'Mark as paid',
      body: 'Record ${formatINR(amount, paise: true)} for bill ${widget.bill.invoiceNumber} as paid by you. '
          'Books a Petty Cash payment with an owner-injection journal entry so the cash trail stays balanced.',
      confirmLabel: 'Mark paid',
      confirmColor: const Color(0xFF047857),
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await billsRepo.markPaid(widget.bill.id, amount: amount);
      if (!mounted) return;
      showRunqSnack(context, 'Marked ${formatINR(amount, compact: true)} paid',
          kind: SnackKind.success);
      widget.onChanged();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Could not mark paid.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDraft = widget.bill.status == 'draft';
    // Single state-CTA: Approve drafts, otherwise Mark as paid (the parent
    // gates this card via _hasPrimaryCta so we know one of these applies).
    final blurb = isDraft
        ? 'Approve to post the bill to your books and make it available for payment.'
        : 'Settle the balance — books an owner-paid payment via Petty Cash with a paired owner-injection JE.';
    final spinner = _busy
        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
        : null;
    final button = isDraft
        ? FilledButton.icon(
            onPressed: _busy ? null : _approve,
            icon: spinner ?? const Icon(Icons.check_rounded, size: 18),
            label: const Text('Approve', style: TextStyle(height: 1.0)),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
          )
        : FilledButton.icon(
            onPressed: _busy ? null : _markPaid,
            icon: spinner ?? const Icon(Icons.check_rounded, size: 18),
            label: Text(
              'Mark ${formatINR(widget.bill.balanceDue, compact: true)} paid',
              style: const TextStyle(height: 1.0),
            ),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF047857),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
          );
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ACTIONS', style: RunqText.label),
          const SizedBox(height: 4),
          Text(
            blurb,
            style: RunqText.caption.copyWith(color: RT(context).muted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          SizedBox(height: 44, width: double.infinity, child: button),
        ],
      ),
    );
  }
}
