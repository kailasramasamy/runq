import 'package:flutter/material.dart';
import 'package:dhenu/l10n/app_localizations.dart';
import '../services/voice_input_service.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'sheet_grabber.dart';

/// Full voice-capture experience: opens listening immediately, shows a big mic
/// that grows with your voice, the words as they're recognised, and an explicit
/// Done button. Returns the captured text (or null if cancelled).
Future<String?> showVoiceCaptureSheet(
  BuildContext context, {
  required String localeId,
  required String title,
}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _VoiceCaptureSheet(localeId: localeId, title: title),
  );
}

class _VoiceCaptureSheet extends StatefulWidget {
  const _VoiceCaptureSheet({required this.localeId, required this.title});
  final String localeId;
  final String title;

  @override
  State<_VoiceCaptureSheet> createState() => _VoiceCaptureSheetState();
}

class _VoiceCaptureSheetState extends State<_VoiceCaptureSheet> {
  String _committed = ''; // finalised segments (iOS re-segments on pauses)
  String _partial = ''; // the segment currently being recognised
  double _level = 0; // mic sound level, ~0..10
  bool _listening = false;

  String get _text => '$_committed $_partial'.trim();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    VoiceInputService.instance.stop();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() => _listening = true);
    await VoiceInputService.instance.listen(
      localeId: widget.localeId,
      onResult: (words, isFinal) {
        if (!mounted) return;
        setState(() {
          if (isFinal) {
            _committed = '$_committed $words'.trim();
            _partial = '';
          } else {
            _partial = words;
          }
        });
      },
      onSoundLevel: (lvl) {
        if (mounted) setState(() => _level = lvl);
      },
      onStatus: (s) {
        if (mounted && (s == 'notListening' || s == 'done' || s == 'error')) {
          setState(() {
            _listening = false;
            _level = 0;
          });
        }
      },
    );
  }

  Future<void> _stop() async {
    await VoiceInputService.instance.stop();
    if (mounted) setState(() => _listening = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final scale = 1 + (_level.clamp(0, 10) / 10) * 0.6; // grow ring with voice
    final status = _listening
        ? l.voiceSpeakNow
        : (_text.isEmpty ? l.voiceNoSpeech : l.voiceListening);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const SheetGrabber(),
            Text(widget.title, style: DhenuText.title.copyWith(color: t.ink)),
            const SizedBox(height: DhenuSpacing.xl),
            // Big tap-to-toggle mic; the ring grows while it hears your voice.
            GestureDetector(
              onTap: _listening ? _stop : _start,
              child: AnimatedScale(
                scale: _listening ? scale : 1,
                duration: const Duration(milliseconds: 150),
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _listening ? t.brand : t.brandSubtle,
                  ),
                  child: Icon(_listening ? Icons.mic : Icons.mic_none,
                      size: 44, color: _listening ? Colors.white : t.brand),
                ),
              ),
            ),
            const SizedBox(height: DhenuSpacing.lg),
            Text(status,
                textAlign: TextAlign.center,
                style: DhenuText.label.copyWith(color: t.inkSoft)),
            const SizedBox(height: DhenuSpacing.sm),
            // Live transcript — confirms recognition is working as they speak.
            Text(
              _text.isEmpty ? l.voiceTapToSpeak : _text,
              textAlign: TextAlign.center,
              style: DhenuText.h2.copyWith(
                  color: _text.isEmpty ? t.inkSoft : t.ink),
            ),
            const SizedBox(height: DhenuSpacing.xl),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(l.commonCancel),
                ),
              ),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(
                child: FilledButton(
                  onPressed: _text.trim().isEmpty
                      ? null
                      : () => Navigator.pop(context, _text.trim()),
                  child: Text(l.voiceDone),
                ),
              ),
            ]),
            const SizedBox(height: DhenuSpacing.sm),
            // Diagnostic: which locale the recognizer actually used.
            Text('🎙 ${VoiceInputService.instance.resolvedLocale ?? '—'}',
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ),
      ),
    );
  }
}
