// Geo-fenced check-in / check-out card. Pulls current GPS via geolocator
// (with permission flow), optionally captures a selfie, and posts to
// /hr/me/punch — the server decides if the punch is inside an active
// fence. Shared by the Time tab and the standalone Check-in screen so
// both punch through the same backend and reflect the same state.

library;

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../../api/hr_phase_next.dart';
import '../../../theme/runq_theme.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';

class HrPunchCard extends ConsumerStatefulWidget {
  const HrPunchCard({super.key});
  @override
  ConsumerState<HrPunchCard> createState() => _HrPunchCardState();
}

class _HrPunchCardState extends ConsumerState<HrPunchCard> {
  bool _busy = false;
  String? _selfiePath;

  @override
  void initState() {
    super.initState();
    // Refresh punch state whenever the card mounts — both host screens
    // (Time tab, Check-in screen) should show current data, not a stale
    // cache. Deferred a frame: ref.invalidate is illegal during initState.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.invalidate(myPunchesProvider);
    });
  }

  Future<Position?> _getPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) showRunqSnack(context, 'Enable location services to check in', kind: SnackKind.error);
        return null;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        if (mounted) showRunqSnack(context, 'Location permission required', kind: SnackKind.error);
        return null;
      }
      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );
    } catch (e) {
      if (mounted) showRunqSnack(context, 'GPS error: $e', kind: SnackKind.error);
      return null;
    }
  }

  Future<void> _captureSelfie() async {
    final x = await ImagePicker().pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 70,
    );
    if (x != null) setState(() => _selfiePath = x.path);
  }

  Future<void> _punch(String kind) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final p = await _getPosition();

      // Upload the selfie first (if captured) — get back an S3 storage key.
      // If the upload fails we still let the punch through without it; the
      // selfie is auditing nice-to-have, not a blocker for marking time.
      String? selfieKey;
      if (_selfiePath != null) {
        try {
          selfieKey = await hrPhaseNextRepo.uploadPunchSelfie(File(_selfiePath!));
        } catch (e) {
          if (mounted) showRunqSnack(context, 'Selfie upload failed — punching without it', kind: SnackKind.error);
        }
      }

      await hrPhaseNextRepo.punch(
        kind: kind,
        lat: p?.latitude,
        lng: p?.longitude,
        accuracy: p?.accuracy,
        selfieUrl: selfieKey,
      );
      if (!mounted) return;
      setState(() => _selfiePath = null); // clear after successful punch
      showRunqSnack(context, kind == 'in' ? 'Checked in' : 'Checked out', kind: SnackKind.success);
      ref.invalidate(myPunchesProvider);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final punches = ref.watch(myPunchesProvider);
    final data = punches.asData?.value ?? const <HrPunch>[];
    final last = data.isNotEmpty ? data.first : null;
    final checkedIn = last?.kind == 'in';
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: HrColors.teal.withValues(alpha: isDark ? 0.13 : 0.06),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: HrColors.teal.withValues(alpha: isDark ? 0.32 : 0.18),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _cardHeader(context),
          const SizedBox(height: 14),
          _statusBanner(context, last, checkedIn),
          const SizedBox(height: 12),
          _selfieTile(context),
          const SizedBox(height: 16),
          _punchButtons(context, checkedIn),
          const SizedBox(height: 8),
          Text('Location is captured automatically when you punch.',
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(
                color: Theme.of(context).hintColor,
              )),
        ],
      ),
    );
  }

  Widget _cardHeader(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            gradient: HrColors.heroGradient,
            borderRadius: BorderRadius.circular(13),
          ),
          child: const Icon(Icons.fingerprint, color: Colors.white, size: 26),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Punch attendance',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: 2),
              Text('Mark your check-in or check-out',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).hintColor,
                      )),
            ],
          ),
        ),
      ],
    );
  }

  Widget _statusBanner(BuildContext context, HrPunch? last, bool checkedIn) {
    final color = checkedIn ? Colors.green.shade600 : Colors.blueGrey;
    final title = last == null
        ? 'Not checked in yet'
        : (checkedIn ? "You're checked in" : "You're checked out");
    final sub = last == null
        ? 'Punch in to start your day'
        : '${checkedIn ? 'Since' : 'Last punch'} ${DateFormat('EEE, d MMM • h:mm a').format(last.punchAt)}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      child: Row(
        children: [
          Icon(checkedIn ? Icons.check_circle : Icons.timelapse_outlined,
              size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: RunqText.bodyStrong.copyWith(
                      fontWeight: FontWeight.w700,
                      color: color,
                    )),
                Text(sub,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).hintColor,
                        )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _selfieTile(BuildContext context) {
    final captured = _selfiePath != null;
    return OutlinedButton.icon(
      onPressed: _busy ? null : _captureSelfie,
      style: OutlinedButton.styleFrom(
        foregroundColor: captured ? Colors.green.shade700 : HrColors.brand(context),
        padding: const EdgeInsets.symmetric(vertical: 13),
        side: BorderSide(
          color: captured
              ? Colors.green.withValues(alpha: 0.5)
              : HrColors.teal.withValues(alpha: 0.45),
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      icon: Icon(captured ? Icons.check_circle : Icons.camera_alt_outlined, size: 18),
      label: Text(captured ? 'Selfie captured' : 'Selfie (optional)'),
    );
  }

  Widget _punchButtons(BuildContext context, bool checkedIn) {
    return Row(
      children: [
        Expanded(
          child: _punchButton(
            context,
            icon: Icons.login,
            label: 'Check in',
            primary: !checkedIn,
            loading: _busy && !checkedIn,
            onPressed: (_busy || checkedIn) ? null : () => _punch('in'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _punchButton(
            context,
            icon: Icons.logout,
            label: 'Check out',
            primary: checkedIn,
            loading: _busy && checkedIn,
            onPressed: (_busy || !checkedIn) ? null : () => _punch('out'),
          ),
        ),
      ],
    );
  }

  Widget _punchButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required bool primary,
    required bool loading,
    required VoidCallback? onPressed,
  }) {
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
    final labelWidget = Text(loading ? 'Locating…' : label,
        style: const TextStyle(fontWeight: FontWeight.w600));
    final iconWidget = loading
        ? SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: primary ? Colors.white : HrColors.brand(context),
            ),
          )
        : Icon(icon, size: 19);
    if (primary) {
      return FilledButton.icon(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: HrColors.teal,
          foregroundColor: Colors.white,
          disabledBackgroundColor: HrColors.teal.withValues(alpha: 0.55),
          disabledForegroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: shape,
        ),
        icon: iconWidget,
        label: labelWidget,
      );
    }
    return OutlinedButton.icon(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: HrColors.brand(context),
        padding: const EdgeInsets.symmetric(vertical: 14),
        side: BorderSide(color: HrColors.teal.withValues(alpha: 0.5)),
        shape: shape,
      ),
      icon: iconWidget,
      label: labelWidget,
    );
  }
}
