// Shared scaffolding for the HR-setup list screens (Departments,
// Designations, Shifts). Each screen is a simple list + FAB + editor
// sheet, so the chrome lives here once instead of three times.

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';
import 'hr_form.dart';

/// Back-arrow header + pull-to-refresh body + an extended add FAB.
class HrSetupScaffold extends StatelessWidget {
  final String title;
  final String addLabel;
  final String heroTag;
  final VoidCallback onAdd;
  final VoidCallback onRefresh;
  final Widget body;
  const HrSetupScaffold({
    super.key,
    required this.title,
    required this.addLabel,
    required this.heroTag,
    required this.onAdd,
    required this.onRefresh,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text(title, style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  onRefresh();
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                },
                child: body,
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: heroTag,
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        onPressed: onAdd,
        icon: const Icon(Icons.add_rounded),
        label: Text(addLabel),
      ),
    );
  }
}

/// Error state that still scrolls so pull-to-refresh works.
class HrSetupError extends StatelessWidget {
  final Object error;
  const HrSetupError({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(24, 80, 24, 120),
      children: [
        Center(child: Text('$error', textAlign: TextAlign.center,
            style: RunqText.body.copyWith(color: t.muted))),
      ],
    );
  }
}

/// Empty state — icon, headline, one-line hint.
class HrSetupEmpty extends StatelessWidget {
  final IconData icon;
  final String title;
  final String sub;
  const HrSetupEmpty({super.key, required this.icon, required this.title, required this.sub});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(24, 70, 24, 120),
      children: [
        Icon(icon, size: 40, color: t.muted2),
        const SizedBox(height: 10),
        Center(child: Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink))),
        const SizedBox(height: 6),
        Center(child: Text(sub, textAlign: TextAlign.center,
            style: RunqText.caption.copyWith(color: t.muted))),
      ],
    );
  }
}

/// Wraps pre-built rows in the standard card container with hairline
/// dividers, inside a scrollable so pull-to-refresh works.
class HrSetupList extends StatelessWidget {
  final List<Widget> rows;
  const HrSetupList({super.key, required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
      children: [
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                rows[i],
                if (i < rows.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Standard bottom-sheet editor shell — grab handle, title, scrolling
/// body, pinned submit button. Callers supply the form [children].
class HrEditorSheet extends StatelessWidget {
  final String title;
  final String saveLabel;
  final bool saving;
  final bool canSave;
  final VoidCallback onSave;
  final List<Widget> children;
  const HrEditorSheet({
    super.key,
    required this.title,
    required this.saveLabel,
    required this.saving,
    required this.canSave,
    required this.onSave,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(0, 12, 0, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Row(
              children: [Text(title, style: RunqText.h3.copyWith(color: t.ink))],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              // Sheets are mostly text inputs, so the keyboard covers half
              // the form. Dragging to see the rest should put it away rather
              // than fight it.
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              child: Column(children: children),
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(
                label: saveLabel,
                loading: saving,
                enabled: canSave,
                onPressed: onSave,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Confirm dialog shared by every setup-list delete action.
Future<bool?> showHrDeleteDialog(
  BuildContext context, {
  required String name,
  required String note,
}) {
  return showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text('Delete $name?'),
      content: Text(note),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
          child: const Text('Delete'),
        ),
      ],
    ),
  );
}
