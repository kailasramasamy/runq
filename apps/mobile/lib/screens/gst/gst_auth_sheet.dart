import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../api/models.dart';
import '../../api/repos.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';

/// Shows the GSTN OTP sheet. Returns true when verification succeeds, false / null
/// when cancelled. The session token is cached server-side; mobile only triggers
/// the round-trip.
Future<bool?> showGstAuthSheet(
  BuildContext context, {
  required String gstin,
  String? username,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: RT(context).surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
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

  String get _username => _userCtrl.text.trim();
  bool get _hasUser => _username.isNotEmpty;

  @override
  void initState() {
    super.initState();
    if (widget.username != null && widget.username!.isNotEmpty) {
      // Pre-filled: auto-fire OTP request.
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
      final GspOtpRequest res =
          await gstRepo.requestOtp(widget.gstin, _username);
      if (!mounted) return;
      setState(() {
        _txn = res.txn;
        _info = res.message ?? 'OTP sent to your registered mobile/email';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _info = "Couldn't request OTP: $e");
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
      setState(() => _info = 'Logged out. Requesting fresh OTP…');
      await _request();
    } catch (e) {
      if (!mounted) return;
      setState(() => _info = 'Force-logout failed: $e');
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
      showRunqSnack(context, "Couldn't verify: $e", kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busyVerify = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('GSTN sign-in',
                style: RunqText.h3.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(
              widget.gstin,
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _userCtrl,
              enabled: !_busyVerify,
              autofocus: !_hasUser,
              decoration: InputDecoration(
                labelText: 'GSTN username',
                filled: true,
                fillColor: t.inputFill,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
              onSubmitted: (_) => _request(),
            ),
            const SizedBox(height: 12),
            _OtpField(controller: _otpCtrl, onSubmit: _verify),
            const SizedBox(height: 12),
            if (_info != null)
              Text(_info!,
                  style: RunqText.caption
                      .copyWith(color: t.muted)),
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
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: _busyRequest
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text('Resend',
                            style: RunqText.body
                                .copyWith(color: t.ink)),
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
                        borderRadius: BorderRadius.circular(12),
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
                            style: RunqText.bodyStrong
                                .copyWith(color: Colors.white)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: _busyRequest ? null : _forceLogout,
                child: Text(
                  'Stuck? Force logout & retry',
                  style: RunqText.caption
                      .copyWith(color: t.muted2),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OtpField extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSubmit;
  const _OtpField({required this.controller, required this.onSubmit});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      autofocus: true,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => onSubmit(),
      maxLength: 8,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      style: RunqText.tabular(
        size: 22,
        w: FontWeight.w700,
        color: t.ink,
      ).copyWith(letterSpacing: 6),
      decoration: InputDecoration(
        hintText: 'OTP',
        counterText: '',
        filled: true,
        fillColor: t.inputFill,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}

/// Asks the user for the EVC code and returns it. Null if cancelled.
Future<String?> askForEvc(BuildContext context) {
  final ctrl = TextEditingController();
  final t = RT(context);
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: t.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(ctx).viewInsets.bottom,
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Enter EVC',
                  style: RunqText.h3.copyWith(color: t.ink)),
              const SizedBox(height: 4),
              Text(
                'GSTN will SMS the Electronic Verification Code to the authorized signatory.',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: ctrl,
                keyboardType: TextInputType.number,
                autofocus: true,
                maxLength: 8,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
                style: RunqText.tabular(
                  size: 22,
                  w: FontWeight.w700,
                  color: t.ink,
                ).copyWith(letterSpacing: 6),
                decoration: InputDecoration(
                  hintText: 'EVC',
                  counterText: '',
                  filled: true,
                  fillColor: t.inputFill,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 14),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () =>
                      Navigator.of(ctx).pop(ctrl.text.trim()),
                  style: FilledButton.styleFrom(
                    backgroundColor: RunqColors.indigo,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text('File return',
                      style: RunqText.bodyStrong
                          .copyWith(color: Colors.white)),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
