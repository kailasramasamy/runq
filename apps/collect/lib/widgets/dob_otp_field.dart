import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// OTP-style 6-box input for the DDMMYY date-of-birth login code. Backed by the
/// supplied [controller] (a hidden field captures keystrokes; the boxes render
/// the value). Grouped as DD · MM · YY with a subtle hint.
class DobOtpField extends StatefulWidget {
  const DobOtpField({super.key, required this.controller, this.onCompleted});
  final TextEditingController controller;
  final VoidCallback? onCompleted;

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
        Icon(DhenuIcons.cake, size: 16, color: t.inkSoft),
        const SizedBox(width: DhenuSpacing.xs),
        Text('Date of birth', style: DhenuText.label.copyWith(color: t.inkSoft)),
        const Spacer(),
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
    const hints = ['D', 'D', 'M', 'M', 'Y', 'Y'];
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
