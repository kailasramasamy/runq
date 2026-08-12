import 'package:flutter/material.dart';
import '../../api/models.dart';
import '../../api/repos.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'gst_form_kit.dart';

/// Opens GSTN authentication. Returns true once the OTP verifies, false / null
/// if the user backs out. A full route rather than a sheet: it is a two-field
/// form and the on-screen keyboard leaves a sheet no room to lay one out.
Future<bool?> openGstAuth(
  BuildContext context, {
  required String gstin,
  String? username,
}) {
  return Navigator.of(context).push<bool>(
    MaterialPageRoute(
      builder: (_) => GstAuthScreen(gstin: gstin, username: username),
    ),
  );
}

class GstAuthScreen extends StatefulWidget {
  final String gstin;
  final String? username;
  const GstAuthScreen({super.key, required this.gstin, this.username});

  @override
  State<GstAuthScreen> createState() => _GstAuthScreenState();
}

class _GstAuthScreenState extends State<GstAuthScreen> {
  final _otpCtrl = TextEditingController();
  late final TextEditingController _userCtrl =
      TextEditingController(text: widget.username ?? '');
  String? _txn;
  bool _busyRequest = false;
  bool _busyVerify = false;
  String? _info;
  bool _isError = false;
  bool _showForceLogout = false;

  String get _username => _userCtrl.text.trim();
  bool get _hasUser => _username.isNotEmpty;
  bool get _otpSent => _txn != null;

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

  void _say(String message, {bool error = false}) => setState(() {
        _info = message;
        _isError = error;
      });

  Future<void> _request() async {
    if (!_hasUser) {
      _say('Enter your GSTN username to receive an OTP.', error: true);
      return;
    }
    setState(() {
      _busyRequest = true;
      _info = null;
      _isError = false;
    });
    try {
      final GspOtpRequest res = await gstRepo.requestOtp(widget.gstin, _username);
      if (!mounted) return;
      setState(() => _txn = res.txn);
      _say(res.message ?? 'OTP sent to the mobile and email registered '
          'against this GSTIN.');
    } catch (e) {
      if (!mounted) return;
      final msg = friendlyGstError(e, "Couldn't request an OTP. Please retry.");
      _say(msg, error: true);
      // GSTN caps concurrent sessions — offer the reset when it complains.
      setState(() => _showForceLogout = msg.toLowerCase().contains('session'));
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
      _say('Cleared the stuck session. Requesting a fresh OTP…');
      setState(() => _showForceLogout = false);
      await _request();
    } catch (e) {
      if (!mounted) return;
      _say(friendlyGstError(e, 'Could not clear the session.'), error: true);
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
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        backgroundColor: t.bgWarm,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
        ),
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('GST Portal', style: RunqText.caption.copyWith(color: t.muted)),
            Text('Authenticate', style: RunqText.h3.copyWith(color: t.ink)),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          _GstinCard(gstin: widget.gstin),
          const SizedBox(height: 20),
          _label(t, 'GSTN username'),
          const SizedBox(height: 6),
          TextField(
            controller: _userCtrl,
            enabled: !_busyVerify && !_otpSent,
            autofocus: !_hasUser,
            textCapitalization: TextCapitalization.none,
            textInputAction: TextInputAction.done,
            decoration: gstFieldDecoration(t, hint: 'e.g. vrindavan_gst'),
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _request(),
          ),
          if (_otpSent) ...[
            const SizedBox(height: 20),
            _label(t, 'One-time password'),
            const SizedBox(height: 6),
            GstCodeField(
              controller: _otpCtrl,
              hint: '••••••',
              onSubmit: _verify,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: _busyRequest ? null : _request,
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                child: Text("Didn't get it? Resend OTP",
                    style: RunqText.caption.copyWith(color: RunqColors.indigo)),
              ),
            ),
          ],
          if (_info != null) ...[
            const SizedBox(height: 16),
            GstInfoLine(message: _info!, isError: _isError),
          ],
          if (_showForceLogout) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _busyRequest ? null : _forceLogout,
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: t.hairline),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                ),
              ),
              child: Text('Clear stuck session',
                  style: RunqText.body.copyWith(color: RunqColors.redInk)),
            ),
          ],
        ],
      ),
      bottomNavigationBar: GstActionBar(
        label: _otpSent ? 'Verify & continue' : 'Send OTP',
        busy: _otpSent ? _busyVerify : _busyRequest,
        onPressed: _otpSent
            ? (_otpCtrl.text.trim().length >= 4 ? _verify : null)
            : (_hasUser ? _request : null),
      ),
    );
  }

  Widget _label(RunqTokens t, String text) =>
      Text(text, style: RunqText.label.copyWith(color: t.muted));
}

/// Read-only reminder of which GSTIN is being authenticated — the screen is
/// reached from a return, so the identity needs to be visible, not implied.
class _GstinCard extends StatelessWidget {
  final String gstin;
  const _GstinCard({required this.gstin});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('GSTIN', style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 4),
          Text(gstin,
              style: RunqText.tabular(size: 16, w: FontWeight.w700, color: t.ink)),
          const SizedBox(height: 8),
          Text(
            'GSTN sends a one-time password to the mobile number and email '
            'registered against this GSTIN. The session it opens is what the '
            'upload and filing steps use.',
            style: RunqText.caption.copyWith(color: t.muted2, height: 1.45),
          ),
        ],
      ),
    );
  }
}
