// Shared transaction row + day header for the banking screens.
//
// The banking hub (ten most recent rows) and the full ledger both render the
// same card, so it lives here rather than in either screen — a row that looked
// different depending on which list you reached it from would read as two
// different records.

library;

import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/runq_card.dart';
import '../../widgets/sparkle.dart';

/// Groups txns into day sections (newest first) and renders header + rows.
/// `transaction_date` is date-only, so rows inside a day are ordered by
/// `statementSeq` (their position in the source statement, oldest-first) with
/// `createdAt` as the fallback for rows imported before seq existed.
List<Widget> groupTxnsByDate(List<BankTxn> items) {
  final byDate = <String, List<BankTxn>>{};
  for (final t in items) {
    final key = '${t.transactionDate.year}-${t.transactionDate.month.toString().padLeft(2, '0')}-${t.transactionDate.day.toString().padLeft(2, '0')}';
    byDate.putIfAbsent(key, () => []).add(t);
  }
  final sortedKeys = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
  final widgets = <Widget>[];
  final today = DateTime.now();
  for (final k in sortedKeys) {
    final list = byDate[k]!
      ..sort((a, b) {
        final sa = a.statementSeq, sb = b.statementSeq;
        if (sa != null && sb != null && sa != sb) return sb.compareTo(sa);
        final ca = a.createdAt, cb = b.createdAt;
        if (ca != null && cb != null) return cb.compareTo(ca);
        return 0;
      });
    final d = list.first.transactionDate;
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final isToday = d.year == today.year && d.month == today.month && d.day == today.day;
    final isYesterday = today.difference(d).inDays == 1;
    final label = isToday
        ? 'Today · ${d.day} ${m[d.month - 1]}'
        : isYesterday
            ? 'Yesterday · ${d.day} ${m[d.month - 1]}'
            : '${d.day} ${m[d.month - 1]}';
    var credits = 0.0, debits = 0.0;
    for (final txn in list) {
      if (txn.isCredit) {
        credits += txn.amount;
      } else {
        debits += txn.amount;
      }
    }
    widgets.add(TxnDateHeader(label: label, credits: credits, debits: debits));
    for (var i = 0; i < list.length; i++) {
      widgets.add(Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, i == list.length - 1 ? 0 : 8),
        child: TxnRow(txn: list[i]),
      ));
    }
    widgets.add(const SizedBox(height: 8));
  }
  return widgets;
}

class TxnDateHeader extends StatelessWidget {
  final String label;
  final double credits;
  final double debits;
  const TxnDateHeader({super.key, required this.label, required this.credits, required this.debits});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final creditInk = isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk;
    final debitInk = isDark ? const Color(0xFFFCA5A5) : RunqColors.redInk;
    return Container(
      color: t.bgWarm,
      padding: const EdgeInsets.fromLTRB(20, 8, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted2)),
          ),
          if (credits > 0)
            Text('+${formatINR(credits)}',
                style: RunqText.tabular(size: 12, w: FontWeight.w600, color: creditInk)),
          if (credits > 0 && debits > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text('·', style: RunqText.label.copyWith(color: t.muted2)),
            ),
          if (debits > 0)
            Text('−${formatINR(debits)}',
                style: RunqText.tabular(size: 12, w: FontWeight.w600, color: debitInk)),
        ],
      ),
    );
  }
}

class TxnRow extends StatefulWidget {
  final BankTxn txn;
  const TxnRow({super.key, required this.txn});

  @override
  State<TxnRow> createState() => TxnRowState();
}

class TxnRowState extends State<TxnRow> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final txn = widget.txn;
    final isIn = txn.isCredit;

    final dirBg = isIn
        ? (isDark ? RunqColors.greenInk.withValues(alpha: 0.20) : RunqColors.greenBg)
        : (isDark ? RunqColors.redInk.withValues(alpha: 0.20) : RunqColors.redBg);
    final dirInk = isIn
        ? (isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk)
        : (isDark ? const Color(0xFFFCA5A5) : RunqColors.redInk);

    // Lead with the vendor/customer. With no matched party, fall back to the
    // user memo ("paid to X for Y" — who + what) and then the bank's raw
    // narration. The secondary line carries the memo/description underneath;
    // when there's nothing to show there, the recon suggestion chip takes over.
    final party = txn.vendorName ?? txn.customerName;
    final memo = txn.memo;
    final desc = txn.narration ?? txn.reference;
    final matched = txn.reconStatus == 'matched' || txn.reconStatus == 'manually_matched';
    final title = party ?? memo ?? desc ?? 'Transaction';
    final subtitle = party != null ? (memo ?? desc) : (memo != null ? desc : null);

    return RunqCard(
      padding: const EdgeInsets.all(12),
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedSize(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        alignment: Alignment.topCenter,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(color: dirBg, shape: BoxShape.circle),
                  child: Icon(
                    isIn ? Icons.south_rounded : Icons.north_rounded,
                    size: 18,
                    color: dirInk,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              title,
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 1, overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (matched) ...[
                            const SizedBox(width: 4),
                            Icon(Icons.check_circle_rounded,
                                size: 13,
                                color: isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      if (subtitle != null)
                        Text(
                          subtitle,
                          style: RunqText.caption.copyWith(color: t.muted2),
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                        )
                      else
                        _ReconChip(txn: txn),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${isIn ? '+' : '−'}${formatINR(txn.amount.abs())}',
                      style: RunqText.tabular(
                        size: 15,
                        w: FontWeight.w700,
                        color: isIn ? dirInk : t.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 180),
                      child: Icon(Icons.keyboard_arrow_down_rounded,
                          size: 18, color: t.muted2),
                    ),
                  ],
                ),
              ],
            ),
            if (_expanded) _TxnDetail(txn: txn),
          ],
        ),
      ),
    );
  }
}

class _TxnDetail extends StatelessWidget {
  final BankTxn txn;
  const _TxnDetail({required this.txn});

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  String _fmtDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  String _fmtDateTime(DateTime d) {
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour < 12 ? 'AM' : 'PM';
    final mm = d.minute.toString().padLeft(2, '0');
    final ss = d.second.toString().padLeft(2, '0');
    return '${_fmtDate(d)} · $h:$mm:$ss $ampm';
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'matched':
        return 'Matched';
      case 'manually_matched':
        return 'Matched (manual)';
      case 'excluded':
        return 'Excluded';
      default:
        return 'Not matched';
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final party = txn.vendorName ?? txn.customerName;
    final partyLabel = txn.vendorName != null ? 'Vendor' : (txn.customerName != null ? 'Customer' : null);
    final conf = txn.glConfidence;

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        children: [
          Divider(height: 1, thickness: 0.5, color: t.hairline),
          const SizedBox(height: 8),
          _DetailRow(label: 'Type', value: txn.isCredit ? 'Money in' : 'Money out'),
          _DetailRow(label: 'Date', value: _fmtDate(txn.transactionDate)),
          if (txn.createdAt != null)
            _DetailRow(label: 'Imported', value: _fmtDateTime(txn.createdAt!)),
          if (txn.statementSeq != null)
            _DetailRow(label: 'Statement #', value: '${txn.statementSeq}'),
          _DetailRow(
            label: 'Amount',
            value: '${txn.isCredit ? '+' : '−'}${formatINR(txn.amount.abs())}',
          ),
          if (txn.reference != null) _DetailRow(label: 'Reference', value: txn.reference!),
          if (txn.narration != null) _DetailRow(label: 'Description', value: txn.narration!),
          if (txn.memo != null) _DetailRow(label: 'Memo', value: txn.memo!),
          if (party != null && partyLabel != null) _DetailRow(label: partyLabel, value: party),
          if (txn.glAccountName != null)
            _DetailRow(
              label: 'Category',
              value: conf != null
                  ? '${txn.glAccountName} · ${(conf * 100).round()}%'
                  : txn.glAccountName!,
            ),
          _DetailRow(label: 'Status', value: _statusLabel(txn.reconStatus)),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label, value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted2)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: RunqText.caption.copyWith(color: t.ink),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReconChip extends StatelessWidget {
  final BankTxn txn;
  const _ReconChip({required this.txn});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (txn.reconStatus == 'matched' || txn.reconStatus == 'manually_matched') {
      final label = txn.vendorName ?? txn.customerName ?? txn.glAccountName ?? 'Matched';
      final bg = isDark ? RunqColors.greenInk.withValues(alpha: 0.18) : RunqColors.greenBg;
      final ink = isDark ? const Color(0xFF6EE7B7) : RunqColors.greenInk;
      return _Pill(
        bg: bg, ink: ink, icon: Icons.check_rounded,
        label: label,
      );
    }
    if (txn.glAccountName != null) {
      final bg = isDark ? RunqColors.purpleInk.withValues(alpha: 0.20) : RunqColors.purpleBg;
      final ink = isDark ? const Color(0xFFC4B5FD) : RunqColors.purpleInk;
      return _Pill(
        bg: bg, ink: ink, icon: null, sparkle: true,
        label: 'Suggested: ${txn.glAccountName}',
      );
    }
    return Text('Uncategorised', style: RunqText.caption.copyWith(color: t.muted2));
  }
}

class _Pill extends StatelessWidget {
  final Color bg, ink;
  final IconData? icon;
  final bool sparkle;
  final String label;
  const _Pill({required this.bg, required this.ink, this.icon, this.sparkle = false, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(4)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: ink),
            const SizedBox(width: 3),
          ] else if (sparkle) ...[
            Sparkle(size: 9, color: ink),
            const SizedBox(width: 3),
          ],
          Flexible(
            child: Text(label,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: RunqText.micro.copyWith(color: ink)),
          ),
        ],
      ),
    );
  }
}
