part of '../hr_employee_detail_screen.dart';

// Reporting-manager picker: entry point + the searchable bottom-sheet
// used to set/clear an employee's manager.

// ─── Reporting-manager picker ─────────────────────────────────────────────

/// Opens the searchable manager picker. Called synchronously right after the
/// actions sheet pops, so `context` is still valid to anchor the new modal —
/// the same pattern as Assign salary. All the work (load / patch / refresh)
/// lives inside the sheet, which owns a mounted context + ref.
void _setReportingManager(BuildContext context, HrEmployee emp) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ManagerPickerSheet(emp: emp),
  );
}

class _ManagerPickerSheet extends ConsumerStatefulWidget {
  final HrEmployee emp;
  const _ManagerPickerSheet({required this.emp});

  @override
  ConsumerState<_ManagerPickerSheet> createState() => _ManagerPickerSheetState();
}

class _ManagerPickerSheetState extends ConsumerState<_ManagerPickerSheet> {
  String _q = '';
  final _controller = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _apply(String? managerId) async {
    final emp = widget.emp;
    // No-op if unchanged — just dismiss.
    if (managerId == emp.reportingToId) {
      Navigator.of(context).maybePop();
      return;
    }
    setState(() => _saving = true);
    try {
      await hrRepo.updateEmployee(emp.id, {'reportingToId': managerId});
      // Refresh the detail record, the People list, this person's work
      // profile (so its Reporting section appears) and the org chart.
      ref
        ..invalidate(hrEmployeeProvider(emp.id))
        ..invalidate(hrEmployeesProvider)
        ..invalidate(hrWorkProfileProvider(emp.id))
        ..invalidate(hrOrgChartProvider);
      if (mounted) {
        showRunqSnack(
          context,
          managerId == null ? 'Reporting manager cleared' : 'Reporting manager updated',
          kind: SnackKind.success,
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Update failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final async = ref.watch(hrOrgChartProvider);
    final q = _q.trim().toLowerCase();

    return Container(
      padding: EdgeInsets.fromLTRB(8, 12, 8, 12 + inset),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.82,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Reporting manager',
                    style: RunqText.h4.copyWith(color: t.ink)),
                const SizedBox(height: 2),
                Text('Who does ${widget.emp.displayName} report to?',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: TextField(
              controller: _controller,
              textCapitalization: TextCapitalization.none,
              onChanged: (v) => setState(() => _q = v),
              decoration: InputDecoration(
                hintText: 'Search name or code',
                hintStyle: RunqText.body.copyWith(color: t.muted2),
                prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
                isDense: true,
                filled: true,
                fillColor: t.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: t.hairline, width: 0.5),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                      color: HrColors.teal.withValues(alpha: 0.55), width: 1.5),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Flexible(
            child: async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(24),
                child: Text('$e', style: RunqText.body.copyWith(color: t.muted)),
              ),
              data: (people) {
                // Everyone but this employee can be their manager; a person
                // can't report to themselves.
                final candidates = people
                    .where((e) => e.id != widget.emp.id)
                    .where((e) =>
                        q.isEmpty ||
                        e.displayName.toLowerCase().contains(q) ||
                        e.employeeCode.toLowerCase().contains(q) ||
                        (e.designationName?.toLowerCase().contains(q) ?? false))
                    .toList()
                  ..sort((a, b) =>
                      a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));
                return ListView(
                  shrinkWrap: true,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  children: [
                    if (q.isEmpty)
                      _ManagerOption(
                        leading: Icon(Icons.person_off_outlined, color: t.muted, size: 22),
                        title: 'No manager',
                        subtitle: 'Top of the reporting line',
                        selected: widget.emp.reportingToId == null,
                        onTap: _saving ? null : () => _apply(null),
                      ),
                    for (final e in candidates)
                      _ManagerOption(
                        leading: HrAvatar(
                          name: e.displayName,
                          photoUrl: e.photoUrl,
                          employeeId: e.id,
                          size: 36,
                        ),
                        title: e.displayName,
                        subtitle: [
                          e.employeeCode,
                          if (e.designationName != null) e.designationName!,
                        ].join(' · '),
                        selected: widget.emp.reportingToId == e.id,
                        onTap: _saving ? null : () => _apply(e.id),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ManagerOption extends StatelessWidget {
  final Widget leading;
  final String title, subtitle;
  final bool selected;
  final VoidCallback? onTap;
  const _ManagerOption({
    required this.leading,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? HrColors.teal : t.hairline,
                width: selected ? 1.2 : 0.5,
              ),
            ),
            child: Row(
              children: [
                leading,
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: RunqText.bodyStrong.copyWith(color: t.ink),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      if (subtitle.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(subtitle,
                            style: RunqText.caption.copyWith(color: t.muted),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ],
                  ),
                ),
                if (selected)
                  const Icon(Icons.check_circle_rounded, color: HrColors.teal, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
