import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/api_client.dart';
import '../../api/api_config.dart';
import '../../providers/auth_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dob_otp_field.dart';

/// First social login — link the Google/Apple identity to the runq user by
/// phone + DOB (the one-time ownership check; no SMS).
class DobBindScreen extends ConsumerStatefulWidget {
  const DobBindScreen({super.key});
  @override
  ConsumerState<DobBindScreen> createState() => _DobBindScreenState();
}

class _DobBindScreenState extends ConsumerState<DobBindScreen> {
  final _phone = TextEditingController();
  final _dob = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _dob.dispose();
    super.dispose();
  }

  Future<void> _bind() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).bindWithDob(_phone.text, _dob.text);
      if (mounted) context.go('/');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = kDebugMode
          ? "Can't reach the server at ${ApiConfig.baseUrl}. Is the API running and the phone on the same network?"
          : "Can't reach the server. Check your connection and try again.");
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Verify it\'s you')),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(DhenuSpacing.xl),
        children: [
          Text(
            'Enter your registered phone number and date of birth to link this account.',
            style: DhenuText.body.copyWith(color: t.inkSoft),
          ),
          const SizedBox(height: DhenuSpacing.xl),
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(DhenuSpacing.md),
              decoration: BoxDecoration(
                color: t.gradeC.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(DhenuRadii.input),
              ),
              child: Text(_error!, style: DhenuText.body.copyWith(color: t.gradeC)),
            ),
            const SizedBox(height: DhenuSpacing.lg),
          ],
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
            decoration: const InputDecoration(
              labelText: 'Phone number',
              prefixIcon: Icon(DhenuIcons.phone),
            ),
          ),
          const SizedBox(height: DhenuSpacing.lg),
          DobOtpField(controller: _dob),
          const SizedBox(height: DhenuSpacing.xl),
          FilledButton(onPressed: _busy ? null : _bind, child: const Text('Link account')),
          if (_busy) const Padding(
            padding: EdgeInsets.only(top: DhenuSpacing.lg),
            child: Center(child: CircularProgressIndicator()),
          ),
        ],
      ),
    );
  }
}
