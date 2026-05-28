// Shared Flutter widgets for the Purchase & Procurement mobile module.
//
// Mirrors `inv_primitives.dart` in structure but skinned with `PurColors`
// (violet). Scoped to Phase 1 essentials (PO list / detail / create /
// edit); Home dashboard primitives (KPI strip, action grid, activity
// rows, gradient hero) land in Phase 5.
//
// Generated from the `/module-ui` skill template — see
// `~/.claude/commands/module-ui.md` and `docs/purchase-procurement-plan.md`
// §7. Per-module brand colour is `#7C3AED`.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'pur_colors.dart';

// ── Numeric formatting ─────────────────────────────────────────────────────

/// Compact INR formatter — Crores / Lakhs / thousands. Use on tight KPI
/// strips where horizontal room is constrained.
String compactINR(num v) {
  final n = v.abs();
  if (n >= 10000000) return '₹${(v / 10000000).toStringAsFixed(2)} Cr';
  if (n >= 100000) return '₹${(v / 100000).toStringAsFixed(2)} L';
  if (n >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
  return '₹${v.toStringAsFixed(0)}';
}

/// INR with Indian comma grouping (₹1,25,000 / ₹1,25,000.75). Use on
/// detail surfaces and list tiles where exact amount matters more than
/// density. Pass [decimals] for line rates / unit prices that need paise.
String indianINR(num v, {int decimals = 0}) {
  final neg = v < 0;
  final abs = v.abs();
  var scale = 1;
  for (var i = 0; i < decimals; i++) {
    scale *= 10;
  }
  final scaled = (abs * scale).round();
  final wholeInt = scaled ~/ scale;
  final fracStr = decimals > 0
      ? '.${(scaled % scale).toString().padLeft(decimals, '0')}'
      : '';
  final whole = wholeInt.toString();
  if (whole.length <= 3) return '${neg ? '-' : ''}₹$whole$fracStr';
  final last3 = whole.substring(whole.length - 3);
  final rest = whole.substring(0, whole.length - 3);
  final reversed = rest.split('').reversed.join();
  final groups = <String>[];
  for (var i = 0; i < reversed.length; i += 2) {
    final end = (i + 2 > reversed.length) ? reversed.length : i + 2;
    groups.add(reversed.substring(i, end).split('').reversed.join());
  }
  return '${neg ? '-' : ''}₹${groups.reversed.join(',')},$last3$fracStr';
}

/// Format an ISO yyyy-mm-dd date as "24 May" (omits year when it matches
/// the current year, appends `'YY` otherwise). Falls back to the raw
/// string if parsing fails — list rows must never crash on bad data.
String prettyShortDate(String iso) {
  if (iso.length < 10) return iso;
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  final now = DateTime.now();
  final base = '${dt.day} ${months[dt.month - 1]}';
  return dt.year == now.year ? base : "$base '${dt.year % 100}";
}

// ── Status palette ─────────────────────────────────────────────────────────

class _StatusStyle {
  final Color bg, fg;
  final String label;
  const _StatusStyle(this.bg, this.fg, this.label);
}

/// PO status → display style. Status strings match the DB enum
/// (`purchase_order_status`): draft | sent | partially_received |
/// received | closed | cancelled.
_StatusStyle _poStatusStyle(String status) {
  switch (status) {
    case 'sent':
      return _StatusStyle(PurColors.infoBg, PurColors.info, 'Sent');
    case 'partially_received':
      return _StatusStyle(PurColors.orangeAlertBg, PurColors.orangeAlert, 'Partial');
    case 'received':
      return _StatusStyle(PurColors.successBg, PurColors.success, 'Received');
    case 'closed':
      return _StatusStyle(PurColors.violetSubtle, PurColors.violetDeep, 'Closed');
    case 'cancelled':
      return _StatusStyle(PurColors.errorBg, PurColors.error, 'Cancelled');
    case 'draft':
    default:
      return _StatusStyle(const Color(0x14000000), const Color(0xFF6B7280), 'Draft');
  }
}

/// Compact status badge for PO rows + headers.
class PurStatusPill extends StatelessWidget {
  final String status;
  final EdgeInsets padding;
  const PurStatusPill({
    super.key,
    required this.status,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
  });

  @override
  Widget build(BuildContext context) {
    final s = _poStatusStyle(status);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: s.bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        s.label,
        style: RunqText.micro.copyWith(
          color: s.fg,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// ── Layout ────────────────────────────────────────────────────────────────

/// Card wrapper for grouped fields / sections. 14px radius + hairline +
/// lifted shadow. Mirrors `InvCard`.
class PurCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const PurCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }
}

/// Section header with the muted UPPERCASE label + optional right-side
/// action ("See all →"). Padding matches inv prototype 16/8 inset.
class PurSectionHeader extends StatelessWidget {
  final String label;
  final Widget? trailing;
  const PurSectionHeader({super.key, required this.label, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          Expanded(child: Text(label.toUpperCase(), style: RunqText.label)),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Plain (non-gradient) procurement-style app bar — seamless by design:
/// transparent fill and no underline so the bar reads as part of the
/// scaffold bgWarm. Optional back arrow + trailing actions.
class PurPlainAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final bool showBack;
  final List<Widget> actions;
  final VoidCallback? onBack;
  const PurPlainAppBar({
    super.key,
    required this.title,
    this.showBack = true,
    this.actions = const [],
    this.onBack,
  });

  @override
  Size get preferredSize => const Size.fromHeight(52);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      bottom: false,
      child: Container(
        height: 52,
        color: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          children: [
            if (showBack)
              IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                onPressed: onBack ?? () => Navigator.maybePop(context),
              )
            else
              const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: RunqText.h2.copyWith(color: t.ink),
              ),
            ),
            ...actions,
          ],
        ),
      ),
    );
  }
}

// ── Pills & filters ──────────────────────────────────────────────────────

/// Fully-rounded pill used for status / category filters. Active state
/// fills with [activeColor] (defaults to brand violet) and flips text white.
class PurFilterPill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  final Color? activeColor;
  const PurFilterPill({
    super.key,
    required this.label,
    required this.active,
    required this.onTap,
    this.activeColor,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = activeColor ?? PurColors.brand(context);
    return Material(
      color: active ? brand : t.bgWarm,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: active ? brand : t.hairline),
          ),
          child: Text(
            label,
            style: RunqText.bodyStrong.copyWith(
              color: active ? Colors.white : t.muted,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Inputs ───────────────────────────────────────────────────────────────

/// Compact search bar with leading magnifier + trailing clear-×.
/// `keyboardDismissBehavior` is set by the host scrollable; this widget
/// just provides the input.
class PurSearchBar extends StatelessWidget {
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String>? onChanged;
  const PurSearchBar({
    super.key,
    required this.controller,
    this.placeholder = 'Search…',
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      onChanged: onChanged,
      textCapitalization: TextCapitalization.none,
      style: RunqText.body.copyWith(color: t.ink),
      decoration: InputDecoration(
        isDense: true,
        filled: true,
        fillColor: t.bgWarm,
        hintText: placeholder,
        hintStyle: RunqText.body.copyWith(color: t.muted2),
        prefixIcon: Icon(Icons.search_rounded, color: t.muted2, size: 20),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                icon: Icon(Icons.close_rounded, color: t.muted2, size: 18),
                onPressed: () {
                  controller.clear();
                  onChanged?.call('');
                },
              ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
      ),
    );
  }
}

// ── Document list tile (PO row, GRN row, …) ─────────────────────────────

/// One row of meta info shown beneath a doc tile's title. Icon + label
/// + optional value (e.g. `[shopping_cart] PO · PO-2026-0001`).
class PurDocMeta {
  final IconData icon;
  final String label;
  final String? value;
  const PurDocMeta({required this.icon, required this.label, this.value});
}

/// Single meta chip — small mono-icon + label. Used inside the meta row
/// of [PurDocListTile] to make date / vendor / reference scannable at a
/// glance without falling back to UPPERCASE column captions.
class PurMetaChip extends StatelessWidget {
  final PurDocMeta meta;
  const PurMetaChip({super.key, required this.meta});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final text = meta.value == null ? meta.label : '${meta.label} · ${meta.value}';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(meta.icon, size: 12, color: t.muted2),
        const SizedBox(width: 4),
        Text(text, style: RunqText.caption.copyWith(color: t.muted)),
      ],
    );
  }
}

/// Document-style list tile — leading branded icon, title + subtitle,
/// hairline separator, iconographic meta row, status pill at right, and
/// a right-anchored primary value (e.g. PO total). Shared chrome for
/// PO list, GRN list, and any other document list across the procurement
/// module.
class PurDocListTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final List<PurDocMeta> meta;
  final String? status;
  final String? rightValue;
  final VoidCallback? onTap;
  const PurDocListTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.meta = const [],
    this.status,
    this.rightValue,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: PurColors.violetSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: brand, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: RunqText.bodyStrong.copyWith(color: t.ink),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (status != null) ...[
                          const SizedBox(width: 6),
                          PurStatusPill(status: status!),
                        ],
                      ],
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: RunqText.caption.copyWith(color: t.muted),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 10,
                        runSpacing: 4,
                        children: meta.map((m) => PurMetaChip(meta: m)).toList(),
                      ),
                    ],
                  ],
                ),
              ),
              if (rightValue != null) ...[
                const SizedBox(width: 8),
                Text(
                  rightValue!,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Primary CTA ──────────────────────────────────────────────────────────

/// Gradient violet primary button — used on sheet forms (Save PO, Send
/// PO, etc.). Disabled state collapses to a muted gray.
class PurPrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  const PurPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || loading;
    return Opacity(
      opacity: disabled ? 0.55 : 1.0,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: disabled ? null : PurColors.heroGradient,
          color: disabled ? const Color(0xFF9CA3AF) : null,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: disabled ? null : onPressed,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (loading) ...[
                    const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    ),
                    const SizedBox(width: 10),
                  ] else if (icon != null) ...[
                    Icon(icon, size: 16, color: Colors.white),
                    const SizedBox(width: 8),
                  ],
                  Text(label, style: RunqText.bodyStrong.copyWith(color: Colors.white)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Empty state ──────────────────────────────────────────────────────────

class PurEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? description;
  final Widget? action;
  const PurEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.description,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Column(
        children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              color: PurColors.violetSubtle,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: PurColors.brand(context), size: 26),
          ),
          const SizedBox(height: 12),
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink), textAlign: TextAlign.center),
          if (description != null) ...[
            const SizedBox(height: 4),
            Text(description!, style: RunqText.caption.copyWith(color: t.muted), textAlign: TextAlign.center),
          ],
          if (action != null) ...[
            const SizedBox(height: 16),
            action!,
          ],
        ],
      ),
    );
  }
}
