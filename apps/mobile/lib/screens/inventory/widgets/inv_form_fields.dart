// Reusable form primitives for inventory create/edit screens — labelled text
// fields, a numeric field, a segmented toggle, a dropdown, a switch row, a
// titled section card, and a sticky submit bar. All brand-amber on focus so
// inventory forms share one input language. Text styling uses RunqText tokens
// only (no hardcoded sizes) per the app typography guard.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

InputDecoration invFieldDecoration(BuildContext context, String? hint) {
  final t = RT(context);
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c, width: w),
      );
  return InputDecoration(
    hintText: hint,
    hintStyle: RunqText.body.copyWith(color: t.muted2),
    filled: true,
    fillColor: t.surface,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    border: border(t.hairline),
    enabledBorder: border(t.hairline),
    focusedBorder: border(InvColors.brand(context), 1.2),
  );
}

class InvFieldLabel extends StatelessWidget {
  const InvFieldLabel(this.text, {super.key, this.required = false});
  final String text;
  final bool required;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Text(text.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.5)),
        if (required)
          Text(' *', style: RunqText.micro.copyWith(color: InvColors.error)),
      ],
    );
  }
}

class InvFormField extends StatelessWidget {
  const InvFormField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.required = false,
    this.keyboardType,
    this.maxLines = 1,
    this.capitalization = TextCapitalization.none,
    this.formatters,
  });
  final String label;
  final TextEditingController controller;
  final String? hint;
  final bool required;
  final TextInputType? keyboardType;
  final int maxLines;
  final TextCapitalization capitalization;
  final List<TextInputFormatter>? formatters;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InvFieldLabel(label, required: required),
          const SizedBox(height: 6),
          TextField(
            controller: controller,
            keyboardType: keyboardType,
            maxLines: maxLines,
            textCapitalization: capitalization,
            inputFormatters: formatters,
            cursorColor: InvColors.brand(context),
            style: RunqText.body.copyWith(color: t.ink),
            decoration: invFieldDecoration(context, hint),
          ),
        ],
      ),
    );
  }
}

class InvNumField extends StatelessWidget {
  const InvNumField({super.key, required this.label, required this.controller});
  final String label;
  final TextEditingController controller;
  @override
  Widget build(BuildContext context) {
    return InvFormField(
      label: label,
      controller: controller,
      hint: '0',
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
    );
  }
}

/// Segmented single-choice toggle. [options] are (key, label) pairs.
class InvSegmented extends StatelessWidget {
  const InvSegmented({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
  });
  final String value;
  final List<({String key, String label})> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    final children = <Widget>[];
    for (var i = 0; i < options.length; i++) {
      if (i > 0) children.add(const SizedBox(width: 8));
      final o = options[i];
      final active = value == o.key;
      children.add(Expanded(
        child: GestureDetector(
          onTap: () => onChanged(o.key),
          child: Container(
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active ? brand.withValues(alpha: 0.12) : t.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color: active ? brand : t.hairline, width: active ? 1.2 : 1),
            ),
            child: Text(o.label,
                style: RunqText.bodyStrong.copyWith(color: active ? brand : t.ink)),
          ),
        ),
      ));
    }
    return Row(children: children);
  }
}

/// Dropdown styled to match the inventory field language. [options] are
/// (key, label) pairs.
class InvDropdownField extends StatelessWidget {
  const InvDropdownField({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
  });
  final String? value;
  final List<({String key, String label})> options;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      style: RunqText.body.copyWith(color: t.ink),
      dropdownColor: t.surface,
      decoration: invFieldDecoration(context, null),
      items: options
          .map((o) => DropdownMenuItem(value: o.key, child: Text(o.label)))
          .toList(),
      onChanged: onChanged,
    );
  }
}

class InvSwitchRow extends StatelessWidget {
  const InvSwitchRow({
    super.key,
    required this.label,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });
  final String label;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool enabled;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: RunqText.bodyStrong
                        .copyWith(color: enabled ? t.ink : t.muted2)),
                const SizedBox(height: 1),
                Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Switch.adaptive(
            value: value,
            onChanged: enabled ? onChanged : null,
            activeTrackColor: InvColors.brand(context),
          ),
        ],
      ),
    );
  }
}

/// Titled card grouping a set of form fields. Title takes the brand colour.
class InvFormSection extends StatelessWidget {
  const InvFormSection({super.key, required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Text(title,
              style: RunqText.bodyStrong.copyWith(color: InvColors.brand(context))),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 4),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: children),
        ),
      ],
    );
  }
}
