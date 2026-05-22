// Read-only resume-profile section widgets. Shared by the employee detail
// Resume tab (HrResumeTab) and the directory work-profile screen, so the
// "Summary / Experience / Education / Skills / …" rendering lives in one
// place. Provenance banner, upload and edit controls are NOT here — those
// are management surfaces and stay with HrResumeTab.

library;

import 'package:flutter/material.dart';
import '../../../api/hr_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';

bool _has(String? s) => s != null && s.trim().isNotEmpty;

String _dateRange(String? from, String? to) {
  if (!_has(from) && !_has(to)) return '';
  return '${from ?? '?'} — ${to ?? 'Present'}';
}

/// A resume section paired with the short label a tab/pill nav would show.
typedef ResumeSection = ({String label, Widget widget});

/// The resume profile as labelled section widgets — empty sections omitted.
/// Callers own the layout: stack them with their own spacing, or drive a
/// pill/tab navigator off [ResumeSection.label].
List<ResumeSection> hrResumeSections(HrResumeProfile profile) {
  final out = <ResumeSection>[];

  if (_has(profile.summary)) {
    out.add((label: 'About', widget: ResumeSummaryCard(text: profile.summary!.trim())));
  }
  if (profile.experience.isNotEmpty) {
    out.add((
      label: 'Experience',
      widget: ResumeEntryList(
        title: 'Experience',
        icon: Icons.work_outline_rounded,
        entries: [
          for (final e in profile.experience)
            ResumeEntry(
              title: [e.title, e.company].where(_has).join(' · '),
              meta: _dateRange(e.fromDate, e.toDate),
              body: e.description,
            ),
        ],
      ),
    ));
  }
  if (profile.education.isNotEmpty) {
    out.add((
      label: 'Education',
      widget: ResumeEntryList(
        title: 'Education',
        icon: Icons.school_outlined,
        entries: [
          for (final e in profile.education)
            ResumeEntry(
              title: e.degree,
              meta: [e.institution, e.year, e.grade].where(_has).join(' · '),
            ),
        ],
      ),
    ));
  }
  if (profile.skills.isNotEmpty) {
    out.add((
      label: 'Skills',
      widget: ResumeChipSection(title: 'Skills', items: profile.skills),
    ));
  }
  if (profile.certifications.isNotEmpty) {
    out.add((
      label: 'Certifications',
      widget: ResumeEntryList(
        title: 'Certifications',
        icon: Icons.workspace_premium_outlined,
        entries: [
          for (final c in profile.certifications)
            ResumeEntry(
              title: c.name,
              meta: [c.issuer, c.year].where(_has).join(' · '),
            ),
        ],
      ),
    ));
  }
  if (profile.languages.isNotEmpty) {
    out.add((
      label: 'Languages',
      widget: ResumeChipSection(title: 'Languages', items: profile.languages),
    ));
  }
  return out;
}

/// Titled card shell — uppercase label above a surface container.
class ResumeSectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const ResumeSectionCard({super.key, required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(title.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted2)),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: child,
        ),
      ],
    );
  }
}

class ResumeSummaryCard extends StatelessWidget {
  final String text;
  const ResumeSummaryCard({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    return ResumeSectionCard(
      title: 'About',
      child: Text(text,
          style: RunqText.body.copyWith(color: RT(context).ink, height: 1.45)),
    );
  }
}

class ResumeEntry {
  final String title;
  final String meta;
  final String? body;
  const ResumeEntry({required this.title, required this.meta, this.body});
}

class ResumeEntryList extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<ResumeEntry> entries;
  const ResumeEntryList({
    super.key,
    required this.title,
    required this.icon,
    required this.entries,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text(title.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted2)),
        ),
        for (var i = 0; i < entries.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          _EntryCardView(icon: icon, entry: entries[i]),
        ],
      ],
    );
  }
}

class _EntryCardView extends StatelessWidget {
  final IconData icon;
  final ResumeEntry entry;
  const _EntryCardView({required this.icon, required this.entry});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: HrColors.brand(context)),
              const SizedBox(width: 7),
              Expanded(
                child: Text(entry.title,
                    style: RunqText.bodyStrong.copyWith(color: t.ink)),
              ),
            ],
          ),
          if (entry.meta.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 22, top: 2),
              child: Text(entry.meta,
                  style: RunqText.caption.copyWith(color: t.muted2)),
            ),
          if (_has(entry.body))
            Padding(
              padding: const EdgeInsets.only(left: 22, top: 5),
              child: Text(entry.body!.trim(),
                  style: RunqText.body.copyWith(color: t.muted, height: 1.4)),
            ),
        ],
      ),
    );
  }
}

class ResumeChipSection extends StatelessWidget {
  final String title;
  final List<String> items;
  const ResumeChipSection({super.key, required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    return ResumeSectionCard(
      title: title,
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final it in items)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(it,
                  style: RunqText.caption.copyWith(color: HrColors.brand(context))),
            ),
        ],
      ),
    );
  }
}
