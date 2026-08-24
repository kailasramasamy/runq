import 'package:flutter/material.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_card.dart';

/// A small labelled metric tile used in the report screens' 2-up stat grids.
class DhenuStatCard extends StatelessWidget {
  const DhenuStatCard({
    super.key,
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return DhenuCard(
      elevated: true,
      padding: const EdgeInsets.all(DhenuSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label,
              style: DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.8)),
          const SizedBox(height: DhenuSpacing.xs),
          Text(value,
              style: DhenuText.number(size: 23, color: valueColor),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
