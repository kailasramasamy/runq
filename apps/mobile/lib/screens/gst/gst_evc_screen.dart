import 'package:flutter/material.dart';
import '../../api/repos.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'gst_form_kit.dart';

/// Collects the Electronic Verification Code that files the return. Returns the
/// entered EVC, or null if the user backs out. A full route rather than a
/// sheet: the numeric keypad leaves a sheet no room, and this is the last,
/// irreversible step — it deserves the space to say so.
Future<String?> openGstEvc(BuildContext context, {required String returnId}) {
  return Navigator.of(context).push<String>(
    MaterialPageRoute(builder: (_) => GstEvcScreen(returnId: returnId)),
  );
}

class GstEvcScreen extends StatefulWidget {
  final String returnId;
  const GstEvcScreen({super.key, required this.returnId});

  @override
  State<GstEvcScreen> createState() => _GstEvcScreenState();
}

class _GstEvcScreenState extends State<GstEvcScreen> {
  final _ctrl = TextEditingController();
  bool _sending = false;
  bool _sent = false;
  String? _info;
  bool _isError = false;

  bool get _canFile => _ctrl.text.trim().length >= 6;

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
      _isError = false;
    });
    try {
      await gstRepo.requestEvc(widget.returnId);
      if (!mounted) return;
      setState(() {
        _sent = true;
        _info = 'Code sent by SMS to the authorised signatory’s registered '
            'mobile number.';
        _isError = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _info = friendlyGstError(e, "Couldn't send the EVC. Retry.");
        _isError = true;
      });
    } finally {
      if (mounted) setState(() => _sending = false);
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
            Text('File return', style: RunqText.h3.copyWith(color: t.ink)),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          const _FinalStepNotice(),
          const SizedBox(height: 20),
          Text('Verification code',
              style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 6),
          GstCodeField(
            controller: _ctrl,
            hint: 'e.g. EA1094',
            alphanumeric: true,
            onSubmit: () {
              if (_canFile) Navigator.of(context).pop(_ctrl.text.trim());
            },
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _sending ? null : _sendEvc,
              style: TextButton.styleFrom(padding: EdgeInsets.zero),
              child: Text(_sent ? "Didn't get it? Resend EVC" : 'Send EVC',
                  style: RunqText.caption.copyWith(color: RunqColors.indigo)),
            ),
          ),
          if (_info != null) ...[
            const SizedBox(height: 16),
            GstInfoLine(message: _info!, isError: _isError),
          ],
        ],
      ),
      bottomNavigationBar: GstActionBar(
        label: 'File return',
        busy: _sending,
        onPressed:
            _canFile ? () => Navigator.of(context).pop(_ctrl.text.trim()) : null,
      ),
    );
  }
}

/// Filing is irreversible — it locks the period and issues an ARN. The sheet
/// this replaced gave that no more weight than a form hint.
class _FinalStepNotice extends StatelessWidget {
  const _FinalStepNotice();

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
          Row(
            children: [
              Icon(Icons.lock_outline_rounded, size: 16, color: t.ink),
              const SizedBox(width: 8),
              Text('Final step',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'GSTN texts an Electronic Verification Code to the authorised '
            'signatory. Entering it files the return and issues an ARN — the '
            'period is locked after this, and changes need an amendment in a '
            'later return.',
            style: RunqText.caption.copyWith(color: t.muted2, height: 1.45),
          ),
        ],
      ),
    );
  }
}
