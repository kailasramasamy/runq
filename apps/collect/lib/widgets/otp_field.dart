import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// OTP-style 6-box input for the 6-digit login code. Backed by the supplied
/// [controller] (a hidden field captures keystrokes; the boxes render the
/// value). Fires [onCompleted] once all six digits are entered.
class OtpField extends StatefulWidget {
  const OtpField({
    super.key,
    required this.controller,
    this.onCompleted,
    this.label = 'Enter OTP',
    this.icon = DhenuIcons.lock,
  });
  final TextEditingController controller;
  final VoidCallback? onCompleted;
  final String label;
  final IconData icon;

  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChange);
    _focus.addListener(_onFocus);
  }

  void _onChange() {
    setState(() {});
    if (widget.controller.text.length == 6) widget.onCompleted?.call();
  }

  void _onFocus() => setState(() {});

  /// Tapping a cell moves the cursor there (so that cell highlights) and opens
  /// the keypad. Clamped to one past the last typed digit.
  void _selectCell(int i) {
    final pos = i.clamp(0, widget.controller.text.length);
    widget.controller.selection = TextSelection.collapsed(offset: pos);
    _focus.requestFocus();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChange);
    _focus.removeListener(_onFocus);
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final text = widget.controller.text;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(widget.icon, size: 16, color: t.inkSoft),
        const SizedBox(width: DhenuSpacing.xs),
        Text(widget.label, style: DhenuText.label.copyWith(color: t.inkSoft)),
      ]),
      const SizedBox(height: DhenuSpacing.sm),
      Stack(children: [
        // Transparent field that actually captures input — sits behind the
        // boxes so per-box taps win; keyboard focus is driven programmatically.
        Positioned.fill(
          child: Opacity(
            opacity: 0,
            child: TextField(
              controller: widget.controller,
              focusNode: _focus,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              showCursor: false,
              decoration: const InputDecoration(border: InputBorder.none, counterText: ''),
            ),
          ),
        ),
        Row(children: [
          for (var i = 0; i < 6; i++) ...[
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _selectCell(i),
                child: _box(t, i, text),
              ),
            ),
            if (i < 5) const SizedBox(width: DhenuSpacing.sm),
          ],
        ]),
      ]),
    ]);
  }

  Widget _box(DhenuTokens t, int i, String text) {
    final filled = i < text.length;
    // Highlight the cell at the cursor: the next empty cell while typing, or the
    // specific cell the user tapped.
    final cursor = widget.controller.selection.baseOffset;
    final activeIndex = cursor < 0 ? text.length : cursor.clamp(0, 5);
    final active = _focus.hasFocus && i == activeIndex;
    return Container(
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        border: Border.all(
          color: active ? t.brand : (filled ? t.brand.withValues(alpha: 0.35) : t.hairline),
          width: active ? 2 : 1,
        ),
      ),
      child: Text(
        filled ? text[i] : '•',
        style: DhenuText.number(size: 20, color: filled ? t.ink : t.inkSoft.withValues(alpha: 0.30)),
      ),
    );
  }
}
