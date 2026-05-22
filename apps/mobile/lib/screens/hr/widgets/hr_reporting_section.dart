// Reporting-line section for the directory work-profile — the manager
// card plus the list of direct reports. Each row is tappable and recurses
// into the same /hr/directory/:id route.

library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../api/hr_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_widgets.dart';

class HrReportingSection extends StatelessWidget {
  final HrWorkProfile profile;
  const HrReportingSection({super.key, required this.profile});

  /// Whether there's anything to show — drives whether the nav offers a
  /// "Reporting" pill at all.
  bool get hasContent =>
      profile.manager != null || profile.directReports.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final reports = profile.directReports;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (profile.manager != null) ...[
          _label(t, 'Reports to'),
          _PersonRow(person: profile.manager!),
        ],
        if (reports.isNotEmpty) ...[
          if (profile.manager != null) const SizedBox(height: 16),
          _label(t, reports.length == 1
              ? 'Direct report'
              : '${reports.length} direct reports'),
          Container(
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              border: Border.all(color: t.hairline, width: 0.5),
              boxShadow: RunqShadows.card,
            ),
            child: Column(
              children: [
                for (var i = 0; i < reports.length; i++) ...[
                  _PersonRow(person: reports[i], flat: true),
                  if (i < reports.length - 1)
                    Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 62),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _label(RunqTokens t, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
        child: Text(text.toUpperCase(),
            style: RunqText.label.copyWith(color: t.muted2)),
      );
}

/// A tappable colleague row — recurses into the same profile route. Used
/// for both the manager card and each direct-report row.
class _PersonRow extends StatelessWidget {
  final HrEmployee person;
  /// True when rendered inside a shared card (drops its own border/shadow).
  final bool flat;
  const _PersonRow({required this.person, this.flat = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inner = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          HrAvatar(
            name: person.displayName,
            photoUrl: person.photoUrl,
            employeeId: person.id,
            size: 38,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(person.displayName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                if (person.designationName != null) ...[
                  const SizedBox(height: 2),
                  Text(person.designationName!,
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
        ],
      ),
    );
    return InkWell(
      borderRadius: BorderRadius.circular(flat ? 0 : RunqRadii.smallCard),
      onTap: () => context.push('/hr/directory/${person.id}'),
      child: flat
          ? inner
          : Container(
              decoration: BoxDecoration(
                color: t.surface,
                borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                border: Border.all(color: t.hairline, width: 0.5),
                boxShadow: RunqShadows.card,
              ),
              child: inner,
            ),
    );
  }
}
