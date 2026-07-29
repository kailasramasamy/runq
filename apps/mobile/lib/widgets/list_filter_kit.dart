import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'runq_card.dart';

/// Shared header furniture for the money list screens (Invoices, Bills):
/// a scrolling row of filter pills, two KPI cards, and a search box.

/// One filter pill. Doubles as a scope chip (leading icon + tappable trailing
/// clear) and as a status tab (with a count badge).
class FilterPill extends StatelessWidget {
  final String label;
  final bool active;
  final int badge;
  final IconData? leading, trailing;
  final VoidCallback onTap;
  final VoidCallback? onTrailing;
  const FilterPill({
    super.key,
    required this.label,
    required this.active,
    required this.onTap,
    this.badge = 0,
    this.leading,
    this.trailing,
    this.onTrailing,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fg = active ? t.surface : t.ink;
    final badgeBg = active ? t.surface.withValues(alpha: 0.18) : t.hairlineSoft;
    return Material(
      color: active ? t.ink : t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(color: active ? Colors.transparent : t.hairline, width: 0.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.fromLTRB(leading == null ? 14 : 10, 0, onTrailing != null ? 6 : 12, 0),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (leading != null) ...[
                Icon(leading, size: 14, color: fg),
                const SizedBox(width: 6),
              ],
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 200),
                child: Text(label,
                    style: RunqText.caption.copyWith(color: fg, fontWeight: FontWeight.w600),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              if (badge > 0) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(color: badgeBg, borderRadius: BorderRadius.circular(999)),
                  child: Text('$badge',
                      style: RunqText.tabular(
                          size: 11, w: FontWeight.w700, color: active ? t.surface : t.muted)),
                ),
              ],
              if (trailing != null) ...[
                const SizedBox(width: 2),
                if (onTrailing != null)
                  InkWell(
                    onTap: onTrailing,
                    customBorder: const CircleBorder(),
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Icon(trailing, size: 14, color: fg),
                    ),
                  )
                else
                  Icon(trailing, size: 16, color: fg),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact KPI card for the 2-column header grid — count + headline amount.
class ListStatCard extends StatelessWidget {
  final IconData icon;
  final String label, value;
  /// Brand-tinted variant for the headline amount card.
  final bool tinted;
  const ListStatCard({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.tinted = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Theme-aware brand tokens keep the tinted card subtle in dark mode — the
    // saturated light-mode brand reads far too loud on near-black.
    final accent = tinted ? t.brand : t.muted;
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      color: tinted ? t.brandSubtle : t.surface,
      border: Border.all(
        color: tinted ? t.brand.withValues(alpha: 0.22) : t.hairline,
        width: 0.5,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: accent),
              const SizedBox(width: 6),
              Flexible(
                child: Text(label,
                    style: RunqText.micro.copyWith(color: accent, letterSpacing: 0.5),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(value,
              style: RunqText.tabular(size: 22, w: FontWeight.w700, color: tinted ? t.brand : t.ink),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

/// Always-visible search box sitting above a list.
class ListSearchField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final String hint;
  const ListSearchField({
    super.key,
    required this.controller,
    required this.onChanged,
    required this.hint,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      onChanged: onChanged,
      textCapitalization: TextCapitalization.none,
      textInputAction: TextInputAction.search,
      style: RunqText.body.copyWith(color: t.ink),
      decoration: InputDecoration(
        isDense: true,
        filled: true,
        fillColor: t.inputFill,
        hintText: hint,
        hintStyle: RunqText.body.copyWith(color: t.muted2),
        prefixIcon: Icon(Icons.search_rounded, size: 20, color: t.muted2),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                icon: Icon(Icons.close_rounded, size: 18, color: t.muted2),
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
              ),
        contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        border: _border(t.hairline),
        enabledBorder: _border(t.hairline),
        focusedBorder: _border(t.brand),
      ),
    );
  }

  OutlineInputBorder _border(Color c) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: c),
      );
}

/// Day header for a date-grouped list: "Today" / "Yesterday" / "12 Jan 2026".
class ListDayHeader extends StatelessWidget {
  final DateTime day;
  const ListDayHeader({super.key, required this.day});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 6, 2, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text(listDayLabel(day), style: RunqText.h4.copyWith(color: t.ink)),
          const SizedBox(width: 8),
          Text(listDayMon(day), style: RunqText.caption.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

/// Bold day-over-month block that stands in for a row avatar, so the date
/// reads at a glance on lists too sparse to justify day section headers.
class ListDateBlock extends StatelessWidget {
  final DateTime date;
  const ListDateBlock({super.key, required this.date});

  @override
  Widget build(BuildContext context) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    final t = RT(context);
    return Container(
      width: 46,
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('${date.day}',
              style: RunqText.tabular(size: 18, w: FontWeight.w700, color: t.ink)),
          // Month and two-digit year share one line, so the block stays two
          // rows tall and the same width: "14 / AUG '26".
          Text("${months[date.month - 1]} '${(date.year % 100).toString().padLeft(2, '0')}",
              style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.3)),
        ],
      ),
    );
  }
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String listDayLabel(DateTime d) {
  final now = DateTime.now();
  final days =
      DateTime(now.year, now.month, now.day).difference(DateTime(d.year, d.month, d.day)).inDays;
  if (days == 0) return 'Today';
  if (days == 1) return 'Yesterday';
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

String listDayMon(DateTime d) => '${d.day} ${_months[d.month - 1]}';

String listRangeLabel(DateTime? from, DateTime? to) {
  if (from == null && to == null) return 'All time';
  String f(DateTime d) => '${d.day} ${_months[d.month - 1]}';
  if (from != null && to != null) return '${f(from)} – ${f(to)}';
  if (from != null) return 'After ${f(from)}';
  return 'Until ${f(to!)}';
}

/// Groups date-ordered rows into consecutive same-day buckets.
List<({DateTime day, List<T> items})> groupByDay<T>(
  List<T> rows,
  DateTime Function(T) dateOf,
) {
  bool sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;
  final out = <({DateTime day, List<T> items})>[];
  for (final row in rows) {
    final d = dateOf(row);
    if (out.isNotEmpty && sameDay(out.last.day, d)) {
      out.last.items.add(row);
    } else {
      out.add((day: d, items: <T>[row]));
    }
  }
  return out;
}
