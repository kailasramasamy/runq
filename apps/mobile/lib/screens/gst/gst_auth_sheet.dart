import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../api/repos.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';

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
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Shows the GSTN OTP sheet. Returns true when verification succeeds, false /
/// null when cancelled. The session token is cached server-side; mobile only
/// triggers the round-trip.
Future<bool?> showGstAuthSheet(
  BuildContext context, {
  required String gstin,
  String? username,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => GstSheetShell(
      child: _GstAuthSheet(gstin: gstin, username: username),
    ),
  );
}

class _GstAuthSheet extends StatefulWidget {
  final String gstin;
  final String? username;
  const _GstAuthSheet({required this.gstin, this.username});

  @override
  State<_GstAuthSheet> createState() => _GstAuthSheetState();
}

class _GstAuthSheetState extends State<_GstAuthSheet> {
  final _otpCtrl = TextEditingController();
  late final TextEditingController _userCtrl =
      TextEditingController(text: widget.username ?? '');
  String? _txn;
  bool _busyRequest = false;
  bool _busyVerify = false;
  String? _info;
  bool _showForceLogout = false;

  String get _username => _userCtrl.text.trim();
  bool get _hasUser => _username.isNotEmpty;

  @override
  void initState() {
    super.initState();
    if (widget.username != null && widget.username!.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _request());
    }
  }

  @override
  void dispose() {
    _otpCtrl.dispose();
    _userCtrl.dispose();
    super.dispose();
  }

  Future<void> _request() async {
    if (!_hasUser) {
      setState(() => _info = 'Enter your GSTN username to receive an OTP.');
      return;
    }
    setState(() {
      _busyRequest = true;
      _info = null;
    });
    try {
      final GspOtpRequest res = await gstRepo.requestOtp(widget.gstin, _username);
      if (!mounted) return;
      setState(() {
        _txn = res.txn;
        _info = res.message ?? 'OTP sent to your registered mobile/email';
      });
    } catch (e) {
      if (!mounted) return;
      final msg = friendlyGstError(e, "Couldn't request an OTP. Please retry.");
      setState(() {
        _info = msg;
        // GSTN caps concurrent sessions — offer the reset when it complains.
        _showForceLogout = msg.toLowerCase().contains('session');
      });
    } finally {
      if (mounted) setState(() => _busyRequest = false);
    }
  }

  Future<void> _forceLogout() async {
    if (!_hasUser) return;
    setState(() => _busyRequest = true);
    try {
      await gstRepo.forceLogout(widget.gstin, _username);
      if (!mounted) return;
      setState(() {
        _info = 'Cleared the stuck session. Requesting a fresh OTP…';
        _showForceLogout = false;
      });
      await _request();
    } catch (e) {
      if (!mounted) return;
      setState(() => _info = friendlyGstError(e, 'Could not clear the session.'));
    } finally {
      if (mounted) setState(() => _busyRequest = false);
    }
  }

  Future<void> _verify() async {
    final otp = _otpCtrl.text.trim();
    if (otp.length < 4 || _txn == null) return;
    setState(() => _busyVerify = true);
    try {
      await gstRepo.verifyOtp(
        gstin: widget.gstin,
        username: _username,
        otp: otp,
        txn: _txn!,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      showRunqSnack(context, friendlyGstError(e, 'OTP verification failed.'),
          kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busyVerify = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Authenticate with GST Portal',
            style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 4),
        Text(widget.gstin, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 16),
        TextField(
          controller: _userCtrl,
          enabled: !_busyVerify,
          autofocus: !_hasUser,
          textCapitalization: TextCapitalization.none,
          decoration: _fieldDecoration(t, label: 'GSTN username'),
          onSubmitted: (_) => _request(),
        ),
        const SizedBox(height: 12),
        _CodeField(controller: _otpCtrl, hint: 'OTP', onSubmit: _verify),
        if (_info != null) ...[
          const SizedBox(height: 12),
          Text(_info!, style: RunqText.caption.copyWith(color: t.muted)),
        ],
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _busyRequest ? null : _request,
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: t.hairline),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                  ),
                ),
                child: _busyRequest
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_txn == null ? 'Send OTP' : 'Resend',
                        style: RunqText.body.copyWith(color: t.ink)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: (_busyVerify || _txn == null) ? null : _verify,
                style: FilledButton.styleFrom(
                  backgroundColor: RunqColors.indigo,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                  ),
                ),
                child: _busyVerify
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text('Verify & continue',
                        style: RunqText.bodyStrong.copyWith(color: Colors.white)),
              ),
            ),
          ],
        ),
        if (_showForceLogout) ...[
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: _busyRequest ? null : _forceLogout,
              child: Text('Clear stuck session',
                  style: RunqText.caption.copyWith(color: RunqColors.redInk)),
            ),
          ),
        ],
      ],
    );
  }
}

/// Staged EVC filing sheet: on open it asks GSTN to SMS an EVC to the
/// authorized signatory (via [GstRepo.requestEvc]), then collects the code.
/// Returns the entered EVC to file with, or null if cancelled.
Future<String?> showEvcSheet(BuildContext context, {required String returnId}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => GstSheetShell(child: _EvcSheet(returnId: returnId)),
  );
}

class _EvcSheet extends StatefulWidget {
  final String returnId;
  const _EvcSheet({required this.returnId});

  @override
  State<_EvcSheet> createState() => _EvcSheetState();
}

class _EvcSheetState extends State<_EvcSheet> {
  final _ctrl = TextEditingController();
  bool _sending = false;
  bool _sent = false;
  String? _info;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _sendEvc());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _sendEvc() async {
    setState(() {
      _sending = true;
      _info = null;
    });
    try {
      await gstRepo.requestEvc(widget.returnId);
      if (!mounted) return;
      setState(() {
        _sent = true;
        _info = 'EVC sent to the authorized signatory\'s registered mobile.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _info = friendlyGstError(e, "Couldn't send the EVC. Retry."));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final canFile = _ctrl.text.trim().length >= 6;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('File with EVC', style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 4),
        Text(
          'GSTN sends an Electronic Verification Code by SMS to the authorized '
          'signatory. Enter it to file.',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
        const SizedBox(height: 16),
        _CodeField(
          controller: _ctrl,
          hint: 'EVC',
          onSubmit: () {
            if (canFile) Navigator.of(context).pop(_ctrl.text.trim());
          },
          onChanged: (_) => setState(() {}),
        ),
        if (_info != null) ...[
          const SizedBox(height: 12),
          Text(_info!, style: RunqText.caption.copyWith(color: t.muted)),
        ],
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: canFile
                ? () => Navigator.of(context).pop(_ctrl.text.trim())
                : null,
            style: FilledButton.styleFrom(
              backgroundColor: RunqColors.indigo,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(RunqRadii.smallCard),
              ),
            ),
            child: Text('File return',
                style: RunqText.bodyStrong.copyWith(color: Colors.white)),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            onPressed: _sending ? null : _sendEvc,
            child: Text(_sent ? "Didn't get it? Resend EVC" : 'Send EVC',
                style: RunqText.caption.copyWith(color: t.muted2)),
          ),
        ),
      ],
    );
  }
}

InputDecoration _fieldDecoration(RunqTokens t, {String? label, String? hint}) =>
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

class _CodeField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final VoidCallback onSubmit;
  final ValueChanged<String>? onChanged;
  const _CodeField({
    required this.controller,
    required this.hint,
    required this.onSubmit,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      autofocus: true,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => onSubmit(),
      onChanged: onChanged,
      maxLength: 8,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      style: RunqText.tabular(size: 22, w: FontWeight.w700, color: t.ink)
          .copyWith(letterSpacing: 6),
      decoration: _fieldDecoration(t, hint: hint),
    );
  }
}
