// Shared Flutter widgets for the redesigned inventory mobile module.
//
// These are the dart equivalents of the primitives in
// `design_handoff_inventory/prototype/inv-components.jsx`. Each widget keeps
// the visual specification (sizes, radii, padding) from the handoff but
// re-skins it onto the existing `RunqTokens` + `InvColors` palette so the
// inventory module stays on-brand without dragging in Plus Jakarta Sans.
//
// Grouped here (not split across files) because every redesigned screen
// pulls from this kit — keeping one library import keeps the surface
// approachable for the rest of the redesign work.

library;

import 'dart:math' as math;
import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

// ── Numeric formatting ─────────────────────────────────────────────────────

/// Compact INR formatter — Crores / Lakhs / thousands.
///
/// Matches the prototype's `compactINR` so visual mockups translate 1:1.
String compactINR(num v) {
  final n = v.abs();
  if (n >= 10000000) return '₹${(v / 10000000).toStringAsFixed(2)} Cr';
  if (n >= 100000) return '₹${(v / 100000).toStringAsFixed(2)} L';
  if (n >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
  return '₹${v.toStringAsFixed(0)}';
}

/// INR with Indian comma grouping (₹1,25,000 / ₹1,25,000.75). Use on
/// detail surfaces and list tiles where exact amount matters more than
/// density; keep [compactINR] for KPI strips where horizontal room is
/// tight. Pass [decimals] for line rates / unit prices that need paise.
String indianINR(num v, {int decimals = 0}) {
  final neg = v < 0;
  final abs = v.abs();
  // Scale once, round once — avoids cascading floating-point error when we
  // split into whole + fractional parts.
  var scale = 1;
  for (var i = 0; i < decimals; i++) {
    scale *= 10;
  }
  final scaled = (abs * scale).round();
  final wholeInt = scaled ~/ scale;
  final fracStr = decimals > 0 ? '.${(scaled % scale).toString().padLeft(decimals, '0')}' : '';
  final whole = wholeInt.toString();
  if (whole.length <= 3) return '${neg ? '-' : ''}₹$whole$fracStr';
  final last3 = whole.substring(whole.length - 3);
  final rest = whole.substring(0, whole.length - 3);
  // Indian system: after the last 3 digits, group the rest in 2s from the
  // right. Reverse → chunk(2) → reverse back keeps the loop trivial.
  final reversed = rest.split('').reversed.join();
  final groups = <String>[];
  for (var i = 0; i < reversed.length; i += 2) {
    final end = (i + 2 > reversed.length) ? reversed.length : i + 2;
    groups.add(reversed.substring(i, end).split('').reversed.join());
  }
  return '${neg ? '-' : ''}₹${groups.reversed.join(',')},$last3$fracStr';
}

/// Format an ISO yyyy-mm-dd date as "24 May" (omits year when it matches
/// the current year, appends `'YY` otherwise). Falls back to the raw string
/// if parsing fails — list rows must never crash on bad data.
String prettyShortDate(String iso) {
  if (iso.length < 10) return iso;
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final now = DateTime.now();
  final base = '${dt.day} ${months[dt.month - 1]}';
  return dt.year == now.year ? base : "$base '${dt.year % 100}";
}

// ── Status palette ─────────────────────────────────────────────────────────

/// Tuple-ish record holding the bg/fg/label triple for a status.
class _StatusStyle {
  final Color bg;
  final Color fg;
  final String label;
  const _StatusStyle(this.bg, this.fg, this.label);
}

_StatusStyle _styleFor(String status) {
  switch (status) {
    case 'posted':
    case 'dispatched':
    case 'received':
      return _StatusStyle(InvColors.successBg, InvColors.success, _humanize(status));
    case 'cancelled':
      return _StatusStyle(InvColors.errorBg, InvColors.error, 'Cancelled');
    case 'in_transit':
      return _StatusStyle(InvColors.infoBg, InvColors.info, 'In Transit');
    case 'pending_approval':
      return _StatusStyle(InvColors.amberSubtle, InvColors.amberDeep, 'Pending');
    case 'in_progress':
      return _StatusStyle(InvColors.infoBg, InvColors.info, 'In Progress');
    case 'draft':
      return _StatusStyle(const Color(0xFFF3F4F6), const Color(0xFF6B7280), 'Draft');
    default:
      return _StatusStyle(const Color(0xFFF3F4F6), const Color(0xFF6B7280), _humanize(status));
  }
}

String _humanize(String s) => s.isEmpty
    ? s
    : s.split('_').map((p) => p.isEmpty ? p : '${p[0].toUpperCase()}${p.substring(1)}').join(' ');

/// Compact status badge — used on GRN, DN, transfer, adjustment, stock take.
class InvStatusPill extends StatelessWidget {
  const InvStatusPill({super.key, required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final s = _styleFor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(99)),
      child: Text(s.label, style: RunqText.micro.copyWith(color: s.fg, letterSpacing: 0.3)),
    );
  }
}

/// Critical / Warning / Watch pill — only used on the Reorder Alerts screen.
class InvUrgencyPill extends StatelessWidget {
  const InvUrgencyPill({super.key, required this.urgency});
  final String urgency;

  @override
  Widget build(BuildContext context) {
    late final Color bg;
    late final Color fg;
    late final String label;
    switch (urgency) {
      case 'out':
        // Out of stock is a harder state than "critical" (which still has
        // some cover left), so it gets the solid fill rather than a tint.
        bg = InvColors.error;
        fg = Colors.white;
        label = 'Out of stock';
        break;
      case 'critical':
        bg = InvColors.errorBg;
        fg = InvColors.error;
        label = 'Critical';
        break;
      case 'warning':
        bg = InvColors.orangeAlertBg;
        fg = InvColors.orangeAlert;
        label = 'Warning';
        break;
      default:
        bg = InvColors.amberSubtle;
        fg = InvColors.amberDeep;
        label = 'Watch';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: RunqText.micro.copyWith(color: fg, letterSpacing: 0.3)),
    );
  }
}

// ── Layout ────────────────────────────────────────────────────────────────

/// Card wrapper matching the prototype's `Card` — used to lift list tiles
/// and section blocks above the warm screen background. Always 14px radius,
/// always with a soft hairline + lifted shadow.
class InvCard extends StatelessWidget {
  const InvCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    this.onTap,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [BoxShadow(color: Color(0x0F000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(14), child: card),
    );
  }
}

/// Section header with the muted UPPERCASE label + optional right-side
/// action ("See all →"). Padding matches the prototype's 16/8 inset.
class InvSectionHeader extends StatelessWidget {
  const InvSectionHeader({
    super.key,
    required this.title,
    this.action,
    this.onAction,
    this.topPad = 16,
  });
  final String title;
  final String? action;
  final VoidCallback? onAction;
  final double topPad;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, topPad, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(title.toUpperCase(), style: RunqText.label.copyWith(color: t.muted)),
          ),
          if (action != null && onAction != null)
            GestureDetector(
              onTap: onAction,
              behavior: HitTestBehavior.opaque,
              child: Text(
                action!,
                style: RunqText.caption.copyWith(
                  color: InvColors.brand(context),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Gradient header (orange hero) ─────────────────────────────────────────

/// Inventory hero header — amber gradient running from darkest top-left
/// down to brand bottom-right. Children render in the same gradient block.
/// The container hosts the SafeArea so screens can slot it in as the AppBar
/// replacement without re-doing the inset math.
class InvGradientHeader extends StatelessWidget {
  const InvGradientHeader({
    super.key,
    required this.title,
    this.titleWidget,
    this.subtitle,
    this.trailing,
    this.leading,
    this.child,
    this.padding = const EdgeInsets.fromLTRB(16, 14, 16, 16),
  });

  /// Plain-text title. If [titleWidget] is provided it wins.
  final String title;
  final Widget? titleWidget;
  final String? subtitle;
  final Widget? trailing;
  final Widget? leading;

  /// Body content rendered below the title row, inside the gradient block.
  /// Use for hero KPIs, warehouse-pill rows, etc.
  final Widget? child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [InvColors.amberDarkest, InvColors.amberDeep, InvColors.amber],
          stops: [0, 0.5, 1],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: padding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (leading != null) ...[leading!, const SizedBox(width: 8)],
                  Expanded(
                    child:
                        titleWidget ??
                        Text(title, style: RunqText.h3.copyWith(color: Colors.white, height: 1.2)),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.72)),
                ),
              ],
              if (child != null) ...[const SizedBox(height: 12), child!],
            ],
          ),
        ),
      ),
    );
  }
}

/// Plain (non-gradient) inventory-style app bar — seamless by design:
/// transparent fill and no underline so the bar reads as part of the
/// scaffold bgWarm. Optional back arrow + trailing action.
class InvPlainAppBar extends StatelessWidget implements PreferredSizeWidget {
  const InvPlainAppBar({super.key, required this.title, this.onBack, this.trailing});
  final String title;
  final VoidCallback? onBack;
  final Widget? trailing;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: SizedBox(
          height: 56,
          child: Row(
            children: [
              if (onBack != null)
                IconButton(
                  icon: const Icon(Icons.arrow_back, size: 22),
                  color: InvColors.brand(context),
                  onPressed: onBack,
                  splashRadius: 22,
                ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(title, style: RunqText.h3.copyWith(color: t.ink)),
              ),
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }
}

// ── KPI tiles ──────────────────────────────────────────────────────────────

/// Standard 3-col KPI strip card. Slim padding, big number, mute subtitle.
/// When [accent] is true the value renders in brand colour with a brand-
/// tinted border (used for "Low stock" cells).
class InvKpiCard extends StatelessWidget {
  const InvKpiCard({
    super.key,
    required this.label,
    required this.value,
    this.sub,
    this.accent = false,
    this.onTap,
    this.tint,
    this.borderTint,
  });
  final String label;
  final String value;
  final String? sub;
  final bool accent;
  final VoidCallback? onTap;

  /// Optional fill colour. Pass a low-alpha brand/status colour for a
  /// soft tinted background; defaults to the plain surface.
  final Color? tint;

  /// Optional border colour. Overrides the default hairline / accent border
  /// so callers can use a tinted background + matching outline without
  /// flipping `accent` (which would recolour the value text).
  final Color? borderTint;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final border =
        borderTint ?? (accent ? InvColors.brand(context).withValues(alpha: 0.33) : t.hairline);
    final valueColor = accent ? InvColors.brand(context) : t.ink;
    final card = Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: tint ?? t.surface,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 4),
          Text(
            value,
            style: RunqText.numberLg.copyWith(color: valueColor, fontSize: 20, height: 1.15),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(sub!, style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ],
      ),
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(14), child: card),
    );
  }
}

/// Hero KPI rendered inside the gradient header — translucent dark fill +
/// white type. Supports an optional trend tag ("↑ 3.2% vs last week").
/// Tone for an [InvHeroKpi] footnote. `neutral` is the default and the right
/// choice for figures where a direction is not automatically good or bad —
/// stock value climbing means either a strong order book or dead capital, and
/// painting it green picks a side the data does not support.
enum InvKpiTone { good, bad, neutral }

class InvHeroKpi extends StatelessWidget {
  const InvHeroKpi({
    super.key,
    required this.label,
    required this.value,
    this.footnote,
    this.tone = InvKpiTone.neutral,
  });
  final String label;
  final String value;

  /// Small line under the figure. Include any arrow glyph in the string —
  /// direction and tone are separate judgements and only the caller knows both.
  final String? footnote;
  final InvKpiTone tone;

  @override
  Widget build(BuildContext context) {
    final footColor = switch (tone) {
      InvKpiTone.good => const Color(0xFF86EFAC),
      InvKpiTone.bad => const Color(0xFFFCA5A5),
      InvKpiTone.neutral => Colors.white.withValues(alpha: 0.66),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.72)),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: RunqText.h1.copyWith(color: Colors.white, fontSize: 26, height: 1.15),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (footnote != null) ...[
            const SizedBox(height: 4),
            Text(
              footnote!,
              style: RunqText.micro.copyWith(
                color: footColor,
                fontWeight:
                    tone == InvKpiTone.neutral ? FontWeight.w500 : FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

class InvMiniStat extends StatelessWidget {
  const InvMiniStat({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.value,
    required this.label,
    this.onTap,
  });
  final IconData icon;
  final Color iconColor;
  final String value;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final body = Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 16, color: iconColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(value, style: RunqText.h4.copyWith(color: t.ink, height: 1.15)),
                Text(label, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return body;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(14), child: body),
    );
  }
}

/// Quick-action tile (Receive / Dispatch / Transfer / …) — used on the Home
/// screen 2x3 grid and the Moves hub 2x3 grid. Optional badge in the top-
/// right (used for unread counts like "8 low stock").
class InvActionTile extends StatelessWidget {
  const InvActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Amber wash deepening toward the bottom-right, blended onto the surface
    // (not overlaid at alpha) so the fill stays opaque and text keeps contrast.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final washStrength = isDark ? 0.16 : 0.09;
    final wash = Color.alphaBlend(InvColors.amber.withValues(alpha: washStrength), t.surface);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: InvColors.amber.withValues(alpha: 0.14)),
          // Lifted off the page: the wash alone left these reading as
          // flat panels rather than the tap targets they are.
          boxShadow: RunqShadows.actionTile(isDark),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [t.surface, wash],
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          // Rounded clip, not the Stack's rectangular one — otherwise the
          // corner bloom paints over the rounded corner and squares it off.
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              children: [
                // Decorative bloom in the top-right — gives the flat wash a
                // light source without competing with the content.
                Positioned(
                  right: -26,
                  top: -30,
                  child: Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: InvColors.amber.withValues(alpha: 0.07),
                    ),
                  ),
                ),
                Padding(
                  // Inline layout — icon on the left, title + subtitle stacked
                  // beside it. Shorter than the old stacked card so the grid
                  // takes less vertical real-estate on Home.
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          // Outlined on the surface colour — a solid tint would
                          // muddy against the washed card.
                          color: t.surface,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: InvColors.amber.withValues(alpha: 0.18)),
                        ),
                        child: Icon(icon, size: 20, color: InvColors.brand(context)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              title,
                              style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                              maxLines: 1,
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
                      if (badge != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: InvColors.error,
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            badge!,
                            style: RunqText.micro.copyWith(color: Colors.white, letterSpacing: 0.2),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Stock level bar ────────────────────────────────────────────────────────

/// Thin progress bar showing the on-hand qty relative to (3 × reorder level),
/// with a tick marking the reorder point itself. The headroom in the scale is
/// deliberate — an item sitting at 3× its threshold has to look different from
/// one sitting exactly on it — and the tick is what makes a near-miss legible:
/// "short by 2" shows as a fill stopping just before the mark rather than as
/// an unanchored third of a bar.
///
/// Renders red-orange when [isLow] is true, green otherwise. Multi-purpose:
/// the same widget is used on stock tiles, item-detail cards, and reorder
/// alerts (with a thicker [height]).
class InvStockBar extends StatelessWidget {
  const InvStockBar({
    super.key,
    required this.qty,
    required this.reorderLevel,
    required this.isLow,
    required this.markerLabel,
    this.height = 5,
  });
  final double qty;
  final double? reorderLevel;
  final bool isLow;
  final double height;

  /// The threshold figure itself, printed inside the badge that marks its
  /// place on the track. Null when the item has no reorder level — there is
  /// nothing to mark. Required rather than optional so a caller can't
  /// accidentally ship a bar whose mark is a number-less blip.
  final String? markerLabel;

  /// Badge geometry. The badge is a circle for a one- or two-digit threshold
  /// and stretches to a pill beyond that, so "12" and "1,200" both sit on the
  /// line without one of them looking like a different control.
  static const double _badgeH = 16;
  static const double _badgePadX = 5;
  // Advance width of RunqText.micro, near enough to place the badge before it
  // is laid out. Only used for the edge clamp, so a pixel of drift is free.
  static const double _digitW = 6;

  double _badgeWidth(String label) =>
      math.max(_badgeH, label.length * _digitW + _badgePadX * 2);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Without a reorder level there is no scale to plot against — measuring
    // qty against itself would paint every item 100% full, which reads as
    // "well stocked" for a shelf that's actually empty. Show the bare track.
    final cap = (reorderLevel ?? 0) > 0 ? reorderLevel! * 3 : 0.0;
    final pct = cap <= 0 || qty <= 0 ? 0.0 : (qty / cap).clamp(0.0, 1.0);
    final fill = isLow ? InvColors.orangeAlert : InvColors.success;
    // cap is always 3× the level, so the reorder point sits at a third of the
    // track. Constant by construction — read it off `cap` anyway so the two
    // can't drift if the multiplier is ever retuned.
    final markerPct = cap <= 0 ? null : (reorderLevel! / cap);
    final label = markerPct == null ? null : markerLabel;
    // The badge sits ON the line, carrying the number it marks: one object to
    // read instead of a tick plus a caption hunting for its own notch. It is
    // taller than the bar, so the row is sized to the badge and the track is
    // centred behind it.
    final rowH = math.max(height, _badgeH);
    return LayoutBuilder(
      builder: (_, c) => SizedBox(
        height: rowH,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              height: height,
              decoration: BoxDecoration(
                color: t.hairlineSoft,
                borderRadius: BorderRadius.circular(99),
              ),
              clipBehavior: Clip.antiAlias,
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  width: c.maxWidth * pct,
                  decoration: BoxDecoration(
                    color: fill,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
            ),
            if (label != null)
              Positioned(
                // Keep the whole badge on the track — a level at either edge
                // would otherwise hang half of itself off the end.
                left: (c.maxWidth * markerPct! - _badgeWidth(label) / 2)
                    .clamp(0.0, math.max(0.0, c.maxWidth - _badgeWidth(label))),
                top: 0,
                bottom: 0,
                child: Container(
                  alignment: Alignment.center,
                  constraints: const BoxConstraints(minWidth: _badgeH),
                  padding: const EdgeInsets.symmetric(horizontal: _badgePadX),
                  decoration: BoxDecoration(
                    // Card-coloured body with an ink ring: the badge has to
                    // read against the fill it sits under on a healthy item
                    // and against the bare track on a low one.
                    color: t.surface,
                    border: Border.all(color: t.ink.withValues(alpha: 0.55)),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.micro.copyWith(color: t.ink, height: 1.0),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Quantity + unit ────────────────────────────────────────────────────────

/// A quantity with its unit of measure held one step back — the number keeps
/// the caller's [style], the UoM drops to caption size in the muted ink. The
/// figure is what the eye is hunting for; "200ml" is a constant of the item
/// and shouldn't compete with it at every row.
class InvQtyText extends StatelessWidget {
  const InvQtyText({
    super.key,
    required this.qty,
    required this.unit,
    required this.style,
  });

  /// Pre-formatted number, including any sign or prefix.
  final String qty;
  final String? unit;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final u = unit?.trim();
    if (u == null || u.isEmpty) return Text(qty, style: style);
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: qty, style: style),
          TextSpan(
            text: ' $u',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }
}

// ── Filter chip ────────────────────────────────────────────────────────────

/// Fully-rounded pill used for warehouse + status filters. Active state
/// fills with [activeColor] (defaults to brand amber) and flips text white.
class InvFilterPill extends StatelessWidget {
  const InvFilterPill({
    super.key,
    required this.label,
    required this.active,
    required this.onTap,
    this.activeColor,
    this.icon,
    this.count,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;
  final Color? activeColor;
  final IconData? icon;

  /// Optional tally rendered after the label. Null hides the badge — a
  /// pill whose count hasn't loaded must not read as a pill with none.
  final int? count;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ac = activeColor ?? InvColors.brand(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: icon == null ? 12 : 10, vertical: 6),
          decoration: BoxDecoration(
            color: active ? ac : t.surface,
            border: Border.all(color: active ? Colors.transparent : t.hairline),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 13, color: active ? Colors.white : t.ink),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: RunqText.caption.copyWith(
                  color: active ? Colors.white : t.ink,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
              if (count != null) ...[
                const SizedBox(width: 5),
                Text(
                  '$count',
                  style: RunqText.caption.copyWith(
                    color: active ? Colors.white.withValues(alpha: 0.85) : t.muted,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Search field ───────────────────────────────────────────────────────────

/// Compact search bar with a leading magnifier + trailing clear-×.
class InvSearchBar extends StatelessWidget {
  const InvSearchBar({
    super.key,
    required this.controller,
    required this.onChanged,
    this.hint = 'Search…',
  });
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      onChanged: onChanged,
      style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
      cursorColor: InvColors.brand(context),
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
        prefixIcon: Icon(Icons.search, size: 18, color: t.muted2),
        prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        suffixIcon: ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (_, v, __) => v.text.isEmpty
              ? const SizedBox.shrink()
              : IconButton(
                  icon: Icon(Icons.close, size: 16, color: t.muted2),
                  splashRadius: 16,
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
        ),
        filled: true,
        fillColor: t.surface,
        contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 0),
        isDense: true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: InvColors.brand(context), width: 1.2),
        ),
      ),
    );
  }
}

// ── Activity row ───────────────────────────────────────────────────────────

/// Movement type → icon + colour mapping. Re-used by the Home screen
/// "Recent Activity" card, the Moves hub, and item-detail timelines.
class InvActivityIcon {
  static IconData iconFor(String type) {
    switch (type) {
      case 'grn':
        return Icons.inventory_2_outlined;
      case 'dn':
        return Icons.local_shipping_outlined;
      case 'transfer':
        return Icons.alt_route_outlined;
      case 'adjustment':
        return Icons.tune_rounded;
      case 'stock_take':
        return Icons.checklist_outlined;
      default:
        return Icons.swap_horiz_rounded;
    }
  }

  static Color colorFor(String type) {
    switch (type) {
      case 'grn':
        return InvColors.success;
      case 'dn':
        return InvColors.orangeAlert;
      case 'transfer':
        return InvColors.info;
      case 'adjustment':
        return InvColors.error;
      default:
        return const Color(0xFF7B7468);
    }
  }
}

/// Single row in a "Recent activity" / "Recent movements" card.
///
/// Signed [amount] strings (`+₹1.2L`, `-₹48.7K`) auto-colour green / red.
class InvActivityRow extends StatelessWidget {
  const InvActivityRow({
    super.key,
    required this.type,
    required this.refLabel,
    required this.description,
    required this.amount,
    required this.time,
    this.onTap,
  });
  final String type;
  final String refLabel;
  final String description;
  final String amount;
  final String time;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final icColor = InvActivityIcon.colorFor(type);
    Color amountColor = t.muted;
    if (amount.startsWith('+')) amountColor = InvColors.success;
    if (amount.startsWith('-')) amountColor = InvColors.error;
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: icColor.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(InvActivityIcon.iconFor(type), size: 17, color: icColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  refLabel,
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 1),
                Text(
                  description,
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                amount,
                style: RunqText.caption.copyWith(
                  color: amountColor,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 2),
              Text(time, style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0)),
            ],
          ),
        ],
      ),
    );
    if (onTap == null) return row;
    return InkWell(onTap: onTap, child: row);
  }
}

// ── Document list tile (GRN, DN, transfers, …) ────────────────────────────

/// Single meta chip — small mono-icon + label. Used inside the meta row of
/// [InvDocListTile] to make date / warehouse / reference scannable at a
/// glance without falling back to UPPERCASE column captions.
class InvMetaChip extends StatelessWidget {
  const InvMetaChip({super.key, required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: t.muted2),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// One line of meta — icon, label, optional value. Used as a sub-block of
/// [InvDocListTile] so each row stays scannable.
class InvDocMeta {
  const InvDocMeta(this.icon, this.label);
  final IconData icon;
  final String label;
}

/// Document-style list tile — leading branded icon, title + subtitle,
/// hairline separator, iconographic meta row, and a right-anchored
/// primary value (e.g. total amount). Shared chrome for GRN, DN, transfer
/// and any other document list across the inventory module.
class InvDocListTile extends StatelessWidget {
  const InvDocListTile({
    super.key,
    required this.leadingIcon,
    required this.title,
    required this.statusPill,
    required this.meta,
    required this.valueLabel,
    required this.valueText,
    this.subtitle,
    this.leadingColor,
    this.onTap,
  });
  final IconData leadingIcon;
  final String title;
  final String? subtitle;
  final Widget statusPill;
  final List<InvDocMeta> meta;

  /// Small uppercase caption shown above the right-anchored value
  /// (e.g. `12 LINES`). Kept short — single-line ellipsis.
  final String valueLabel;

  /// Right-anchored amount (compactINR result, or any short string).
  final String valueText;

  /// Tint colour for the leading icon container. Defaults to the inventory
  /// brand amber so the entire module reads as one family.
  final Color? leadingColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tint = leadingColor ?? InvColors.brand(context);
    return InvCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(leadingIcon, size: 18, color: tint),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: RunqText.caption.copyWith(color: t.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              statusPill,
            ],
          ),
          const SizedBox(height: 10),
          Container(height: 1, color: t.hairlineSoft),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [for (final m in meta) InvMetaChip(icon: m.icon, label: m.label)],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    valueLabel.toUpperCase(),
                    style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.4),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    valueText,
                    style: RunqText.bodyStrong.copyWith(
                      color: InvColors.brand(context),
                      fontSize: 15,
                      height: 1.1,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Primary CTA button ─────────────────────────────────────────────────────

/// Gradient amber primary button — used on sheet forms (Receive + Post,
/// Dispatch + Post, etc.). Disabled state collapses to a muted gray.
class InvPrimaryButton extends StatelessWidget {
  const InvPrimaryButton({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.busy = false,
  });
  final String label;
  final VoidCallback? onTap;
  final IconData? icon;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null || busy;
    return GestureDetector(
      onTap: disabled ? null : onTap,
      child: Container(
        width: double.infinity,
        height: 48,
        decoration: BoxDecoration(
          gradient: disabled
              ? null
              : const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [InvColors.amberDeep, InvColors.amber],
                ),
          color: disabled ? const Color(0xFFA8A29E) : null,
          borderRadius: BorderRadius.circular(12),
          boxShadow: disabled
              ? null
              : [
                  BoxShadow(
                    color: InvColors.amber.withValues(alpha: 0.33),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
        ),
        alignment: Alignment.center,
        child: busy
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18, color: Colors.white),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    label,
                    style: RunqText.bodyStrong.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

// ── Empty state ────────────────────────────────────────────────────────────

class InvEmptyState extends StatelessWidget {
  const InvEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // width: infinity is load-bearing. Several callers hand this straight to a
    // RefreshIndicator, which wraps its child in a Stack — and a Stack passes
    // loose constraints to non-positioned children, so the Column would
    // shrink-wrap to its widest line and sit against the leading edge. The
    // per-Text centring then centres inside that narrow box, which reads as
    // the whole block being nudged left.
    return SizedBox(
      width: double.infinity,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 60),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: t.bgWarmer, borderRadius: BorderRadius.circular(16)),
              child: Icon(icon, size: 26, color: t.muted2),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: RunqText.bodyStrong.copyWith(color: t.ink),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: RunqText.caption.copyWith(color: t.muted),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 10),
              GestureDetector(
                onTap: onAction,
                child: Text(
                  actionLabel!,
                  style: RunqText.bodyStrong.copyWith(
                    color: InvColors.brand(context),
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
