import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import '../api/mp_repo.dart';
import '../services/tts_service.dart';
import '../services/voice_input_service.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'sheet_grabber.dart';
import 'voice_capture_sheet.dart';

/// A TextField with mic (dictate) + speaker (read-back) suffix icons.
///
/// Mic: opens a full voice-capture sheet (big animated mic, live transcript,
/// explicit Done) in the current app locale. Recognised text fills [controller].
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
    this.transliterateToAppScript = false,
  });

  final TextEditingController controller;
  final String labelText;
  final String? hintText;
  final TextCapitalization textCapitalization;
  final int maxLines;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onResult;

  /// When the speech engine falls back to a different script than the app's
  /// language (e.g. iOS has no Tamil STT → en-IN), transliterate the captured
  /// Latin text into the app's script before filling. Off for fields that want
  /// the Latin form (e.g. the English full-name field).
  final bool transliterateToAppScript;

  @override
  State<VoiceField> createState() => _VoiceFieldState();
}

class _VoiceFieldState extends State<VoiceField> {
  bool _busy = false;

  String get _localeId =>
      VoiceInputService.localeId(Localizations.localeOf(context).languageCode);

  Future<void> _startVoice() async {
    if (_busy) return;
    setState(() => _busy = true);
    // Lazy init — this is where iOS/Android prompt for the mic permission.
    final ok = await VoiceInputService.instance.init();
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      await _showMicPermissionSheet();
      return;
    }
    final text = await showVoiceCaptureSheet(
      context,
      localeId: _localeId,
      title: widget.labelText,
    );
    if (!mounted || text == null || text.isEmpty) return;
    final out = await _toAppScript(text);
    if (!mounted) return;
    widget.controller.text = out;
    widget.controller.selection = TextSelection.collapsed(offset: out.length);
    widget.onChanged?.call(out);
    widget.onResult?.call(out);
  }

  /// If the engine transcribed in a different script than the app language
  /// (Latin fallback for Tamil/Kannada), convert it to the app's script.
  Future<String> _toAppScript(String text) async {
    final appLang = Localizations.localeOf(context).languageCode;
    final sttLang = (VoiceInputService.instance.resolvedLocale ?? '')
        .split(RegExp('[-_]'))
        .first
        .toLowerCase();
    if (!widget.transliterateToAppScript || appLang == 'en' || sttLang == appLang) {
      return text;
    }
    setState(() => _busy = true);
    final t = await mpRepo.transliterateName(text, appLang);
    if (mounted) setState(() => _busy = false);
    return (t != null && t.trim().isNotEmpty) ? t.trim() : text;
  }

  /// Shown when the mic is unavailable (usually denied permission): explains
  /// what's needed and deep-links to the app's Settings page.
  Future<void> _showMicPermissionSheet() {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius:
              const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
        ),
        child: SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const SheetGrabber(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Icon(Icons.mic_none, color: t.brand),
                  const SizedBox(width: DhenuSpacing.sm),
                  Expanded(
                    child: Text(l.voiceMicNeededTitle,
                        style: DhenuText.title.copyWith(color: t.ink)),
                  ),
                ]),
                const SizedBox(height: DhenuSpacing.sm),
                Text(l.voiceMicNeededBody,
                    style: DhenuText.body.copyWith(color: t.inkSoft)),
                const SizedBox(height: DhenuSpacing.lg),
                Row(children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: Text(l.commonCancel),
                    ),
                  ),
                  const SizedBox(width: DhenuSpacing.md),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.pop(ctx);
                        openAppSettings();
                      },
                      icon: const Icon(Icons.settings_outlined, size: 18),
                      label: Text(l.voiceOpenSettings),
                    ),
                  ),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
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
            IconButton(
              icon: _busy
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: t.brand))
                  : Icon(Icons.mic_none, color: t.brand),
              onPressed: _busy ? null : _startVoice,
              tooltip: 'Dictate',
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
