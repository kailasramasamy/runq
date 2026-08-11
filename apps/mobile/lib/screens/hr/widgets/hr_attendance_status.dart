// Shared attendance-status vocabulary for the HR calendar surfaces.
//
// The server's `attendance_status` enum is
// ['present','absent','half_day','leave','holiday','week_off']. The
// calendar additionally renders two *derived* pseudo-statuses that never
// exist as rows:
//
//   'unmarked' — a past working day with no attendance row yet
//   'upcoming' — a future working day (nothing to show, nothing missing)
//
// Colour pairs are [background, ink] and deliberately mirror the ones in
// `HrMusterTile` / `HrWeekStrip._statusPair` so a day reads the same on
// the muster grid, the week strip, and the month calendar.

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_tokens.dart';

/// Canonical server statuses a user can pick when marking a day.
const kHrMarkableStatuses = <String>[
  'present',
  'half_day',
  'leave',
  'absent',
  'week_off',
  'holiday',
];

class HrStatusMeta {
  final String status;
  final String label;
  final String short;
  final IconData icon;
  const HrStatusMeta(this.status, this.label, this.short, this.icon);
}

const _meta = <String, HrStatusMeta>{
  'present':  HrStatusMeta('present',  'Present',   'P',  Icons.check_circle_outline),
  'half_day': HrStatusMeta('half_day', 'Half day',  'HD', Icons.contrast),
  'leave':    HrStatusMeta('leave',    'Leave',     'L',  Icons.beach_access_outlined),
  'absent':   HrStatusMeta('absent',   'Absent',    'A',  Icons.cancel_outlined),
  'week_off': HrStatusMeta('week_off', 'Week off',  'WO', Icons.weekend_outlined),
  'holiday':  HrStatusMeta('holiday',  'Holiday',   'H',  Icons.celebration_outlined),
  'unmarked': HrStatusMeta('unmarked', 'Not marked','—',  Icons.help_outline),
  'upcoming': HrStatusMeta('upcoming', 'Upcoming',  '',   Icons.schedule),
};

HrStatusMeta hrStatusMeta(String status) =>
    _meta[status] ?? _meta['unmarked']!;

const _light = <String, List<Color>>{
  'present':  [Color(0xFFDCFCE7), Color(0xFF14532D)],
  'half_day': [Color(0xFFDBEAFE), Color(0xFF1E3A8A)],
  'leave':    [Color(0xFFFEF3C7), Color(0xFF78350F)],
  'absent':   [Color(0xFFFEE2E2), Color(0xFF7F1D1D)],
  'week_off': [Color(0xFFF1F5F9), Color(0xFF475569)],
  'holiday':  [Color(0xFFEDE9FE), Color(0xFF5B21B6)],
  'unmarked': [Color(0xFFFFFFFF), Color(0xFF94A3B8)],
};

const _dark = <String, List<Color>>{
  'present':  [Color(0xFF14532D), Color(0xFF86EFAC)],
  'half_day': [Color(0xFF1E3A8A), Color(0xFF93C5FD)],
  'leave':    [Color(0xFF78350F), Color(0xFFFCD34D)],
  'absent':   [Color(0xFF7F1D1D), Color(0xFFFCA5A5)],
  'week_off': [Color(0xFF334155), Color(0xFFCBD5E1)],
  'holiday':  [Color(0xFF5B21B6), Color(0xFFC4B5FD)],
  'unmarked': [Color(0xFF1F2937), Color(0xFF64748B)],
};

/// Background + ink pair for a status, resolved for the active theme.
/// 'upcoming' intentionally falls through to the page surface so future
/// days read as empty rather than as a missing-attendance warning.
List<Color> hrStatusColors(BuildContext context, String status) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  if (status == 'upcoming') {
    final t = RT(context);
    return [t.surface, t.muted2];
  }
  final table = isDark ? _dark : _light;
  return table[status] ?? table['unmarked']!;
}
