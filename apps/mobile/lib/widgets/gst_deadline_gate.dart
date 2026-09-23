// App-wide GST filing deadline prompt.
//
// Mounted once above the router (next to AppUpdateGate) so the dialog
// survives navigation — GST returns get filed from this app, so the deadline
// has to reach whoever opens it, not only whoever visits the dashboard.
//
// Deliberately not a dialog on every launch. The server decides the tier
// (`alertTierFor`): nothing until T-5, a card on the dashboard from T-5, and
// this dialog only in the last two days and while overdue — once a day. A
// prompt that fires for two weeks straight gets dismissed unread.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/auth_provider.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'runq_snack.dart';

/// Where a deadline alert should take you.
String gstAlertRoute(GstDeadlineAlert a) =>
    a.returnId == null ? '/gst/returns' : '/gst/returns/${a.returnId}';

/// Severity colours for an alert, dark-mode aware.
({Color bg, Color ink}) gstAlertColors(BuildContext context, GstDeadlineAlert a) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  if (a.daysLeft <= 0) {
    return (
      bg: isDark ? const Color(0xFF3A1414) : RunqColors.redBg,
      ink: isDark ? const Color(0xFFF87171) : RunqColors.redInk,
    );
  }
  return (
    bg: isDark ? const Color(0xFF3A2410) : RunqColors.amberBg,
    ink: isDark ? const Color(0xFFFBBF24) : RunqColors.amberInk,
  );
}

String _today() => DateTime.now().toIso8601String().substring(0, 10);

class GstDeadlineGate extends ConsumerStatefulWidget {
  final Widget child;
  const GstDeadlineGate({super.key, required this.child});

  @override
  ConsumerState<GstDeadlineGate> createState() => _GstDeadlineGateState();
}

class _GstDeadlineGateState extends ConsumerState<GstDeadlineGate> {
  String? _shownFor;

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<GstDeadlineAlert?>>(gstDeadlineAlertProvider, (_, next) {
      next.whenData((alert) {
        if (alert == null || alert.tier == GstAlertTier.strip) return;
        if (_shownFor == alert.snoozeKey) return;
        _shownFor = alert.snoozeKey;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _maybeShow(alert);
        });
      });
    });
    return widget.child;
  }

  Future<void> _maybeShow(GstDeadlineAlert alert) async {
    final key = await _prefsKey(alert);
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(key) == _today()) return; // snoozed earlier today
    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _GstDeadlineDialog(
        alert: alert,
        onSnooze: () => prefs.setString(key, _today()),
      ),
    );
  }

  Future<String> _prefsKey(GstDeadlineAlert alert) async {
    final userId = ref.read(authProvider).user?.id ?? 'anon';
    return '$userId:${alert.snoozeKey}';
  }
}

class _GstDeadlineDialog extends ConsumerStatefulWidget {
  final GstDeadlineAlert alert;
  final VoidCallback onSnooze;
  const _GstDeadlineDialog({required this.alert, required this.onSnooze});

  @override
  ConsumerState<_GstDeadlineDialog> createState() => _GstDeadlineDialogState();
}

class _GstDeadlineDialogState extends ConsumerState<_GstDeadlineDialog> {
  bool _declaringFiled = false;

  static const _statusLine = <String, String>{
    'pending': 'No draft has been generated yet.',
    'draft': 'runQ has a draft ready for you to review.',
    'validated': 'The draft passed pre-flight checks and is ready to upload.',
    'uploaded': 'Uploaded to GSTN — it still needs to be filed with an EVC.',
    'error': 'The last attempt failed. Open the return to see what went wrong.',
  };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final a = widget.alert;
    final tone = gstAlertColors(context, a);

    return AlertDialog(
      title: Row(
        children: [
          Icon(a.isOverdue ? Icons.error_outline : Icons.event_busy,
              size: 20, color: tone.ink),
          const SizedBox(width: 8),
          Expanded(child: Text('${a.returnLabel} · ${a.periodLabel}',
              style: RunqText.h4.copyWith(color: t.ink))),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${a.returnLabel} for ${a.periodLabel} ${a.urgencyPhrase}.',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 8),
          Text(_statusLine[a.status] ?? _statusLine['pending']!,
              style: RunqText.caption.copyWith(color: t.muted)),
          if (a.isOverdue && a.lateFeeEstimate > 0) ...[
            const SizedBox(height: 4),
            Text('Late fee so far is about ₹${a.lateFeeEstimate}.',
                style: RunqText.caption.copyWith(color: tone.ink)),
          ],
          if (_declaringFiled) ...[
            const SizedBox(height: 14),
            _FiledOnPortalPanel(
              alert: a,
              onCancel: () => setState(() => _declaringFiled = false),
              onDone: () => Navigator.of(context).pop(),
            ),
          ],
        ],
      ),
      actions: _declaringFiled ? null : _actions(context),
    );
  }

  List<Widget> _actions(BuildContext context) => [
        TextButton(
          onPressed: () => setState(() => _declaringFiled = true),
          child: const Text('I filed on the portal'),
        ),
        TextButton(
          onPressed: () {
            widget.onSnooze();
            Navigator.of(context).pop();
          },
          child: const Text('Later'),
        ),
        FilledButton(
          onPressed: () {
            Navigator.of(context).pop();
            context.push(gstAlertRoute(widget.alert));
          },
          child: Text('Review ${widget.alert.returnLabel}'),
        ),
      ];
}

/// The escape hatch: without it the prompt escalates forever against a return
/// that was already filed on gst.gov.in.
class _FiledOnPortalPanel extends ConsumerStatefulWidget {
  final GstDeadlineAlert alert;
  final VoidCallback onCancel, onDone;
  const _FiledOnPortalPanel({
    required this.alert,
    required this.onCancel,
    required this.onDone,
  });

  @override
  ConsumerState<_FiledOnPortalPanel> createState() => _FiledOnPortalPanelState();
}

class _FiledOnPortalPanelState extends ConsumerState<_FiledOnPortalPanel> {
  final _arn = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _arn.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      await gstRepo.markFiledExternally(
        returnType: widget.alert.returnType,
        period: widget.alert.period,
        arn: _arn.text.trim(),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      RunqSnack.error(context, e.message);
      return;
    }
    if (!mounted) return;
    ref.invalidate(gstDeadlineAlertProvider);
    ref.invalidate(gstReturnsProvider);
    RunqSnack.success(context, '${widget.alert.returnLabel} marked as filed.');
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Marks it filed in runQ and stops the reminders. Add the ARN if you have it.',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _arn,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'ARN (optional)'),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              onPressed: _saving ? null : widget.onCancel,
              child: const Text('Cancel'),
            ),
            const SizedBox(width: 4),
            FilledButton(
              onPressed: _saving ? null : _submit,
              child: Text(_saving ? 'Saving…' : 'Mark as filed'),
            ),
          ],
        ),
      ],
    );
  }
}
