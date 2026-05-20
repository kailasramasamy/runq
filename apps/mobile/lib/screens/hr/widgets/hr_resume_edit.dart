// Edit form for the AI-extracted resume profile. Management corrects the
// extracted data here; the first edit is logged as an AI-vs-human diff
// server-side. All free-text capitalises by sentence; dates/years don't.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_repo.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';
import 'hr_form.dart';

class _ExpDraft {
  final company = TextEditingController();
  final title = TextEditingController();
  final fromDate = TextEditingController();
  final toDate = TextEditingController();
  final description = TextEditingController();

  _ExpDraft([HrResumeExperience? e]) {
    if (e != null) {
      company.text = e.company;
      title.text = e.title ?? '';
      fromDate.text = e.fromDate ?? '';
      toDate.text = e.toDate ?? '';
      description.text = e.description ?? '';
    }
  }

  HrResumeExperience toModel() => HrResumeExperience(
        company: company.text.trim(),
        title: _orNull(title.text),
        fromDate: _orNull(fromDate.text),
        toDate: _orNull(toDate.text),
        description: _orNull(description.text),
      );

  void dispose() {
    company.dispose();
    title.dispose();
    fromDate.dispose();
    toDate.dispose();
    description.dispose();
  }
}

class _EduDraft {
  final degree = TextEditingController();
  final institution = TextEditingController();
  final year = TextEditingController();
  final grade = TextEditingController();

  _EduDraft([HrResumeEducation? e]) {
    if (e != null) {
      degree.text = e.degree;
      institution.text = e.institution ?? '';
      year.text = e.year ?? '';
      grade.text = e.grade ?? '';
    }
  }

  HrResumeEducation toModel() => HrResumeEducation(
        degree: degree.text.trim(),
        institution: _orNull(institution.text),
        year: _orNull(year.text),
        grade: _orNull(grade.text),
      );

  void dispose() {
    degree.dispose();
    institution.dispose();
    year.dispose();
    grade.dispose();
  }
}

class _CertDraft {
  final name = TextEditingController();
  final issuer = TextEditingController();
  final year = TextEditingController();

  _CertDraft([HrResumeCertification? c]) {
    if (c != null) {
      name.text = c.name;
      issuer.text = c.issuer ?? '';
      year.text = c.year ?? '';
    }
  }

  HrResumeCertification toModel() => HrResumeCertification(
        name: name.text.trim(),
        issuer: _orNull(issuer.text),
        year: _orNull(year.text),
      );

  void dispose() {
    name.dispose();
    issuer.dispose();
    year.dispose();
  }
}

String? _orNull(String s) => s.trim().isEmpty ? null : s.trim();

class HrResumeEditForm extends ConsumerStatefulWidget {
  final String employeeId;
  final HrResumeProfile profile;
  final VoidCallback onDone;
  const HrResumeEditForm({
    super.key,
    required this.employeeId,
    required this.profile,
    required this.onDone,
  });

  @override
  ConsumerState<HrResumeEditForm> createState() => _HrResumeEditFormState();
}

class _HrResumeEditFormState extends ConsumerState<HrResumeEditForm> {
  late final TextEditingController _summary;
  late final TextEditingController _totalExp;
  late final List<_ExpDraft> _experience;
  late final List<_EduDraft> _education;
  late final List<_CertDraft> _certifications;
  late List<String> _skills;
  late List<String> _languages;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final p = widget.profile;
    _summary = TextEditingController(text: p.summary ?? '');
    _totalExp = TextEditingController(
      text: p.totalExpYears == null ? '' : _trimNum(p.totalExpYears!),
    );
    _experience = p.experience.map((e) => _ExpDraft(e)).toList();
    _education = p.education.map((e) => _EduDraft(e)).toList();
    _certifications = p.certifications.map((c) => _CertDraft(c)).toList();
    _skills = List.of(p.skills);
    _languages = List.of(p.languages);
  }

  @override
  void dispose() {
    _summary.dispose();
    _totalExp.dispose();
    for (final d in _experience) {
      d.dispose();
    }
    for (final d in _education) {
      d.dispose();
    }
    for (final d in _certifications) {
      d.dispose();
    }
    super.dispose();
  }

  static String _trimNum(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  Future<void> _save() async {
    setState(() => _saving = true);
    final exp = _experience.map((d) => d.toModel()).where((e) => e.company.isNotEmpty);
    final edu = _education.map((d) => d.toModel()).where((e) => e.degree.isNotEmpty);
    final certs = _certifications.map((d) => d.toModel()).where((c) => c.name.isNotEmpty);
    final years = double.tryParse(_totalExp.text.trim());
    final body = <String, dynamic>{
      'summary': _orNull(_summary.text),
      'experience': exp.map((e) => e.toJson()).toList(),
      'education': edu.map((e) => e.toJson()).toList(),
      'skills': _skills,
      'certifications': certs.map((c) => c.toJson()).toList(),
      'languages': _languages,
      'totalExpYears': years,
    };
    try {
      await hrRepo.updateResumeProfile(widget.employeeId, body);
      ref.invalidate(hrResumeProfileProvider(widget.employeeId));
      if (!mounted) return;
      showRunqSnack(context, 'Resume profile updated', kind: SnackKind.success);
      widget.onDone();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, 'Could not save: $e', kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        HrFormSection(title: 'Summary', children: [
          HrTextField(
            label: 'Professional summary',
            controller: _summary,
            maxLines: 4,
            hint: 'Short summary from the resume',
          ),
          HrTextField(
            label: 'Total experience (years)',
            controller: _totalExp,
            keyboard: const TextInputType.numberWithOptions(decimal: true),
            textCapitalization: TextCapitalization.none,
          ),
        ]),
        const SizedBox(height: 16),
        _ExperienceEditor(
          drafts: _experience,
          onAdd: () => setState(() => _experience.add(_ExpDraft())),
          onRemove: (i) => setState(() => _experience.removeAt(i).dispose()),
        ),
        const SizedBox(height: 16),
        _EducationEditor(
          drafts: _education,
          onAdd: () => setState(() => _education.add(_EduDraft())),
          onRemove: (i) => setState(() => _education.removeAt(i).dispose()),
        ),
        const SizedBox(height: 16),
        _CertificationEditor(
          drafts: _certifications,
          onAdd: () => setState(() => _certifications.add(_CertDraft())),
          onRemove: (i) => setState(() => _certifications.removeAt(i).dispose()),
        ),
        const SizedBox(height: 16),
        _ChipListEditor(
          title: 'Skills',
          items: _skills,
          hint: 'Add a skill',
          onChanged: (next) => setState(() => _skills = next),
        ),
        const SizedBox(height: 16),
        _ChipListEditor(
          title: 'Languages',
          items: _languages,
          hint: 'Add a language',
          onChanged: (next) => setState(() => _languages = next),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _saving ? null : widget.onDone,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  side: BorderSide(color: RT(context).hairline),
                  foregroundColor: RT(context).ink,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Cancel'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: HrSubmitButton(
                label: _saving ? 'Saving…' : 'Save changes',
                enabled: !_saving,
                onPressed: _save,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── Repeatable entry editors ────────────────────────────────────────────────

class _EntryGroup extends StatelessWidget {
  final String title;
  final String addLabel;
  final int count;
  final VoidCallback onAdd;
  final Widget Function(int) entryBuilder;
  const _EntryGroup({
    required this.title,
    required this.addLabel,
    required this.count,
    required this.onAdd,
    required this.entryBuilder,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 6),
          child: Text(
            title.toUpperCase(),
            style: TextStyle(
              color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
            ),
          ),
        ),
        for (var i = 0; i < count; i++) ...[
          entryBuilder(i),
          const SizedBox(height: 10),
        ],
        InkWell(
          onTap: onAdd,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.add_rounded, size: 17, color: HrColors.brand(context)),
                const SizedBox(width: 6),
                Text(addLabel,
                    style: TextStyle(
                      color: HrColors.brand(context),
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    )),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _EntryCard extends StatelessWidget {
  final String heading;
  final VoidCallback onRemove;
  final List<Widget> fields;
  const _EntryCard({required this.heading, required this.onRemove, required this.fields});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 6, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(heading,
                      style: TextStyle(
                        color: t.muted, fontSize: 11, fontWeight: FontWeight.w700,
                      )),
                ),
                IconButton(
                  onPressed: onRemove,
                  visualDensity: VisualDensity.compact,
                  icon: Icon(Icons.delete_outline_rounded, size: 18, color: t.muted2),
                ),
              ],
            ),
          ),
          for (var i = 0; i < fields.length; i++) ...[
            fields[i],
            if (i < fields.length - 1)
              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
          ],
        ],
      ),
    );
  }
}

class _ExperienceEditor extends StatelessWidget {
  final List<_ExpDraft> drafts;
  final VoidCallback onAdd;
  final void Function(int) onRemove;
  const _ExperienceEditor({required this.drafts, required this.onAdd, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return _EntryGroup(
      title: 'Experience',
      addLabel: 'Add experience',
      count: drafts.length,
      onAdd: onAdd,
      entryBuilder: (i) {
        final d = drafts[i];
        return _EntryCard(
          heading: 'Experience ${i + 1}',
          onRemove: () => onRemove(i),
          fields: [
            HrTextField(label: 'Company', controller: d.company),
            HrTextField(label: 'Title', controller: d.title),
            HrTextField(
              label: 'From (YYYY or YYYY-MM)',
              controller: d.fromDate,
              textCapitalization: TextCapitalization.none,
            ),
            HrTextField(
              label: 'To (YYYY, YYYY-MM or blank)',
              controller: d.toDate,
              textCapitalization: TextCapitalization.none,
            ),
            HrTextField(label: 'Description', controller: d.description, maxLines: 3),
          ],
        );
      },
    );
  }
}

class _EducationEditor extends StatelessWidget {
  final List<_EduDraft> drafts;
  final VoidCallback onAdd;
  final void Function(int) onRemove;
  const _EducationEditor({required this.drafts, required this.onAdd, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return _EntryGroup(
      title: 'Education',
      addLabel: 'Add education',
      count: drafts.length,
      onAdd: onAdd,
      entryBuilder: (i) {
        final d = drafts[i];
        return _EntryCard(
          heading: 'Education ${i + 1}',
          onRemove: () => onRemove(i),
          fields: [
            HrTextField(label: 'Degree', controller: d.degree),
            HrTextField(label: 'Institution', controller: d.institution),
            HrTextField(
              label: 'Year',
              controller: d.year,
              textCapitalization: TextCapitalization.none,
            ),
            HrTextField(
              label: 'Grade (CGPA / % / class)',
              controller: d.grade,
              textCapitalization: TextCapitalization.none,
            ),
          ],
        );
      },
    );
  }
}

class _CertificationEditor extends StatelessWidget {
  final List<_CertDraft> drafts;
  final VoidCallback onAdd;
  final void Function(int) onRemove;
  const _CertificationEditor({required this.drafts, required this.onAdd, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return _EntryGroup(
      title: 'Certifications',
      addLabel: 'Add certification',
      count: drafts.length,
      onAdd: onAdd,
      entryBuilder: (i) {
        final d = drafts[i];
        return _EntryCard(
          heading: 'Certification ${i + 1}',
          onRemove: () => onRemove(i),
          fields: [
            HrTextField(label: 'Name', controller: d.name),
            HrTextField(label: 'Issuer', controller: d.issuer),
            HrTextField(
              label: 'Year',
              controller: d.year,
              textCapitalization: TextCapitalization.none,
            ),
          ],
        );
      },
    );
  }
}

// ─── Chip list editor (skills, languages) ────────────────────────────────────

class _ChipListEditor extends StatefulWidget {
  final String title;
  final String hint;
  final List<String> items;
  final ValueChanged<List<String>> onChanged;
  const _ChipListEditor({
    required this.title,
    required this.hint,
    required this.items,
    required this.onChanged,
  });

  @override
  State<_ChipListEditor> createState() => _ChipListEditorState();
}

class _ChipListEditorState extends State<_ChipListEditor> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _add() {
    final v = _ctrl.text.trim();
    if (v.isNotEmpty && !widget.items.contains(v)) {
      widget.onChanged([...widget.items, v]);
    }
    _ctrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 6),
          child: Text(
            widget.title.toUpperCase(),
            style: TextStyle(
              color: t.muted2, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (widget.items.isNotEmpty)
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (var i = 0; i < widget.items.length; i++)
                      Chip(
                        label: Text(widget.items[i],
                            style: TextStyle(color: HrColors.brand(context), fontSize: 12.5)),
                        backgroundColor: HrColors.tealSubtle,
                        side: BorderSide.none,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                        deleteIconColor: HrColors.brand(context),
                        onDeleted: () {
                          final next = [...widget.items]..removeAt(i);
                          widget.onChanged(next);
                        },
                      ),
                  ],
                ),
              TextField(
                controller: _ctrl,
                style: TextStyle(color: t.ink, fontSize: 14, fontWeight: FontWeight.w500),
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _add(),
                onEditingComplete: _add,
                decoration: InputDecoration(
                  hintText: widget.hint,
                  hintStyle: TextStyle(color: t.muted2, fontSize: 14),
                  isDense: true,
                  border: InputBorder.none,
                  suffixIcon: IconButton(
                    icon: Icon(Icons.add_rounded, color: HrColors.brand(context)),
                    onPressed: _add,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
