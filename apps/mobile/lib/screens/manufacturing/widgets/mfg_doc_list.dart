// Grouped document-list building blocks for Manufacturing.
//
// A run of work orders reads better as one card with hairline separators than
// as a stack of floating cards: the eye follows a single column edge instead
// of re-entering a new box on every row. `MfgDividedCard` provides that
// container, with an optional footer link, and `MfgDateBlock` provides the
// bold leading date that replaces the row icon — on a shop floor the day a run
// belongs to is the first thing you look for, and a repeated factory glyph
// carried no information.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'mfg_colors.dart';

/// Card that stacks [children] behind a single border, separated by hairlines.
/// [footer] renders below a full-width divider — used for "See all" links.
class MfgDividedCard extends StatelessWidget {
  final List<Widget> children;
  final Widget? footer;

  const MfgDividedCard({super.key, required this.children, this.footer});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(height: 1, thickness: 1, color: t.hairline),
            children[i],
          ],
          if (footer != null) ...[
            Divider(height: 1, thickness: 1, color: t.hairline),
            footer!,
          ],
        ],
      ),
    );
  }
}

/// Tappable "See all →" footer for a [MfgDividedCard].
class MfgSeeAllFooter extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const MfgSeeAllFooter({super.key, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final brand = MfgColors.brand(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 13),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: RunqText.bodyStrong.copyWith(color: brand, fontWeight: FontWeight.w600),
            ),
            const SizedBox(width: 4),
            Icon(Icons.arrow_forward_rounded, size: 15, color: brand),
          ],
        ),
      ),
    );
  }
}

/// Leading block shell: a bold primary line over an accented secondary line,
/// sized to match the 36px icon square it replaces. [MfgDateBlock] and
/// [MfgShiftBlock] are the two things worth putting there.
class MfgLeadingBlock extends StatelessWidget {
  final List<Widget> lines;

  const MfgLeadingBlock({super.key, required this.lines});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      padding: const EdgeInsets.symmetric(vertical: 5),
      decoration: BoxDecoration(
        color: MfgColors.roseSubtle,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: MfgColors.roseHairline),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: lines),
    );
  }
}

/// Leading shift block — AM / PM / NIGHT. Used where every row shares a date
/// (today's runs), so the date would repeat down the card telling you nothing
/// while the shift is what actually separates one run from the next.
class MfgShiftBlock extends StatelessWidget {
  final String shift;

  const MfgShiftBlock({super.key, required this.shift});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return MfgLeadingBlock(
      lines: [
        Text(
          shift.toUpperCase(),
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: RunqText.caption.copyWith(
            color: t.ink,
            fontWeight: FontWeight.w800,
            height: 1.3,
          ),
        ),
        Text(
          'SHIFT',
          style: RunqText.micro.copyWith(
            color: MfgColors.brand(context),
            fontWeight: FontWeight.w700,
            height: 1.2,
          ),
        ),
      ],
    );
  }
}

/// Leading date block: day number over the abbreviated month, in the module
/// accent. Sized to match the 36px icon square it replaces.
class MfgDateBlock extends StatelessWidget {
  /// ISO `yyyy-MM-dd`. Rendered verbatim when unparseable.
  final String isoDate;

  const MfgDateBlock({super.key, required this.isoDate});

  static const _months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final dt = DateTime.tryParse(isoDate);

    if (dt == null) {
      return MfgLeadingBlock(
        lines: [
          Text(isoDate,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(color: brand)),
        ],
      );
    }
    return MfgLeadingBlock(
      lines: [
        Text(
          '${dt.day}',
          style: RunqText.bodyStrong
              .copyWith(color: t.ink, fontWeight: FontWeight.w800, height: 1.1),
        ),
        Text(
          _months[dt.month - 1],
          style: RunqText.micro
              .copyWith(color: brand, fontWeight: FontWeight.w700, height: 1.2),
        ),
        if (dt.year != DateTime.now().year)
          Text(
            "'${dt.year % 100}",
            style: RunqText.micro.copyWith(color: t.muted2, height: 1.2),
          ),
      ],
    );
  }
}
