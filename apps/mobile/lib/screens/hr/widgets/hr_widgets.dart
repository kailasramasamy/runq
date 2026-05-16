// Shared widget kit for the HR module. Kept in one file so the screens
// import a single source of truth for the visual language. Anything used
// by exactly one screen should stay private to that screen file.
//
// Visual contract:
//   - Indigo (HrColors.teal) for active states + primary actions.
//   - Surface + hairline tokens for cards so dark mode works for free.
//   - Status-pair palette mirrors the design handoff (active/pending/etc).

library;

import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../../api/api_client.dart';
import '../../../api/api_config.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'hr_colors.dart';

// ─── Avatar (initials-based) ───────────────────────────────────────────────

// Single tonal treatment in HR brand (teal/cyan/slate family) instead of
// the original 7-color rainbow. Keeps long lists of employees feeling
// cohesive rather than confetti, while still allowing each row to read
// as its own person via the initials. Hash on the first char picks one
// of the tonal slots so adjacent rows still differ subtly.
const _kAvatarTonalLight = <List<Color>>[
  [Color(0xFFCFFAFE), Color(0xFF0E7490)], // cyan
  [Color(0xFFE0F2FE), Color(0xFF075985)], // sky
  [Color(0xFFE0E7FF), Color(0xFF3730A3)], // soft indigo
  [Color(0xFFE0F7F4), Color(0xFF115E59)], // teal
  [Color(0xFFE2E8F0), Color(0xFF334155)], // slate
];

const _kAvatarTonalDark = <List<Color>>[
  [Color(0xFF155E75), Color(0xFFA5F3FC)], // cyan
  [Color(0xFF075985), Color(0xFFBAE6FD)], // sky
  [Color(0xFF312E81), Color(0xFFC7D2FE)], // soft indigo
  [Color(0xFF115E59), Color(0xFF99F6E4)], // teal
  [Color(0xFF334155), Color(0xFFCBD5E1)], // slate
];

class HrAvatar extends StatelessWidget {
  final String name;
  final double size;
  /// Either a fully-qualified URL (rendered as-is) OR an S3 storage key.
  /// When it's a storage key, [employeeId] must be provided so the avatar
  /// can fetch through the auth'd `/hr/employees/:id/photo` endpoint.
  final String? photoUrl;
  /// Required when [photoUrl] is an S3 key (the common case — the server
  /// stores the key in `employees.photo_url`). When omitted, a non-URL
  /// value in [photoUrl] is treated as "no photo" and the initials tile
  /// shows instead.
  final String? employeeId;
  final bool showOnlineDot;
  /// When true the tile renders as a teal gradient with white initials
  /// — the "self" treatment used in the home header + More profile card.
  /// When false (default), uses the name-hashed pastel palette so list
  /// rows stay visually varied.
  final bool useGradient;
  const HrAvatar({
    super.key,
    required this.name,
    this.size = 40,
    this.photoUrl,
    this.employeeId,
    this.showOnlineDot = false,
    this.useGradient = false,
  });

  /// True if [photoUrl] is renderable: either an http(s) URL, or an S3
  /// key paired with a non-empty [employeeId] (so we can route through
  /// the photo endpoint).
  bool get _hasPhoto {
    final p = photoUrl?.trim() ?? '';
    if (p.isEmpty) return false;
    if (p.startsWith('http://') || p.startsWith('https://')) return true;
    return (employeeId != null && employeeId!.isNotEmpty);
  }

  /// Resolves the actual URL to fetch — absolute pass-through or the
  /// auth'd photo endpoint.
  String? get _resolvedUrl {
    final p = photoUrl?.trim() ?? '';
    if (p.isEmpty) return null;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    if (employeeId == null || employeeId!.isEmpty) return null;
    return '${ApiConfig.baseUrl}/hr/employees/$employeeId/photo';
  }

  /// Auth headers for the photo endpoint — strip when serving an
  /// already-absolute (presumed public) URL.
  Map<String, String>? get _photoHeaders {
    final p = photoUrl?.trim() ?? '';
    if (p.startsWith('http://') || p.startsWith('https://')) return null;
    final t = apiClient.token;
    if (t == null || t.isEmpty) return null;
    return {'Authorization': 'Bearer $t'};
  }

  /// Stable [ImageProvider] for the photo. Callers (e.g. the employee
  /// detail screen) can [precacheImage] this before pushing the photo
  /// viewer so the Hero flight never falls back to initials mid-animation.
  /// Returns null when there's nothing to load.
  ImageProvider? get imageProvider {
    final url = _resolvedUrl;
    if (url == null) return null;
    return NetworkImage(url, headers: _photoHeaders);
  }

  @override
  Widget build(BuildContext context) {
    final initials = _initials(name);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final palette = isDark ? _kAvatarTonalDark : _kAvatarTonalLight;
    final pair = name.isEmpty
        ? palette.first
        : palette[name.codeUnitAt(0) % palette.length];
    final dotSize = (size * 0.32).clamp(8.0, 16.0);
    // Rounded-square (radius ≈ 1/3 size, capped at 12) to match the
    // Finance GradientAvatar styling — keeps both modules visually
    // consistent in the header avatar slot.
    final radius = (size / 3).clamp(8.0, 14.0);
    final hasPhoto = _hasPhoto;
    final resolved = _resolvedUrl;
    // Initials/gradient fallback always renders underneath the photo so a
    // broken/loading image gracefully reveals the same tile colour without
    // showing a blank rectangle.
    final fallback = Container(
      width: size, height: size,
      decoration: BoxDecoration(
        gradient: useGradient
            ? const LinearGradient(
                begin: Alignment.topLeft, end: Alignment.bottomRight,
                colors: [HrColors.teal, HrColors.tealDeep],
              )
            : null,
        color: useGradient ? null : pair[0],
        borderRadius: BorderRadius.circular(radius),
        boxShadow: useGradient
            ? [
                BoxShadow(
                  color: HrColors.teal.withValues(alpha: 0.30),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      alignment: Alignment.center,
      child: Text(
        initials,
        style: TextStyle(
          color: useGradient ? Colors.white : pair[1],
          fontSize: size * 0.38,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
    return SizedBox(
      width: size, height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          fallback,
          if (hasPhoto && resolved != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: Image(
                // Shared NetworkImage provider so once a smaller avatar has
                // loaded the photo, any larger HrAvatar (same URL+headers)
                // pulls from the cache instead of refetching — keeps the
                // photo viewer Hero flight smooth (no initials flash).
                image: imageProvider!,
                width: size, height: size,
                fit: BoxFit.cover,
                gaplessPlayback: true,
                // Hide the broken-image icon on failure — `fallback`
                // beneath already shows initials, so the photo just
                // disappears silently.
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                // Same for the load-progress phase: keep the initials
                // visible until the bytes are ready, then fade in.
                frameBuilder: (_, child, frame, __) {
                  if (frame == null) return const SizedBox.shrink();
                  return AnimatedOpacity(
                    opacity: 1,
                    duration: const Duration(milliseconds: 200),
                    child: child,
                  );
                },
              ),
            ),
          if (showOnlineDot)
            Positioned(
              right: -2, bottom: -2,
              child: Container(
                width: dotSize, height: dotSize,
                decoration: BoxDecoration(
                  color: const Color(0xFF16A34A),
                  shape: BoxShape.circle,
                  border: Border.all(color: RT(context).surface, width: 2),
                ),
              ),
            ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }
}

// ─── Status badge ──────────────────────────────────────────────────────────

class HrStatusBadge extends StatelessWidget {
  final String status;
  final String? label;
  const HrStatusBadge({super.key, required this.status, this.label});

  // Light pairs from the design handoff. Dark-mode pairs use a darker
  // tinted bg + lighter ink so the pill still reads as a colored chip
  // against the dark scaffold without the chalky pastel look.
  static const _pairsLight = <String, List<Color>>{
    'active':     [Color(0xFFDCFCE7), Color(0xFF14532D)],
    'on_leave':   [Color(0xFFFEF3C7), Color(0xFF78350F)],
    'pending':    [Color(0xFFFEF3C7), Color(0xFF78350F)],
    'approved':   [Color(0xFFDCFCE7), Color(0xFF14532D)],
    'rejected':   [Color(0xFFFEE2E2), Color(0xFF7F1D1D)],
    'cancelled':  [Color(0xFFF1F5F9), Color(0xFF475569)],
    'submitted':  [Color(0xFFDBEAFE), Color(0xFF1E3A8A)],
    'draft':      [Color(0xFFF1F5F9), Color(0xFF475569)],
    'reimbursed': [Color(0xFFCFFAFE), Color(0xFF0E7490)],
    'permanent':  [Color(0xFFEEF2FF), Color(0xFF4338CA)],
    'contract':   [Color(0xFFFEF3C7), Color(0xFF92400E)],
    'wage':       [Color(0xFFF0FDF4), Color(0xFF15803D)],
    'closed':     [Color(0xFFEEF2FF), Color(0xFF4338CA)],
    'processed':  [Color(0xFFDBEAFE), Color(0xFF1E3A8A)],
  };
  static const _pairsDark = <String, List<Color>>{
    'active':     [Color(0xFF14532D), Color(0xFF86EFAC)],
    'on_leave':   [Color(0xFF78350F), Color(0xFFFCD34D)],
    'pending':    [Color(0xFF78350F), Color(0xFFFCD34D)],
    'approved':   [Color(0xFF14532D), Color(0xFF86EFAC)],
    'rejected':   [Color(0xFF7F1D1D), Color(0xFFFCA5A5)],
    'cancelled':  [Color(0xFF334155), Color(0xFFCBD5E1)],
    'submitted':  [Color(0xFF1E3A8A), Color(0xFF93C5FD)],
    'draft':      [Color(0xFF334155), Color(0xFFCBD5E1)],
    'reimbursed': [Color(0xFF0E7490), Color(0xFFA5F3FC)],
    'permanent':  [Color(0xFF3730A3), Color(0xFFC7D2FE)],
    'contract':   [Color(0xFF92400E), Color(0xFFFCD34D)],
    'wage':       [Color(0xFF15803D), Color(0xFF86EFAC)],
    'closed':     [Color(0xFF3730A3), Color(0xFFC7D2FE)],
    'processed':  [Color(0xFF1E3A8A), Color(0xFF93C5FD)],
  };

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pairs = isDark ? _pairsDark : _pairsLight;
    final pair = pairs[status] ??
        (isDark
            ? const [Color(0xFF334155), Color(0xFFCBD5E1)]
            : const [Color(0xFFF1F5F9), Color(0xFF475569)]);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: pair[0], borderRadius: BorderRadius.circular(999)),
      child: Text(
        (label ?? status).replaceAll('_', ' '),
        style: TextStyle(color: pair[1], fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

// ─── Persona segmented control (My View / Manager) ────────────────────────

class HrRoleSegment extends StatelessWidget {
  final bool managerActive;
  /// When true the segment renders for a *dark surface* (e.g. the gradient
  /// header on Home). The trough stays the same semi-transparent gray but
  /// the active pill switches to solid white with black text so it pops
  /// against the dark backdrop. Defaults to false (light-surface variant).
  final bool onDarkSurface;
  final ValueChanged<bool> onChange;
  const HrRoleSegment({
    super.key,
    required this.managerActive,
    required this.onChange,
    this.onDarkSurface = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // On the dark header, white pill + black text is correct in any theme.
    // Off the header (e.g. More screen), match the active scaffold theme
    // so the active pill reads against `t.surface`.
    final activeBg = onDarkSurface
        ? Colors.white
        : (isDark ? RT(context).surface : Colors.white);
    final activeInk = onDarkSurface
        ? Colors.black
        : (isDark ? RT(context).ink : Colors.black);
    final inactiveInk = onDarkSurface
        ? Colors.white.withValues(alpha: 0.7)
        : (isDark ? RT(context).muted : const Color(0x993C3C43));
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: onDarkSurface
            ? Colors.white.withValues(alpha: 0.12)
            : const Color(0x1F767680),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        children: [
          // Manager first — it's the default for admins/managers and
          // visually anchors the segmented control to the role the user
          // actually wields most of the time.
          _seg(context, 'Manager', managerActive, activeBg, activeInk, inactiveInk, () => onChange(true)),
          _seg(context, 'My View', !managerActive, activeBg, activeInk, inactiveInk, () => onChange(false)),
        ],
      ),
    );
  }

  Widget _seg(BuildContext context, String label, bool active, Color activeBg, Color activeInk, Color inactiveInk, VoidCallback onTap) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 7),
            decoration: BoxDecoration(
              color: active ? activeBg : Colors.transparent,
              borderRadius: BorderRadius.circular(7),
              boxShadow: active
                  ? const [BoxShadow(color: Color(0x1F000000), blurRadius: 3, offset: Offset(0, 1))]
                  : null,
            ),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  color: active ? activeInk : inactiveInk,
                  fontSize: 13,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
          ),
        ),
      );
}

// ─── Module switcher pill (Finance / HR) ──────────────────────────────────

/// Tappable pill that switches modules. Same shape/size in both the HR
/// and Finance headers — pass the module's brand colour as `accent` so
/// each side stays on-brand (HR teal, Finance indigo).
class HrModulePill extends StatelessWidget {
  final String moduleLabel;
  /// Where tapping will take the user. Renders as a faded "→ Finance" tail
  /// so the user understands the pill is a one-tap switcher.
  final String? targetLabel;
  /// True when the pill sits on a dark gradient. False for light scaffold.
  final bool onDarkSurface;
  /// Brand colour for the light-surface variant. Ignored when
  /// `onDarkSurface` is true (dark variant always uses translucent white).
  /// Defaults to HR teal so existing HR call-sites work unchanged.
  final Color accent;
  final VoidCallback onTap;
  const HrModulePill({
    super.key,
    required this.moduleLabel,
    required this.onTap,
    this.targetLabel,
    this.onDarkSurface = true,
    this.accent = HrColors.teal,
  });

  @override
  Widget build(BuildContext context) {
    final ink = onDarkSurface ? Colors.white : accent;
    final bg = onDarkSurface
        ? Colors.white.withValues(alpha: 0.14)
        : accent.withValues(alpha: 0.10);
    final borderColor = onDarkSurface
        ? Colors.white.withValues(alpha: 0.22)
        : accent.withValues(alpha: 0.22);
    final tailInk = onDarkSurface
        ? Colors.white.withValues(alpha: 0.65)
        : accent.withValues(alpha: 0.55);
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 7, 12, 7),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: borderColor, width: 0.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.swap_horiz_rounded, size: 14, color: ink),
            const SizedBox(width: 6),
            Text(
              moduleLabel,
              style: TextStyle(color: ink, fontSize: 12, fontWeight: FontWeight.w600),
            ),
            if (targetLabel != null) ...[
              const SizedBox(width: 6),
              Text(
                '→ $targetLabel',
                style: TextStyle(color: tailInk, fontSize: 12, fontWeight: FontWeight.w500),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Muster tile (Present / Leave / Absent / W-Off) ───────────────────────

/// Semantic kinds for the muster tile. The widget picks theme-appropriate
/// colours per kind so callers don't have to hand-mix bg/ink pairs.
enum MusterKind { present, leave, absent, weekoff, halfday, holiday }

class HrMusterTile extends StatelessWidget {
  final String label;
  final int value;
  final MusterKind kind;
  const HrMusterTile({
    super.key,
    required this.label,
    required this.value,
    required this.kind,
  });

  // Light pairs: pastel bg + dark ink.
  static const _light = <MusterKind, List<Color>>{
    MusterKind.present:  [Color(0xFFDCFCE7), Color(0xFF14532D)],
    MusterKind.leave:    [Color(0xFFFEF3C7), Color(0xFF78350F)],
    MusterKind.absent:   [Color(0xFFFEE2E2), Color(0xFF7F1D1D)],
    MusterKind.weekoff:  [Color(0xFFF1F5F9), Color(0xFF475569)],
    MusterKind.halfday:  [Color(0xFFDBEAFE), Color(0xFF1E3A8A)],
    MusterKind.holiday:  [Color(0xFFEDE9FE), Color(0xFF5B21B6)],
  };
  // Dark pairs: deep tinted bg + light ink so the tile reads as a colored
  // chip on the dark scaffold without the chalky pastel look.
  static const _dark = <MusterKind, List<Color>>{
    MusterKind.present:  [Color(0xFF14532D), Color(0xFF86EFAC)],
    MusterKind.leave:    [Color(0xFF78350F), Color(0xFFFCD34D)],
    MusterKind.absent:   [Color(0xFF7F1D1D), Color(0xFFFCA5A5)],
    MusterKind.weekoff:  [Color(0xFF334155), Color(0xFFCBD5E1)],
    MusterKind.halfday:  [Color(0xFF1E3A8A), Color(0xFF93C5FD)],
    MusterKind.holiday:  [Color(0xFF5B21B6), Color(0xFFC4B5FD)],
  };

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pair = (isDark ? _dark : _light)[kind]!;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(color: pair[0], borderRadius: BorderRadius.circular(12)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$value',
              style: TextStyle(color: pair[1], fontSize: 22, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(
            label.toUpperCase(),
            style: TextStyle(
              color: pair[1], fontSize: 10, fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Biometric check-in button ────────────────────────────────────────────

enum BiometricState { idle, scanning, success }

class HrBiometricButton extends StatefulWidget {
  final BiometricState state;
  /// Called when the user taps the button in idle state. Owner runs the
  /// network call and transitions to `scanning` → `success` itself.
  final VoidCallback onTap;
  final String? successCaption; // e.g. "09:05 AM · Office"
  const HrBiometricButton({
    super.key,
    required this.state,
    required this.onTap,
    this.successCaption,
  });

  @override
  State<HrBiometricButton> createState() => _HrBiometricButtonState();
}

class _HrBiometricButtonState extends State<HrBiometricButton>
    with TickerProviderStateMixin {
  late final AnimationController _pulse;
  late final AnimationController _pop;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..repeat();
    _pop = AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
  }

  @override
  void didUpdateWidget(covariant HrBiometricButton old) {
    super.didUpdateWidget(old);
    if (widget.state == BiometricState.success && old.state != BiometricState.success) {
      _pop.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isScan = widget.state == BiometricState.scanning;
    final isDone = widget.state == BiometricState.success;
    // Idle ring blends with the parent surface (bgWarmer in light, ink2-tinted
    // surface in dark) so the button sits on the card without a chalky patch.
    final idleBg = isDark ? t.bgWarmer : const Color(0xFFF8FAFC);
    final idleBorder = t.hairline;
    final scanBg = isDark ? HrColors.teal.withValues(alpha: 0.18) : const Color(0xFFEEF2FF);
    final ringBg = isDone
        ? const Color(0xFF16A34A)
        : (isScan ? scanBg : idleBg);
    final ringBorder = isDone
        ? const Color(0xFF16A34A)
        : (isScan ? HrColors.teal : idleBorder);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          alignment: Alignment.center,
          children: [
            if (isScan) ...[_pulseRing(0), _pulseRing(0.6)],
            ScaleTransition(
              scale: isDone
                  ? Tween(begin: 0.8, end: 1.0).chain(CurveTween(curve: Curves.easeOutBack)).animate(_pop)
                  : const AlwaysStoppedAnimation(1),
              child: GestureDetector(
                onTap: widget.state == BiometricState.idle ? widget.onTap : null,
                child: Container(
                  width: 88, height: 88,
                  decoration: BoxDecoration(
                    color: ringBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: ringBorder, width: 2.5),
                  ),
                  alignment: Alignment.center,
                  child: Icon(
                    isDone ? Icons.check_rounded : Icons.fingerprint_rounded,
                    size: 44,
                    color: isDone ? Colors.white : (isScan ? HrColors.teal : t.muted2),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          isDone ? 'Checked in!' : (isScan ? 'Scanning…' : 'Tap to check in'),
          style: TextStyle(
            color: isDone
                ? (isDark ? const Color(0xFF6EE7B7) : const Color(0xFF15803D))
                : (isScan ? HrColors.teal : t.ink),
            fontSize: 14, fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          isDone
              ? (widget.successCaption ?? 'Touch ID · Face ID')
              : 'Touch ID · Face ID',
          style: TextStyle(color: t.muted, fontSize: 11),
        ),
      ],
    );
  }

  Widget _pulseRing(double delay) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (_, __) {
        final v = ((_pulse.value + delay) % 1.0);
        final scale = 1 + v * 1.6;
        final opacity = math.max(0.0, 0.7 - v * 0.7);
        return Opacity(
          opacity: opacity,
          child: Transform.scale(
            scale: scale,
            child: Container(
              width: 88, height: 88,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: HrColors.teal, width: 2),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ─── Pending leave card (manager) ─────────────────────────────────────────

class HrPendingLeaveCard extends StatefulWidget {
  final String employeeId;
  final String employeeName;
  final String employeeCode;
  /// Optional avatar photo (S3 key — resolved via /hr/employees/:id/photo).
  final String? employeePhotoUrl;
  final String leaveTypeName;
  final DateTime fromDate, toDate;
  final double totalDays;
  final String? reason;
  /// Called with `approved=true|false` after the in-card animation begins.
  /// Owner runs the API call and removes the row on success.
  final Future<void> Function(bool approved) onDecide;
  const HrPendingLeaveCard({
    super.key,
    required this.employeeId,
    required this.employeeName,
    required this.employeeCode,
    this.employeePhotoUrl,
    required this.leaveTypeName,
    required this.fromDate,
    required this.toDate,
    required this.totalDays,
    required this.reason,
    required this.onDecide,
  });

  @override
  State<HrPendingLeaveCard> createState() => _HrPendingLeaveCardState();
}

class _HrPendingLeaveCardState extends State<HrPendingLeaveCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _fade;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _fade = AnimationController(vsync: this, duration: const Duration(milliseconds: 320), value: 1);
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  Future<void> _decide(bool approved) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.onDecide(approved);
      if (!mounted) return;
      await _fade.reverse();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _fmtRange() {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final f = widget.fromDate;
    final t = widget.toDate;
    if (f.year == t.year && f.month == t.month && f.day == t.day) {
      return '${f.day} ${m[f.month - 1]}';
    }
    return '${f.day} ${m[f.month - 1]} → ${t.day} ${m[t.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return FadeTransition(
      opacity: _fade,
      child: ScaleTransition(
        scale: Tween(begin: 0.95, end: 1.0).animate(_fade),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  HrAvatar(
                    name: widget.employeeName,
                    photoUrl: widget.employeePhotoUrl,
                    employeeId: widget.employeeId,
                    size: 40,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.employeeName,
                            style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                        const SizedBox(height: 2),
                        Text('${widget.employeeCode} · ${widget.leaveTypeName}',
                            style: RunqText.caption.copyWith(color: t.muted)),
                      ],
                    ),
                  ),
                  HrStatusBadge(status: 'pending', label: '${widget.totalDays.toStringAsFixed(widget.totalDays % 1 == 0 ? 0 : 1)}d'),
                ],
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  // Use the warmer scaffold tone so the inset reads as a
                  // nested block in either theme rather than a bright patch
                  // on a dark surface.
                  color: t.bgWarmer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_fmtRange(),
                        style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                    if (widget.reason != null && widget.reason!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(widget.reason!,
                          maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => _decide(false),
                      style: OutlinedButton.styleFrom(
                        // Bright red on light, salmon on dark — matches the
                        // status-pill ink + surface tokens for contrast.
                        side: BorderSide(
                          color: isDark ? const Color(0xFFFCA5A5) : const Color(0xFFDC2626),
                        ),
                        foregroundColor:
                            isDark ? const Color(0xFFFCA5A5) : const Color(0xFFDC2626),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Reject'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : () => _decide(true),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF16A34A),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Approve ✓'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Week strip (7-day attendance picker) ─────────────────────────────────

class HrWeekStrip extends StatelessWidget {
  final DateTime selected;
  /// Map of day → status code ('present', 'absent', 'leave', 'weekoff', ...)
  /// Days not in the map render as a neutral pill.
  final Map<int, String> statusByDay;
  final ValueChanged<DateTime> onSelect;
  const HrWeekStrip({
    super.key,
    required this.selected,
    required this.statusByDay,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final monday = DateTime(selected.year, selected.month, selected.day - (selected.weekday - 1));
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Row(
        children: List.generate(7, (i) {
          final day = monday.add(Duration(days: i));
          final isSelected = day.year == selected.year && day.month == selected.month && day.day == selected.day;
          final status = statusByDay[day.day] ?? 'none';
          final pair = _statusPair(status, Theme.of(context).brightness == Brightness.dark);
          return Expanded(
            child: GestureDetector(
              onTap: () => onSelect(day),
              behavior: HitTestBehavior.opaque,
              child: Column(
                children: [
                  Text(
                    _dayLabel(day.weekday),
                    style: TextStyle(
                      color: isSelected ? HrColors.teal : t.muted,
                      fontSize: 11,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isSelected ? HrColors.teal : pair[0],
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${day.day}',
                      style: TextStyle(
                        color: isSelected ? Colors.white : pair[1],
                        fontSize: 13, fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }

  static String _dayLabel(int weekday) {
    const labels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    return labels[weekday - 1];
  }

  static List<Color> _statusPair(String status, bool isDark) {
    if (isDark) {
      switch (status) {
        case 'present':  return const [Color(0xFF14532D), Color(0xFF86EFAC)];
        case 'leave':    return const [Color(0xFF78350F), Color(0xFFFCD34D)];
        case 'absent':   return const [Color(0xFF7F1D1D), Color(0xFFFCA5A5)];
        case 'weekoff':  return const [Color(0xFF334155), Color(0xFFCBD5E1)];
        case 'half_day': return const [Color(0xFF1E3A8A), Color(0xFF93C5FD)];
        default:         return const [Color(0xFF1F2937), Color(0xFF94A3B8)];
      }
    }
    switch (status) {
      case 'present':  return const [Color(0xFFDCFCE7), Color(0xFF14532D)];
      case 'leave':    return const [Color(0xFFFEF3C7), Color(0xFF78350F)];
      case 'absent':   return const [Color(0xFFFEE2E2), Color(0xFF7F1D1D)];
      case 'weekoff':  return const [Color(0xFFF1F5F9), Color(0xFF475569)];
      case 'half_day': return const [Color(0xFFDBEAFE), Color(0xFF1E3A8A)];
      default:         return const [Color(0xFFF8FAFC), Color(0xFF64748B)];
    }
  }
}

// ─── Payslip hero card ────────────────────────────────────────────────────

class HrPayslipHero extends StatelessWidget {
  final String periodLabel;
  final double netPay;
  final double gross;
  final double deductions;
  final double workingDays;
  final String statusLabel;
  final VoidCallback? onTap;
  const HrPayslipHero({
    super.key,
    required this.periodLabel,
    required this.netPay,
    required this.gross,
    required this.deductions,
    required this.workingDays,
    required this.statusLabel,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft, end: Alignment.bottomRight,
            colors: [Color(0xFF0E7490), Color(0xFF06B6D4)],
          ),
          borderRadius: BorderRadius.circular(RunqRadii.card),
          boxShadow: RunqShadows.card,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(periodLabel,
                      style: const TextStyle(
                        color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500,
                      )),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(statusLabel,
                      style: const TextStyle(
                        color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700,
                      )),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(_fmt(netPay),
                style: const TextStyle(
                  color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800,
                  fontFeatures: [FontFeature.tabularFigures()],
                )),
            Text('Net pay',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12)),
            const SizedBox(height: 14),
            Row(
              children: [
                _stat('Gross', _fmt(gross)),
                const SizedBox(width: 12),
                _stat('Deductions', _fmt(deductions)),
                const SizedBox(width: 12),
                _stat('Days', workingDays.toStringAsFixed(workingDays % 1 == 0 ? 0 : 1)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _fmt(double v) {
    final n = v.round();
    final s = n.abs().toString();
    final buf = StringBuffer();
    int count = 0;
    // Indian grouping: last 3 digits, then groups of 2.
    for (int i = s.length - 1; i >= 0; i--) {
      buf.write(s[i]);
      count++;
      if (i == 0) break;
      if (count == 3 || (count > 3 && (count - 3) % 2 == 0)) buf.write(',');
    }
    final body = buf.toString().split('').reversed.join();
    return '${n < 0 ? '−' : ''}₹$body';
  }

  Widget _stat(String label, String value) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11)),
            const SizedBox(height: 2),
            Text(value,
                style: const TextStyle(
                  color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700,
                  fontFeatures: [FontFeature.tabularFigures()],
                )),
          ],
        ),
      );
}

// ─── Apply leave bottom sheet ─────────────────────────────────────────────

class ApplyLeaveResult {
  final String leaveTypeId;
  final DateTime fromDate, toDate;
  final bool halfDay;
  final String? reason;
  ApplyLeaveResult({
    required this.leaveTypeId,
    required this.fromDate,
    required this.toDate,
    required this.halfDay,
    this.reason,
  });
}

Future<ApplyLeaveResult?> showApplyLeaveSheet(
  BuildContext context, {
  required List<({String id, String code, String name})> leaveTypes,
}) {
  return showModalBottomSheet<ApplyLeaveResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ApplyLeaveSheet(leaveTypes: leaveTypes),
  );
}

class _ApplyLeaveSheet extends StatefulWidget {
  final List<({String id, String code, String name})> leaveTypes;
  const _ApplyLeaveSheet({required this.leaveTypes});

  @override
  State<_ApplyLeaveSheet> createState() => _ApplyLeaveSheetState();
}

class _ApplyLeaveSheetState extends State<_ApplyLeaveSheet> {
  String? _leaveTypeId;
  DateTime? _from, _to;
  bool _halfDay = false;
  final _reason = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.leaveTypes.isNotEmpty) _leaveTypeId = widget.leaveTypes.first.id;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isFrom) async {
    final init = isFrom ? (_from ?? DateTime.now()) : (_to ?? _from ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: init,
      firstDate: DateTime.now().subtract(const Duration(days: 60)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        _from = picked;
        if (_to != null && _to!.isBefore(picked)) _to = picked;
      } else {
        _to = picked;
      }
    });
  }

  bool get _canSubmit => _leaveTypeId != null && _from != null && _to != null;

  void _submit() {
    if (!_canSubmit) return;
    Navigator.of(context).pop(ApplyLeaveResult(
      leaveTypeId: _leaveTypeId!,
      fromDate: _from!,
      toDate: _to!,
      halfDay: _halfDay,
      reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text('Apply for leave', style: RunqText.h3.copyWith(color: t.ink)),
          const SizedBox(height: 16),
          Text('Leave type', style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: widget.leaveTypes.map((lt) {
              final active = lt.id == _leaveTypeId;
              return GestureDetector(
                onTap: () => setState(() => _leaveTypeId = lt.id),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    // Indigo wash for the active pill. `withValues` on the
                    // brand means it stays subtle in dark mode instead of
                    // shouting `EEF2FF` chalk.
                    color: active ? HrColors.teal.withValues(alpha: 0.12) : t.surface,
                    border: Border.all(
                      color: active ? HrColors.teal : t.hairline,
                      width: active ? 1.5 : 0.5,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    lt.code,
                    style: TextStyle(
                      color: active ? HrColors.teal : t.ink,
                      fontSize: 13, fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _dateField('From', _from, () => _pickDate(true))),
              const SizedBox(width: 10),
              Expanded(child: _dateField('To', _to, () => _pickDate(false))),
            ],
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => setState(() => _halfDay = !_halfDay),
            child: Row(
              children: [
                Icon(
                  _halfDay ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                  color: _halfDay ? HrColors.teal : t.muted, size: 20,
                ),
                const SizedBox(width: 6),
                Text('Half day', style: RunqText.body.copyWith(color: t.ink, fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'Reason (optional)',
              isDense: true,
              filled: true,
              fillColor: t.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: t.hairline, width: 0.5),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: t.hairline, width: 0.5),
              ),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _canSubmit ? _submit : null,
            style: FilledButton.styleFrom(
              backgroundColor: HrColors.teal,
              disabledBackgroundColor: t.hairlineSoft,
              disabledForegroundColor: t.muted2,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Submit request'),
          ),
        ],
      ),
    );
  }

  Widget _dateField(String label, DateTime? value, VoidCallback onTap) {
    final t = RT(context);
    final body = value == null
        ? 'Select date'
        : '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: t.hairline, width: 0.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
            const SizedBox(height: 2),
            Text(body,
                style: TextStyle(
                  color: value == null ? t.muted : t.ink,
                  fontSize: 14, fontWeight: FontWeight.w600,
                )),
          ],
        ),
      ),
    );
  }
}

// ─── Misc helpers ─────────────────────────────────────────────────────────

/// Indian-number-system rupee formatter (no decimals).
String hrFormatINR(num v) {
  final n = v.round();
  final s = n.abs().toString();
  final buf = StringBuffer();
  int count = 0;
  for (int i = s.length - 1; i >= 0; i--) {
    buf.write(s[i]);
    count++;
    if (i == 0) break;
    if (count == 3 || (count > 3 && (count - 3) % 2 == 0)) buf.write(',');
  }
  final body = buf.toString().split('').reversed.join();
  return '${n < 0 ? '−' : ''}₹$body';
}

/// Time-of-day greeting. Used in the dark header on Home.
String hrGreeting(DateTime now) {
  final h = now.hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/// Convenience: `Future.delayed` that respects mount state — lets a screen
/// wait between animation stages without scattering null-checks.
Future<void> sleep(int ms) => Future<void>.delayed(Duration(milliseconds: ms));
