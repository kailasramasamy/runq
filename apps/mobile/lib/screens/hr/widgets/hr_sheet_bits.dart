// Small presentational pieces shared by the HR bottom sheets — the drag
// grabber, the muted "here's what's already recorded" note, and the
// standard text field. No state, no callbacks beyond the controller.

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';

class HrSheetGrabber extends StatelessWidget {
  const HrSheetGrabber({super.key});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Center(
      child: Container(
        width: 38,
        height: 4,
        decoration: BoxDecoration(
          color: t.hairline,
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }
}

/// Muted inline note carrying prior context — e.g. the punch times a mark
/// is about to overwrite. Renders nothing when [text] is null or blank, so
/// callers can pass it unconditionally.
class HrSheetNote extends StatelessWidget {
  final String? text;
  final IconData icon;
  const HrSheetNote({super.key, required this.text, this.icon = Icons.history});

  @override
  Widget build(BuildContext context) {
    final value = text?.trim() ?? '';
    if (value.isEmpty) return const SizedBox.shrink();
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(RunqRadii.chip),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: t.muted2),
          const SizedBox(width: 6),
          Expanded(
            child: Text(value, style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ],
      ),
    );
  }
}

/// Failure banner rendered inside the sheet. A snackbar can't be used here
/// — ScaffoldMessenger puts it behind the modal sheet, which is how a
/// rejected mark ended up looking like a dead button.
class HrSheetError extends StatelessWidget {
  final String? message;
  const HrSheetError({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final text = message?.trim() ?? '';
    if (text.isEmpty) return const SizedBox.shrink();
    const danger = Color(0xFFDC2626);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: danger.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: danger.withValues(alpha: 0.35), width: 0.8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 15, color: danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: RunqText.caption.copyWith(color: danger)),
          ),
        ],
      ),
    );
  }
}

class HrSheetTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  const HrSheetTextField({
    super.key,
    required this.controller,
    required this.hint,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(RunqRadii.input),
      borderSide: BorderSide(color: t.hairline, width: 0.5),
    );
    return TextField(
      controller: controller,
      textCapitalization: TextCapitalization.sentences,
      style: RunqText.body.copyWith(color: t.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: RunqText.body.copyWith(color: t.muted2),
        filled: true,
        fillColor: t.inputFill,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: border,
        enabledBorder: border,
      ),
    );
  }
}
