import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';

/// The handle pill at the top of a bottom sheet. One definition instead of the
/// five identical copies that lived in the sheet screens.
class SheetGrabber extends StatelessWidget {
  const SheetGrabber({super.key});

  @override
  // Centered internally: dropped straight into a ListView the child gets tight
  // full-width constraints and the 44px handle stretches edge to edge.
  Widget build(BuildContext context) => Center(
        child: Container(
          margin:
              const EdgeInsets.only(top: DhenuSpacing.sm, bottom: DhenuSpacing.lg),
          width: 44,
          height: 5,
          decoration: BoxDecoration(
            color: DT(context).inkSoft.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(DhenuRadii.pill),
          ),
        ),
      );
}
