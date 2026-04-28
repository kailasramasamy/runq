import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

class _PillSpec {
  /// The "ink" color of the status (e.g. greenInk). The bg in light mode is
  /// the pastel pair; in dark mode we tint the ink color at low alpha.
  final Color ink;
  final String label;
  const _PillSpec(this.ink, this.label);
}

/// In dark mode we want the lighter side of each color so the text is
/// readable over the tinted dark bg.
const _darkInk = <String, Color>{
  'paid': Color(0xFF6EE7B7),
  'sent': Color(0xFF93C5FD),
  'approved': Color(0xFF93C5FD),
  'matched': Color(0xFF93C5FD),
  'overdue': Color(0xFFFCA5A5),
  'urgent': Color(0xFFFCA5A5),
  'pending_match': Color(0xFFFCD34D),
  'pending_approval': Color(0xFFFCD34D),
  'pending': Color(0xFFFCD34D),
  'on_track': Color(0xFF6EE7B7),
  'save': Color(0xFFC4B5FD),
  'partially_paid': Color(0xFFC4B5FD),
  'draft': Color(0xFFD1D5DB),
};

const _lightSpec = <String, _PillSpec>{
  'paid': _PillSpec(RunqColors.greenInk, 'PAID'),
  'sent': _PillSpec(RunqColors.blueInk, 'SENT'),
  'overdue': _PillSpec(RunqColors.redInk, 'OVERDUE'),
  'draft': _PillSpec(RunqColors.grayInk, 'DRAFT'),
  'pending_match': _PillSpec(RunqColors.amberInk, 'MATCH NEEDED'),
  'matched': _PillSpec(RunqColors.blueInk, '3-WAY MATCHED'),
  'approved': _PillSpec(RunqColors.blueInk, 'APPROVED'),
  'pending_approval': _PillSpec(RunqColors.amberInk, 'PENDING'),
  'pending': _PillSpec(RunqColors.amberInk, 'PENDING'),
  'partially_paid': _PillSpec(RunqColors.purpleInk, 'PART-PAID'),
  'on_track': _PillSpec(RunqColors.greenInk, 'ON TRACK'),
  'urgent': _PillSpec(RunqColors.redInk, 'URGENT'),
  'save': _PillSpec(RunqColors.purpleInk, 'SAVE'),
};

const _lightBg = <String, Color>{
  'paid': RunqColors.greenBg,
  'sent': RunqColors.blueBg,
  'approved': RunqColors.blueBg,
  'matched': RunqColors.blueBg,
  'overdue': RunqColors.redBg,
  'urgent': RunqColors.redBg,
  'pending_match': RunqColors.amberBg,
  'pending_approval': RunqColors.amberBg,
  'pending': RunqColors.amberBg,
  'on_track': RunqColors.greenBg,
  'save': RunqColors.purpleBg,
  'partially_paid': RunqColors.purpleBg,
  'draft': RunqColors.grayBg,
};

class StatusPill extends StatelessWidget {
  final String status;
  final bool overlay;
  final bool warning;
  const StatusPill(this.status, {super.key, this.overlay = false, this.warning = false});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final spec = _lightSpec[status] ??
        _PillSpec(RunqColors.grayInk, status.replaceAll('_', ' ').toUpperCase());

    Color bg, fg;
    if (overlay) {
      bg = Colors.white.withValues(alpha: 0.18);
      fg = Colors.white;
    } else if (isDark) {
      // Tinted bg using the brand ink at low alpha; light text.
      final inkBase = spec.ink;
      bg = inkBase.withValues(alpha: 0.18);
      fg = _darkInk[status] ?? const Color(0xFFE5E7EB);
    } else {
      bg = _lightBg[status] ?? RunqColors.grayBg;
      fg = spec.ink;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (warning) ...[
            Text('!', style: RunqText.micro.copyWith(color: fg, fontSize: 11)),
            const SizedBox(width: 3),
          ],
          Text(spec.label, style: RunqText.micro.copyWith(color: fg)),
        ],
      ),
    );
  }
}
