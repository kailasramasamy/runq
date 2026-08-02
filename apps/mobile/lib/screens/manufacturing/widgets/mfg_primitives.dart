// Shared Flutter widgets for the Manufacturing mobile module.
//
// Mirrors `pur_primitives.dart` in structure but skinned with `MfgColors`
// (rose). Scoped to Phase 1 essentials (BOM list / detail / create /
// edit + WO list / detail / create / edit); home dashboard primitives
// (KPI strip, action grid, gradient hero) land in manufacturing_home_screen.dart.
//
// Generated from the `/module-ui` skill template. Per-module brand colour
// is `#E11D48`.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'mfg_colors.dart';
import 'mfg_doc_list.dart';

// ── Numeric formatting ─────────────────────────────────────────────────────

/// Compact INR formatter — Crores / Lakhs / thousands.
String mfgCompactINR(num v) {
  final n = v.abs();
  if (n >= 10000000) return '₹${(v / 10000000).toStringAsFixed(2)} Cr';
  if (n >= 100000) return '₹${(v / 100000).toStringAsFixed(2)} L';
  if (n >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
  return '₹${v.toStringAsFixed(0)}';
}

/// INR with Indian comma grouping (₹1,25,000 / ₹1,25,000.75).
String mfgIndianINR(num v, {int decimals = 0}) {
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

/// Format an ISO yyyy-mm-dd date as "24 May". Falls back to raw string.
String mfgPrettyDate(String iso) {
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

/// WO status → display style. Status strings match the DB enum
/// (`wo_status`): draft | in_progress | completed | closed | cancelled.
_StatusStyle _woStatusStyle(BuildContext context, String status) {
  switch (status) {
    case 'in_progress':
      return _StatusStyle(MfgColors.infoBg, MfgColors.info, 'In Progress');
    case 'completed':
      return _StatusStyle(MfgColors.successBg, MfgColors.success, 'Completed');
    case 'closed':
      return _StatusStyle(MfgColors.roseSubtle, MfgColors.roseDeep, 'Closed');
    case 'cancelled':
      return _StatusStyle(MfgColors.errorBg, MfgColors.error, 'Cancelled');
    case 'draft':
    default:
      // Theme tokens, not fixed greys: 8% black on grey-500 disappears entirely
      // on a dark background, which made Draft the one status you couldn't read.
      final t = RT(context);
      return _StatusStyle(t.hairline, t.ink2, 'Draft');
  }
}

/// BOM active/inactive status style.
_StatusStyle _bomStatusStyle(BuildContext context, bool isActive) => isActive
    ? _StatusStyle(MfgColors.successBg, MfgColors.success, 'Active')
    : _StatusStyle(RT(context).hairline, RT(context).ink2, 'Inactive');

/// Compact WO status badge.
class MfgStatusPill extends StatelessWidget {
  final String status;
  final EdgeInsets padding;
  const MfgStatusPill({
    super.key,
    required this.status,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
  });

  @override
  Widget build(BuildContext context) {
    final s = _woStatusStyle(context, status);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: s.bg,
        border: Border.all(color: s.fg.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        s.label,
        style: RunqText.micro.copyWith(
          color: s.fg,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// BOM active/inactive badge.
class MfgBomStatusPill extends StatelessWidget {
  final bool isActive;
  final EdgeInsets padding;
  const MfgBomStatusPill({
    super.key,
    required this.isActive,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
  });

  @override
  Widget build(BuildContext context) {
    final s = _bomStatusStyle(context, isActive);
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
/// lifted shadow. Mirrors `PurCard`.
class MfgCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const MfgCard({
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

/// Section header with the muted UPPERCASE label + optional right-side action.
class MfgSectionHeader extends StatelessWidget {
  final String label;
  final Widget? trailing;
  const MfgSectionHeader({super.key, required this.label, this.trailing});

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

/// Plain (non-gradient) manufacturing-style app bar — transparent fill.
class MfgPlainAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final bool showBack;
  final List<Widget> actions;
  final VoidCallback? onBack;
  const MfgPlainAppBar({
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
/// fills with [activeColor] (defaults to brand rose) and flips text white.
class MfgFilterPill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  final Color? activeColor;
  const MfgFilterPill({
    super.key,
    required this.label,
    required this.active,
    required this.onTap,
    this.activeColor,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = activeColor ?? MfgColors.brand(context);
    return Material(
      color: active ? brand : t.surface,
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
class MfgSearchBar extends StatelessWidget {
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String>? onChanged;
  const MfgSearchBar({
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
        fillColor: t.surface,
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

// ── Document list tile (BOM row, WO row) ─────────────────────────────────

/// One row of meta info shown beneath a doc tile's title.
class MfgDocMeta {
  final IconData icon;
  final String label;
  final String? value;
  const MfgDocMeta({required this.icon, required this.label, this.value});
}

/// Single meta chip — small mono-icon + label.
class MfgMetaChip extends StatelessWidget {
  final MfgDocMeta meta;
  const MfgMetaChip({super.key, required this.meta});

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

/// Document-style list tile — shared chrome for BOM list and WO list.
class MfgDocListTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final List<MfgDocMeta> meta;
  final String? status;
  final bool? bomIsActive;
  final String? rightValue;
  final String? productLabel;

  /// Promotes a domain headline above the document number. Work orders use this
  /// for the product being made: on a shop-floor list "Farm Fresh Cow Milk ·
  /// 600 500ml" is what identifies a row, while WO-20260730-0001 is a reference
  /// you only need once you're in it. Null keeps the original layout, so the BOM
  /// list is unaffected.
  final String? headline;

  /// Quantity shown under [headline], emphasised in the module accent.
  final String? headlineValue;

  /// Single muted line under the quantity — document number plus whatever else
  /// identifies the row (date, shift). Replaces both the subtitle and the meta
  /// chip row when set, so a work order reads as three lines rather than five.
  final String? reference;

  /// Scheduling facts on their own line under [reference] — kept separate so a
  /// long document number can't push the date off the end.
  final String? metaLine;

  /// Unit rendered under [rightValue]. Together they form the row's magnitude
  /// block: quantity large on the right, unit small beneath it, so the number
  /// stops competing with the product name for the same line.
  final String? rightUnit;

  /// ISO date rendered as a bold leading block *instead of* [icon]. A repeated
  /// module glyph told the reader nothing; the run's date is what they scan
  /// for. Null keeps the icon.
  final String? leadingDate;

  /// Shift rendered in the leading block instead of [leadingDate]. Wins when
  /// both are set: on a list already scoped to one day the date repeats down
  /// every row, and the shift is the thing that actually varies.
  final String? leadingShift;

  /// Drops the tile's own border and background so it can sit as a row inside
  /// a [MfgDividedCard] without a box-in-a-box.
  final bool flat;
  final VoidCallback? onTap;
  const MfgDocListTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.meta = const [],
    this.status,
    this.bomIsActive,
    this.rightValue,
    this.productLabel,
    this.headline,
    this.headlineValue,
    this.reference,
    this.metaLine,
    this.rightUnit,
    this.leadingDate,
    this.leadingShift,
    this.flat = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    return Material(
      color: flat ? Colors.transparent : t.surface,
      borderRadius: BorderRadius.circular(flat ? 0 : 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(flat ? 0 : 12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          decoration: flat
              ? null
              : BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: t.hairline),
                ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (leadingShift != null && leadingShift!.isNotEmpty)
                MfgShiftBlock(shift: leadingShift!)
              else if (leadingDate != null)
                MfgDateBlock(isoDate: leadingDate!)
              else
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: MfgColors.roseSubtle,
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
                            headline ?? title,
                            style: RunqText.bodyStrong.copyWith(
                                color: t.ink,
                                fontWeight:
                                    headline != null ? FontWeight.w700 : null),
                            maxLines: headline != null ? 2 : 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (rightValue == null && status != null) ...[
                          const SizedBox(width: 6),
                          MfgStatusPill(status: status!),
                        ] else if (bomIsActive != null) ...[
                          const SizedBox(width: 6),
                          MfgBomStatusPill(isActive: bomIsActive!),
                        ],
                      ],
                    ),
                    if (headlineValue != null) ...[
                      const SizedBox(height: 3),
                      Text(
                        headlineValue!,
                        style: RunqText.bodyStrong.copyWith(
                            color: brand, fontWeight: FontWeight.w700),
                      ),
                    ],
                    // Document number drops to a muted reference line once a
                    // headline is carrying the row's identity.
                    if (reference != null) ...[
                      const SizedBox(height: 4),
                      Row(children: [
                        if (rightValue != null && status != null) ...[
                          MfgStatusPill(status: status!),
                          const SizedBox(width: 6),
                        ],
                        Expanded(
                          child: Text(
                            reference!,
                            style: RunqText.caption.copyWith(color: t.muted2),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ]),
                      if (metaLine != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          metaLine!,
                          style: RunqText.caption.copyWith(color: t.muted2),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ] else if (headline != null) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle == null || subtitle == headline
                            ? title
                            : '$title · $subtitle',
                        style: RunqText.caption.copyWith(color: t.muted2),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ] else if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: RunqText.caption.copyWith(color: t.muted),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    if (productLabel != null || meta.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 10,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (productLabel != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: MfgColors.roseTint,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: MfgColors.roseHairline),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.factory_outlined, size: 13, color: brand),
                                  const SizedBox(width: 5),
                                  Text(
                                    productLabel!,
                                    style: RunqText.caption.copyWith(
                                      color: brand,
                                      fontWeight: FontWeight.w600,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ...meta.map((m) => MfgMetaChip(meta: m)),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (rightValue != null) ...[
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      rightValue!,
                      style: rightUnit == null
                          ? RunqText.bodyStrong.copyWith(color: t.ink)
                          : RunqText.h2.copyWith(
                              color: t.ink, fontWeight: FontWeight.w800, height: 1),
                    ),
                    if (rightUnit != null) ...[
                      const SizedBox(height: 2),
                      Text(rightUnit!,
                          style: RunqText.micro.copyWith(color: t.muted)),
                    ],
                  ],
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

/// Gradient rose primary button. Disabled state collapses to muted gray.
class MfgPrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  const MfgPrimaryButton({
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
          gradient: disabled ? null : MfgColors.heroGradient,
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

class MfgEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? description;
  final Widget? action;
  const MfgEmptyState({
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
              color: MfgColors.roseSubtle,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: MfgColors.brand(context), size: 26),
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

// ── Quick Action Tile (pixel-match of Purchase's _ActionTile) ─────────────

/// Quick action tile for the manufacturing home screen's 2×3 grid.
/// Structure is pixel-for-pixel identical to `_ActionTile` in
/// `purchase_home_screen.dart` — only the rose palette is different.
class MfgQuickActionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String? badge;
  final VoidCallback onTap;
  const MfgQuickActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: MfgColors.roseSubtle,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, color: MfgColors.brand(context), size: 20),
                  ),
                  if (badge != null)
                    Positioned(
                      right: -4, top: -4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: MfgColors.brand(context),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: t.surface, width: 1.5),
                        ),
                        constraints: const BoxConstraints(minWidth: 18),
                        child: Text(
                          badge!,
                          textAlign: TextAlign.center,
                          style: RunqText.micro.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700, height: 1,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
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
