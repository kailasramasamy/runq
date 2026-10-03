import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_card.dart';

/// Shared building blocks for the agreement form and the payment sheet,
/// mirroring the payment-made screen's look.

String ordinal(int n) {
  final tens = n % 100;
  if (tens >= 11 && tens <= 13) return '${n}th';
  return switch (n % 10) { 1 => '${n}st', 2 => '${n}nd', 3 => '${n}rd', _ => '${n}th' };
}

class FormSectionHeader extends StatelessWidget {
  final String label;
  final String? hint;
  const FormSectionHeader(this.label, {super.key, this.hint});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(label.toUpperCase(),
                style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
          ),
          if (hint != null) Text(hint!, style: RunqText.caption.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

/// Grouped card whose [children] are separated by hairline dividers.
class FormGroupCard extends StatelessWidget {
  final List<Widget> children;
  const FormGroupCard({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              Divider(height: 1, thickness: 0.6, color: t.hairline, indent: 14, endIndent: 14),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// Big borderless amount input. [caption] sits underneath when set.
class FormAmountCard extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? caption;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  const FormAmountCard({
    super.key,
    required this.label,
    required this.controller,
    this.caption,
    this.autofocus = false,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final big = RunqText.tabular(size: 28, w: FontWeight.w700, color: t.ink);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          Row(
            children: [
              Text('₹', style: RunqText.tabular(size: 28, w: FontWeight.w700, color: t.muted)),
              const SizedBox(width: 6),
              Expanded(
                child: TextField(
                  controller: controller,
                  autofocus: autofocus,
                  onChanged: onChanged,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textCapitalization: TextCapitalization.none,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                  style: big,
                  decoration: InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    hintText: '0.00',
                    hintStyle: big.copyWith(color: t.muted2),
                  ),
                ),
              ),
            ],
          ),
          if (caption != null) ...[
            const SizedBox(height: 4),
            Text(caption!, style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ],
      ),
    );
  }
}

/// Icon tile + caption label + value. A null [onTap] renders it read-only.
class FormPickerRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? value;
  final String placeholder;
  final VoidCallback? onTap;
  final VoidCallback? onClear;
  const FormPickerRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.placeholder = 'Select',
    this.onTap,
    this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final editable = onTap != null;
    final hasValue = value != null && value!.isNotEmpty;
    final tint = editable ? RunqColors.indigo : t.muted2;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: tint, size: 19),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: RunqText.caption.copyWith(color: t.muted)),
                  const SizedBox(height: 2),
                  Text(hasValue ? value! : placeholder,
                      style: RunqText.bodyStrong
                          .copyWith(color: !hasValue ? t.muted2 : (editable ? t.ink : t.muted)),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            if (onClear != null)
              GestureDetector(
                onTap: onClear,
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(Icons.close_rounded, color: t.muted2, size: 18),
                ),
              ),
            if (editable) Icon(Icons.chevron_right_rounded, color: t.muted2, size: 20),
          ],
        ),
      ),
    );
  }
}

/// Borderless text field with a caption label above it.
class FormTextRow extends StatelessWidget {
  final TextEditingController controller;
  final String label, hint;
  final TextCapitalization cap;
  final int? maxLength;
  const FormTextRow({
    super.key,
    required this.controller,
    required this.label,
    required this.hint,
    this.cap = TextCapitalization.none,
    this.maxLength,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          TextField(
            controller: controller,
            textCapitalization: cap,
            maxLength: maxLength,
            style: RunqText.body.copyWith(color: t.ink),
            decoration: InputDecoration(
              isDense: true,
              border: InputBorder.none,
              counterText: '',
              contentPadding: const EdgeInsets.symmetric(vertical: 4),
              hintText: hint,
              hintStyle: RunqText.body.copyWith(color: t.muted2),
            ),
          ),
        ],
      ),
    );
  }
}

/// Label above a row of equal-width selectable chips.
class FormChoiceRow extends StatelessWidget {
  final String label;
  final List<(String value, String text)> options;
  final String selected;
  final ValueChanged<String>? onChanged;
  const FormChoiceRow({
    super.key,
    required this.label,
    required this.options,
    required this.selected,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 8),
          Row(
            children: [
              for (var i = 0; i < options.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: _Choice(
                    text: options[i].$2,
                    on: options[i].$1 == selected,
                    onTap: onChanged == null ? null : () => onChanged!(options[i].$1),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  final String text;
  final bool on;
  final VoidCallback? onTap;
  const _Choice({required this.text, required this.on, this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final fg = on ? (onTap == null ? t.muted : t.brand) : (onTap == null ? t.muted2 : t.ink);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? t.brandSubtle : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: on ? t.brand : t.hairline, width: on ? 1 : 0.8),
        ),
        child: Text(text,
            style: RunqText.caption.copyWith(color: fg, fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

/// Pinned bottom action bar (hairline on top, safe-area padded).
class FormBottomBar extends StatelessWidget {
  final String label;
  final bool busy;
  final VoidCallback onPressed;
  const FormBottomBar({super.key, required this.label, required this.busy, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: FilledButton(
          onPressed: busy ? null : onPressed,
          child: busy
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(label),
        ),
      ),
    );
  }
}
