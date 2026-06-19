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
    return Row(
      children: [
        Expanded(child: Text(title, style: DhenuText.h2.copyWith(color: t.ink))),
        ?trailing,
      ],
    );
  }
}
