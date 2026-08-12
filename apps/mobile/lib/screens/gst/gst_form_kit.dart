import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../api/api_client.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

/// Friendly-ifies an API/GSP error for display. Keeps the server message when
/// it's an [ApiException] (those are user-facing), otherwise a generic line.
String friendlyGstError(Object e, String fallback) =>
    e is ApiException ? e.message : fallback;

/// Standard app bottom-sheet chrome: transparent barrier + surface container
/// with the app's top radius, hairline border, sheet shadow, grab handle, and
/// keyboard-inset padding. Matches the pattern used across the app.
class GstSheetShell extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const GstSheetShell({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(20, 12, 20, 20),
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius:
              const BorderRadius.vertical(top: Radius.circular(RunqRadii.hero)),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.sheet,
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: padding,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: t.hairline,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                // Flexible, not a bare child: a Flex lays non-flex children out
                // with an unbounded main axis, so a child that sizes itself from
                // a list (the GSTR-1 section sheets) would grow to its full
                // content height and overflow the sheet. Loose fit keeps short
                // sheets — OTP, EVC — at their natural height.
                Flexible(child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

InputDecoration gstFieldDecoration(RunqTokens t, {String? label, String? hint}) =>
    InputDecoration(
      labelText: label,
      hintText: hint,
      counterText: '',
      filled: true,
      fillColor: t.inputFill,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );

/// Uppercases as you type, so an EVC keyed in lower case still matches the
/// code GSTN issued.
class _UpperCaseFormatter extends TextInputFormatter {
  const _UpperCaseFormatter();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue _, TextEditingValue next) =>
      next.copyWith(text: next.text.toUpperCase());
}

/// Single-code entry for GSTN's two verification codes. They are not the same
/// shape: the login OTP is six digits, but a filing EVC is alphanumeric
/// (e.g. `EA1094`). A digits-only field cannot accept one, and iOS strips the
/// letters out of SMS autofill when the keyboard is numeric — so the caller
/// must say which kind it wants.
class GstCodeField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final VoidCallback onSubmit;
  final ValueChanged<String>? onChanged;

  /// True for a filing EVC, false for a numeric login OTP.
  final bool alphanumeric;

  const GstCodeField({
    super.key,
    required this.controller,
    required this.hint,
    required this.onSubmit,
    this.onChanged,
    this.alphanumeric = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      keyboardType:
          alphanumeric ? TextInputType.text : TextInputType.number,
      textCapitalization:
          alphanumeric ? TextCapitalization.characters : TextCapitalization.none,
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: const [AutofillHints.oneTimeCode],
      autofocus: true,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => onSubmit(),
      onChanged: onChanged,
      maxLength: 8,
      inputFormatters: alphanumeric
          ? [
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
              const _UpperCaseFormatter(),
            ]
          : [FilteringTextInputFormatter.digitsOnly],
      style: RunqText.tabular(size: 22, w: FontWeight.w700, color: t.ink)
          .copyWith(letterSpacing: 6),
      decoration: gstFieldDecoration(t, hint: hint),
    );
  }
}

class GstInfoLine extends StatelessWidget {
  final String message;
  final bool isError;
  const GstInfoLine({
    super.key,required this.message, required this.isError});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tone = isError ? RunqColors.redInk : t.muted;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(isError ? Icons.error_outline_rounded : Icons.info_outline_rounded,
            size: 16, color: tone),
        const SizedBox(width: 8),
        Expanded(
          child: Text(message,
              style: RunqText.caption.copyWith(color: tone, height: 1.45)),
        ),
      ],
    );
  }
}

/// Primary action pinned to the bottom. `resizeToAvoidBottomInset` only
/// shrinks the Scaffold *body* — a bottomNavigationBar still sits under the
/// keyboard — so lift it by the inset ourselves.
class GstActionBar extends StatelessWidget {
  final String label;
  final bool busy;
  final VoidCallback? onPressed;
  const GstActionBar({
    super.key,required this.label, required this.busy, this.onPressed});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.6)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: busy ? null : onPressed,
              style: FilledButton.styleFrom(
                backgroundColor: RunqColors.indigo,
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                ),
              ),
              child: busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(label,
                      style:
                          RunqText.bodyStrong.copyWith(color: Colors.white)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
