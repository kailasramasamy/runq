import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

/// Inline pill button for hub-screen quick actions ("New invoice",
/// "Scan bill", "View reports"). Sized for a horizontally-scrollable row.
class HubQuickChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const HubQuickChip({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: t.surface,
            border: Border.all(color: t.hairline, width: 0.5),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: t.brand),
              const SizedBox(width: 6),
              Text(
                label,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class HubQuickChipRow extends StatelessWidget {
  final List<HubQuickChip> chips;
  const HubQuickChipRow({super.key, required this.chips});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: chips.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) => chips[i],
      ),
    );
  }
}
