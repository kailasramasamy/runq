import 'package:flutter/material.dart';
import '../services/tts_service.dart';
import '../services/voice_input_service.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_toast.dart';

/// A TextField with mic (dictate) + speaker (read-back) suffix icons.
///
/// Mic: lazily initialises STT (asking mic permission on first tap), then
/// dictates in the current app locale (ta-IN etc.) — recognised text streams
/// into [controller]. While listening the mic pulses in the brand colour.
///
/// Speaker: reads [controller.text] back via TtsService for non-reading VMCC
/// operators to confirm what was captured.
class VoiceField extends StatefulWidget {
  const VoiceField({
    super.key,
    required this.controller,
    required this.labelText,
    this.hintText,
    this.textCapitalization = TextCapitalization.sentences,
    this.maxLines = 1,
    this.textInputAction = TextInputAction.next,
    this.onChanged,
    this.onResult,
  });

  final TextEditingController controller;
  final String labelText;
  final String? hintText;
  final TextCapitalization textCapitalization;
  final int maxLines;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onResult;

  @override
  State<VoiceField> createState() => _VoiceFieldState();
}

class _VoiceFieldState extends State<VoiceField>
    with SingleTickerProviderStateMixin {
  bool _listening = false;
  bool _busy = false;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  String get _localeId =>
      VoiceInputService.localeId(Localizations.localeOf(context).languageCode);

  Future<void> _toggleMic() async {
    if (_busy) return;
    if (_listening) {
      await VoiceInputService.instance.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }
    setState(() => _busy = true);
    // Lazy init — this is where iOS/Android prompt for the mic permission.
    final ok = await VoiceInputService.instance.init();
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      showDhenuToast(context,
          'Microphone unavailable — enable mic & speech permission in Settings',
          type: DhenuToastType.info);
      return;
    }
    await VoiceInputService.instance.listen(
      localeId: _localeId,
      onResult: (text) {
        if (!mounted) return;
        widget.controller.text = text;
        widget.controller.selection =
            TextSelection.collapsed(offset: text.length);
        widget.onChanged?.call(text);
        widget.onResult?.call(text);
      },
      onStatus: (s) {
        if (mounted && (s == 'notListening' || s == 'done')) {
          setState(() => _listening = false);
        }
      },
    );
    if (mounted) setState(() => _listening = true);
  }

  Future<void> _speak() async {
    final text = widget.controller.text.trim();
    if (text.isEmpty) return;
    TtsService.instance.setLocale(_localeId);
    await TtsService.instance.speak(text);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return TextField(
      controller: widget.controller,
      textCapitalization: widget.textCapitalization,
      maxLines: widget.maxLines,
      textInputAction: widget.textInputAction,
      onChanged: widget.onChanged,
      decoration: InputDecoration(
        labelText: widget.labelText,
        hintText: widget.hintText,
        suffixIcon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedBuilder(
              animation: _pulse,
              builder: (ctx, child) => IconButton(
                icon: Icon(
                  _listening ? Icons.mic : Icons.mic_none,
                  color: _listening
                      ? Color.lerp(t.brand, t.brandPressed, _pulse.value)
                      : t.inkSoft,
                ),
                onPressed: _toggleMic,
                tooltip: _listening ? 'Stop dictation' : 'Dictate',
              ),
            ),
            IconButton(
              icon: Icon(Icons.volume_up_outlined, color: t.inkSoft),
              onPressed: _speak,
              tooltip: 'Read back',
            ),
          ],
        ),
      ),
    );
  }
}
