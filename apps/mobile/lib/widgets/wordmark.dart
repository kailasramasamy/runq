import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/runq_tokens.dart';

class RunqWordmark extends StatelessWidget {
  final double size;
  final Color? inkColor;
  const RunqWordmark({super.key, this.size = 22, this.inkColor});

  @override
  Widget build(BuildContext context) {
    final ink = inkColor ?? RT(context).ink;
    final base = GoogleFonts.leagueSpartan(
      fontSize: size,
      fontWeight: FontWeight.w800,
      height: 1.0,
      letterSpacing: -0.01 * size,
    );
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: 'run', style: base.copyWith(color: ink)),
        TextSpan(text: 'Q', style: base.copyWith(color: RunqColors.indigo)),
      ]),
    );
  }
}
