// Shared HR form widgets — reusable across employee, holiday, salary,
// payroll-run, leave-type screens. Built on the HR theme tokens so every
// form in the module looks and behaves identically.
//
// Public surface:
//   HrWizard        — multi-step wizard scaffold with progress chip + nav.
//   HrFormScreen    — single-page form scaffold (back arrow + title + body).
//   HrTextField     — primary text input, theme-aware borders.
//   HrSelectField   — tappable row that opens a picker sheet.
//   HrDateField     — tappable row that opens a date picker.
//   HrToggleField   — switch row.
//   HrFormSection   — labelled group container.
//   HrSubmitButton  — primary teal submit button with loading state.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';

// ─── Stepped wizard ───────────────────────────────────────────────────────

class HrWizardStep {
  final String title;
  final String? subtitle;
  /// True if this step's data is valid and the user can advance. Re-read on
  /// every rebuild; not a one-time snapshot.
  final bool Function() canAdvance;
  final Widget Function(BuildContext) build;
  const HrWizardStep({
    required this.title,
    required this.canAdvance,
    required this.build,
    this.subtitle,
  });
}

class HrWizard extends StatefulWidget {
  final String title;
  final List<HrWizardStep> steps;
  /// Called when the user taps "Finish" on the last step. Return future
  /// resolves before the wizard pops; throw to keep the wizard open and
  /// surface the error in a snack via your own catch.
  final Future<void> Function() onSubmit;
  final String submitLabel;
  /// Initial step index — useful for resuming an edit flow at a specific
  /// section. Defaults to 0.
  final int initialStep;

  /// Optional secondary action surfaced on every step in the header
  /// (next to the step chip). Use for "Save draft" on a create wizard or
  /// "Save changes" on an edit wizard so the user doesn't have to walk
  /// every step to persist a small change. Tap pops the wizard on success.
  final String? secondaryActionLabel;
  final Future<void> Function()? onSecondaryAction;
  /// Gate the secondary action independently of step-level [canAdvance].
  /// For a "Save draft" this is typically `hasMinimumFields()`.
  final bool Function()? secondaryActionEnabled;

  const HrWizard({
    super.key,
    required this.title,
    required this.steps,
    required this.onSubmit,
    this.submitLabel = 'Save',
    this.initialStep = 0,
    this.secondaryActionLabel,
    this.onSecondaryAction,
    this.secondaryActionEnabled,
  });

  @override
  State<HrWizard> createState() => _HrWizardState();
}

class _HrWizardState extends State<HrWizard> {
  late int _index;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _index = widget.initialStep.clamp(0, widget.steps.length - 1);
  }

  bool get _isLast => _index == widget.steps.length - 1;

  Future<void> _next() async {
    if (!widget.steps[_index].canAdvance()) return;
    if (_isLast) {
      setState(() => _busy = true);
      try {
        await widget.onSubmit();
        if (mounted) Navigator.of(context).maybePop();
      } catch (_) {
        // Owner surfaces the error; we just unfreeze.
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      return;
    }
    setState(() => _index += 1);
  }

  Future<void> _runSecondary() async {
    final cb = widget.onSecondaryAction;
    if (cb == null) return;
    setState(() => _busy = true);
    try {
      await cb();
      if (mounted) Navigator.of(context).maybePop();
    } catch (_) {
      // Caller surfaces the error.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _back() {
    if (_index == 0) {
      Navigator.of(context).maybePop();
    } else {
      setState(() => _index -= 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final step = widget.steps[_index];
    return PopScope(
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _index > 0) setState(() => _index -= 1);
      },
      child: Scaffold(
        backgroundColor: t.bgWarm,
        body: SafeArea(
          child: Column(
            children: [
              _Header(
                title: widget.title,
                index: _index,
                total: widget.steps.length,
                onBack: _back,
                secondaryLabel: widget.secondaryActionLabel,
                onSecondary: widget.onSecondaryAction == null ? null : _runSecondary,
                secondaryEnabled: !_busy
                    && (widget.secondaryActionEnabled?.call() ?? true),
              ),
              if (step.subtitle != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 6),
                  child: Text(step.subtitle!,
                      style: RunqText.body.copyWith(color: t.muted)),
                ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                  physics: const BouncingScrollPhysics(),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  child: step.build(context),
                ),
              ),
              SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  decoration: BoxDecoration(
                    color: t.surface,
                    border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _busy ? null : _back,
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            side: BorderSide(color: t.hairline, width: 0.5),
                            foregroundColor: t.ink,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: Text(_index == 0 ? 'Cancel' : 'Back'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: HrSubmitButton(
                          label: _isLast ? widget.submitLabel : 'Continue',
                          loading: _busy,
                          enabled: step.canAdvance(),
                          onPressed: _next,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String title;
  final int index, total;
  final VoidCallback onBack;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final bool secondaryEnabled;
  const _Header({
    required this.title,
    required this.index,
    required this.total,
    required this.onBack,
    this.secondaryLabel,
    this.onSecondary,
    this.secondaryEnabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(title, style: RunqText.h2.copyWith(color: t.ink)),
          ),
          if (secondaryLabel != null && onSecondary != null) ...[
            TextButton(
              onPressed: secondaryEnabled ? onSecondary : null,
              style: TextButton.styleFrom(
                foregroundColor: HrColors.brand(context),
                disabledForegroundColor: t.muted2,
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              ),
              child: Text(secondaryLabel!,
                  style: RunqText.body.copyWith(fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 4),
          ],
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: HrColors.tealSubtle,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '${index + 1} of $total',
              style: RunqText.label.copyWith(
                color: HrColors.brand(context),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Single-page form scaffold ────────────────────────────────────────────

class HrFormScreen extends StatelessWidget {
  final String title;
  final Widget body;
  /// Bottom action — usually [HrSubmitButton]. Pass null to omit.
  final Widget? bottomAction;
  /// AppBar action button (e.g. delete icon for edit screens).
  final Widget? appBarAction;
  const HrFormScreen({
    super.key,
    required this.title,
    required this.body,
    this.bottomAction,
    this.appBarAction,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(title, style: RunqText.h2.copyWith(color: t.ink)),
                  ),
                  if (appBarAction != null) appBarAction!,
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                physics: const BouncingScrollPhysics(),
                // Drag-to-dismiss matches every other scrollable surface
                // in the app (directory, leave list, expenses list). On
                // a tall form the keyboard otherwise eats half the
                // visible area while the user is scanning further down.
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                child: body,
              ),
            ),
          ],
        ),
      ),
      // Bottom action lives on the Scaffold's `bottomNavigationBar`
      // slot rather than as the last Column child. Flutter's
      // ScaffoldMessenger lifts floating SnackBars above this slot
      // automatically, so toasts never sit underneath the button.
      bottomNavigationBar: bottomAction == null
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: bottomAction!,
              ),
            ),
    );
  }
}

// ─── Form section card ────────────────────────────────────────────────────

class HrFormSection extends StatelessWidget {
  final String? title;
  final List<Widget> children;
  const HrFormSection({super.key, this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 6),
            child: Text(
              title!.toUpperCase(),
              style: RunqText.label.copyWith(color: t.muted2),
            ),
          ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                children[i],
                if (i < children.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Inputs ───────────────────────────────────────────────────────────────

class HrTextField extends StatelessWidget {
  final String label;
  final String? hint;
  final TextEditingController controller;
  final TextInputType keyboard;
  final List<TextInputFormatter>? formatters;
  final TextCapitalization textCapitalization;
  final int? maxLines;
  final int? maxLength;
  final bool required;
  final String? Function(String)? validate;
  final ValueChanged<String>? onChanged;
  const HrTextField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboard = TextInputType.text,
    this.formatters,
    this.textCapitalization = TextCapitalization.sentences,
    this.maxLines = 1,
    this.maxLength,
    this.required = false,
    this.validate,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            required ? '$label *' : label,
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            keyboardType: keyboard,
            inputFormatters: formatters,
            textCapitalization: textCapitalization,
            maxLines: maxLines,
            maxLength: maxLength,
            onChanged: onChanged,
            style: RunqText.body.copyWith(color: t.ink),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: RunqText.body.copyWith(color: t.muted2),
              isDense: true,
              counterText: '',
              contentPadding: EdgeInsets.zero,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
            ),
          ),
        ],
      ),
    );
  }
}

class HrSelectField<T> extends StatelessWidget {
  final String label;
  final String? hint;
  final T? value;
  final String Function(T) display;
  final List<T> options;
  final ValueChanged<T?> onChanged;
  final bool required;
  const HrSelectField({
    super.key,
    required this.label,
    required this.value,
    required this.display,
    required this.options,
    required this.onChanged,
    this.hint,
    this.required = false,
  });

  Future<void> _open(BuildContext context) async {
    final t = RT(context);
    final picked = await showModalBottomSheet<T>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetCtx) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(sheetCtx).size.height * 0.65,
        ),
        decoration: BoxDecoration(
          color: t.bgWarmer,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [Text(label, style: RunqText.h4.copyWith(color: t.ink))],
              ),
            ),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: options.length,
                separatorBuilder: (_, __) =>
                    Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
                itemBuilder: (_, i) {
                  final o = options[i];
                  return ListTile(
                    dense: true,
                    title: Text(display(o),
                        style: RunqText.body.copyWith(color: t.ink)),
                    trailing: o == value
                        ? Icon(Icons.check_rounded, color: HrColors.brand(sheetCtx), size: 18)
                        : null,
                    onTap: () => Navigator.of(sheetCtx).pop(o),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
    if (picked != null) onChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final shown = value == null ? (hint ?? 'Select…') : display(value as T);
    return InkWell(
      onTap: () => _open(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    required ? '$label *' : label,
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    shown,
                    style: RunqText.body.copyWith(
                      color: value == null ? t.muted2 : t.ink,
                    ),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Icon(Icons.expand_more_rounded, color: t.muted, size: 18),
          ],
        ),
      ),
    );
  }
}

class HrDateField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final bool required;
  final DateTime? firstDate, lastDate;
  const HrDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.required = false,
    this.firstDate,
    this.lastDate,
  });

  Future<void> _pick(BuildContext context) async {
    final init = value ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: init,
      firstDate: firstDate ?? DateTime(1960),
      lastDate: lastDate ?? DateTime.now().add(const Duration(days: 365 * 10)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: HrColors.teal),
        ),
        child: child!,
      ),
    );
    if (picked != null) onChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final shown = value == null
        ? 'Select…'
        : '${value!.day} ${m[value!.month - 1]} ${value!.year}';
    return InkWell(
      onTap: () => _pick(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    required ? '$label *' : label,
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    shown,
                    style: RunqText.body.copyWith(
                      color: value == null ? t.muted2 : t.ink,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.calendar_today_outlined, color: t.muted, size: 16),
          ],
        ),
      ),
    );
  }
}

class HrToggleField extends StatelessWidget {
  final String label;
  final String? sub;
  final bool value;
  final ValueChanged<bool> onChanged;
  const HrToggleField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.sub,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: RunqText.body.copyWith(color: t.ink)),
                if (sub != null) ...[
                  const SizedBox(height: 2),
                  Text(sub!, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ],
            ),
          ),
          Switch.adaptive(
            value: value,
            activeThumbColor: HrColors.teal,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

// ─── Primary submit button ────────────────────────────────────────────────

class HrSubmitButton extends StatelessWidget {
  final String label;
  final bool loading;
  final bool enabled;
  final VoidCallback onPressed;
  const HrSubmitButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final canTap = enabled && !loading;
    return FilledButton(
      onPressed: canTap ? onPressed : null,
      style: FilledButton.styleFrom(
        backgroundColor: HrColors.teal,
        disabledBackgroundColor: t.hairlineSoft,
        disabledForegroundColor: t.muted2,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: loading
          ? const SizedBox(
              width: 18, height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }
}
