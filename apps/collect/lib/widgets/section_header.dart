import 'package:flutter/material.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// A consistent section title (h2 ink) with an optional trailing widget — e.g.
/// a "See all" action or a count chip. Standardises the section heads that were
/// written ad-hoc as `Text(..., style: DhenuText.h2.copyWith(color: t.ink))`.
class DhenuSectionHeader extends StatelessWidget {
  const DhenuSectionHeader(this.title, {super.key, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    // The title takes all the room up to the trailing widget, and only
    // ellipsises when the text genuinely runs out of space. A bare Flexible
    // next to a Spacer split the free width between them, so the title
    // truncated at half the row while the other half sat empty.
    return Row(
      children: [
        Expanded(
          child: Text(title,
              style: DhenuText.h2.copyWith(color: t.ink),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        ?trailing,
      ],
    );
  }
}
