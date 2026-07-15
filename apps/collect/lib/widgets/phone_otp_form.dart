import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api/api_client.dart';
import '../api/api_config.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'otp_field.dart';

typedef PhoneOtpRequest = Future<void> Function(String phone);
typedef PhoneOtpSubmit = Future<void> Function(String phone, String otp);

/// Two-step phone + OTP form: enter a 10-digit number → request a code (MSG91)
/// → enter the 6-digit code → submit. Owns its own busy/error/cooldown state so
/// both the standalone login and the one-time social bind reuse it — each just
/// supplies [onRequestOtp] and [onSubmit] (and handles navigation on success).
class PhoneOtpForm extends StatefulWidget {
  const PhoneOtpForm({
    super.key,
    required this.onRequestOtp,
    required this.onSubmit,
    this.submitLabel,
    this.onBack,
  });

  final PhoneOtpRequest onRequestOtp;
  final PhoneOtpSubmit onSubmit;
  /// Falls back to the localized "Sign in" when unset.
  final String? submitLabel;

  /// Optional secondary action on the phone step (e.g. back to social sign-in).
  final VoidCallback? onBack;

  @override
  State<PhoneOtpForm> createState() => _PhoneOtpFormState();
}

enum _Step { phone, otp }

class _PhoneOtpFormState extends State<PhoneOtpForm> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  _Step _step = _Step.phone;
  bool _busy = false;
  String? _error;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  String get _phoneText => _phone.text.trim();

  /// Run [action], surfacing API and network errors the same way across steps.
  /// Returns true only when it completed without throwing.
  Future<bool> _run(Future<void> Function() action) async {
    final l = AppLocalizations.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.message);
      return false;
    } catch (_) {
      setState(() => _error = kDebugMode
          ? l.authOtpNetworkErrorDebug(ApiConfig.baseUrl)
          : l.authOtpNetworkErrorProd);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendOtp() async {
    if (_phoneText.length < 10) {
      setState(() => _error = AppLocalizations.of(context).authOtpEnterDigits);
      return;
    }
    if (await _run(() => widget.onRequestOtp(_phoneText))) {
      setState(() => _step = _Step.otp);
      _startCooldown();
    }
  }

  Future<void> _resend() async {
    if (_resendIn > 0) return;
    if (await _run(() => widget.onRequestOtp(_phoneText))) _startCooldown();
  }

  Future<void> _submit() async {
    if (_otp.text.length < 6) {
      setState(() => _error = AppLocalizations.of(context).authOtpEnterCode);
      return;
    }
    await _run(() => widget.onSubmit(_phoneText, _otp.text));
  }

  void _changeNumber() {
    _timer?.cancel();
    _otp.clear();
    setState(() {
      _step = _Step.phone;
      _error = null;
      _resendIn = 0;
    });
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _resendIn = 45);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _resendIn--);
      if (_resendIn <= 0) timer.cancel();
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) _errorBox(t),
        if (_step == _Step.phone) ..._phoneStep(t) else ..._otpStep(t),
        if (_busy) const Padding(
          padding: EdgeInsets.only(top: DhenuSpacing.lg),
          child: Center(child: CircularProgressIndicator()),
        ),
      ],
    );
  }

  Widget _errorBox(DhenuTokens t) => Container(
        margin: const EdgeInsets.only(bottom: DhenuSpacing.lg),
        padding: const EdgeInsets.all(DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.gradeC.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Text(_error!, style: DhenuText.body.copyWith(color: t.gradeC)),
      );

  List<Widget> _phoneStep(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    return [
      TextField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        autofillHints: const [AutofillHints.telephoneNumberNational],
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
        decoration: InputDecoration(
          labelText: l.authOtpPhoneLabel,
          hintText: l.authOtpPhoneHint,
          prefixIcon: const Icon(DhenuIcons.phone),
        ),
      ),
      const SizedBox(height: DhenuSpacing.lg),
      FilledButton(onPressed: _busy ? null : _sendOtp, child: Text(l.authOtpSendButton)),
      if (widget.onBack != null) ...[
        const SizedBox(height: DhenuSpacing.sm),
        TextButton(
          onPressed: _busy ? null : widget.onBack,
          child: Text(l.commonBack, style: DhenuText.label.copyWith(color: t.inkSoft)),
        ),
      ],
    ];
  }

  List<Widget> _otpStep(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    return [
      Text(l.authOtpCodeSentTo('+91 $_phoneText'), style: DhenuText.body.copyWith(color: t.ink)),
      const SizedBox(height: DhenuSpacing.lg),
      OtpField(controller: _otp, onCompleted: _busy ? null : _submit, autofocus: true),
      const SizedBox(height: DhenuSpacing.lg),
      FilledButton(onPressed: _busy ? null : _submit, child: Text(widget.submitLabel ?? l.authOtpSignIn)),
      const SizedBox(height: DhenuSpacing.md),
      Text(l.authOtpSmsDelay, style: DhenuText.caption.copyWith(color: t.inkSoft)),
      const SizedBox(height: DhenuSpacing.xs),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          TextButton(
            onPressed: _busy ? null : _changeNumber,
            child: Text(l.authOtpChangeNumber, style: DhenuText.label.copyWith(color: t.inkSoft)),
          ),
          TextButton(
            onPressed: (_busy || _resendIn > 0) ? null : _resend,
            child: Text(
              _resendIn > 0 ? l.authOtpResendIn(_resendIn) : l.authOtpResendButton,
              style: DhenuText.label.copyWith(color: _resendIn > 0 ? t.inkSoft : t.brand),
            ),
          ),
        ],
      ),
    ];
  }
}
