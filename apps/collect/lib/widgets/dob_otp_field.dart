import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// OTP-style 6-box input for the 6-digit login code. Backed by the supplied
/// [controller] (a hidden field captures keystrokes; the boxes render the
/// value).
///
/// By default it presents the code as a date of birth (cake icon, `DD MM YY`
/// hints) — used for the one-time account-binding ownership check. Pass
/// [label], [icon] and `dateHints: false` to present the same 6 digits as a
/// neutral "secret code" (e.g. on the phone login screen), with no DOB framing.
class DobOtpField extends StatefulWidget {
  const DobOtpField({
    super.key,
    required this.controller,
    this.onCompleted,
    this.label = 'Date of birth',
    this.icon = DhenuIcons.cake,
    this.dateHints = true,
  });
  final TextEditingController controller;
  final VoidCallback? onCompleted;
  final String label;
  final IconData icon;

  /// When true, show `DD MM YY` framing; when false, render neutral code dots.
  final bool dateHints;

  @override
  State<DobOtpField> createState() => _DobOtpFieldState();
}

class _DobOtpFieldState extends State<DobOtpField> {
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
        const Spacer(),
        if (widget.dateHints)
          Text('DD  MM  YY',
              style: DhenuText.caption.copyWith(color: t.inkSoft.withValues(alpha: 0.55), letterSpacing: 1.5)),
      ]),
      const SizedBox(height: DhenuSpacing.sm),
      GestureDetector(
        onTap: () => _focus.requestFocus(),
        behavior: HitTestBehavior.opaque,
        child: Stack(children: [
          Row(children: [
            for (var i = 0; i < 6; i++) ...[
              _box(t, i, text),
              if (i == 1 || i == 3)
                const SizedBox(width: DhenuSpacing.md)
              else if (i < 5)
                const SizedBox(width: DhenuSpacing.sm),
            ],
          ]),
          // Transparent field that actually captures input — sized to the boxes.
          Positioned.fill(
            child: Opacity(
              opacity: 0,
              child: TextField(
                controller: widget.controller,
                focusNode: _focus,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                showCursor: false,
                decoration: const InputDecoration(border: InputBorder.none, counterText: ''),
              ),
            ),
          ),
        ]),
      ),
    ]);
  }

  Widget _box(DhenuTokens t, int i, String text) {
    final hints = widget.dateHints ? const ['D', 'D', 'M', 'M', 'Y', 'Y'] : const ['•', '•', '•', '•', '•', '•'];
    final filled = i < text.length;
    final active = _focus.hasFocus && i == text.length;
    return Expanded(
      child: Container(
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
          filled ? text[i] : hints[i],
          style: DhenuText.number(size: 20, color: filled ? t.ink : t.inkSoft.withValues(alpha: 0.30)),
        ),
      ),
    );
  }
}
