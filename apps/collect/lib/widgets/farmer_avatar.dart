import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../api/api_config.dart';
import '../api/mp_models.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// Circular farmer avatar. Shows the profile photo when [farmer.hasPhoto],
/// falling back to an initials circle on load error or when no photo exists.
///
/// Pass [onTap] to make the avatar tappable (e.g. open the full-screen viewer).
/// Pass [heroTag] to participate in a Hero animation — must match the viewer.
class FarmerAvatar extends StatelessWidget {
  const FarmerAvatar({
    super.key,
    required this.farmer,
    this.radius = 20,
    this.onTap,
    this.heroTag,
  });

  final MpFarmer farmer;
  final double radius;
  final VoidCallback? onTap;
  final Object? heroTag;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    Widget avatar;
    if (farmer.hasPhoto) {
      avatar = _PhotoAvatar(farmer: farmer, radius: radius, t: t, heroTag: heroTag);
    } else {
      avatar = _InitialsAvatar(farmer: farmer, radius: radius, t: t, heroTag: heroTag);
    }
    if (onTap != null) {
      return GestureDetector(onTap: onTap, child: avatar);
    }
    return avatar;
  }
}

// ── Photo avatar ─────────────────────────────────────────────────────────────

class _PhotoAvatar extends StatelessWidget {
  const _PhotoAvatar({
    required this.farmer,
    required this.radius,
    required this.t,
    this.heroTag,
  });

  final MpFarmer farmer;
  final double radius;
  final DhenuTokens t;
  final Object? heroTag;

  @override
  Widget build(BuildContext context) {
    final diameter = radius * 2;
    final token = apiClient.token;
    final url = '${ApiConfig.baseUrl}/milk-procurement/farmers/${farmer.id}/photo';

    Widget image = Image.network(
      url,
      headers: token != null ? {'Authorization': 'Bearer $token'} : const {},
      width: diameter,
      height: diameter,
      fit: BoxFit.cover,
      cacheWidth: (diameter * 3).round(),
      loadingBuilder: (_, child, progress) {
        if (progress == null) return child;
        return _InitialsAvatar(farmer: farmer, radius: radius, t: t);
      },
      errorBuilder: (context2, error, stackTrace) =>
          _InitialsAvatar(farmer: farmer, radius: radius, t: t),
    );

    image = ClipOval(
      child: SizedBox(width: diameter, height: diameter, child: image),
    );

    if (heroTag != null) {
      image = Hero(tag: heroTag!, child: image);
    }
    return image;
  }
}

// ── Initials avatar ───────────────────────────────────────────────────────────

class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({
    required this.farmer,
    required this.radius,
    required this.t,
    this.heroTag,
  });

  final MpFarmer farmer;
  final double radius;
  final DhenuTokens t;
  final Object? heroTag;

  @override
  Widget build(BuildContext context) {
    // Scale the text: at radius=20 (SourceRow) we use DhenuText.label (14/600).
    // At radius=28 (detail header) we step up to DhenuText.title (18/600).
    // Interpolate: fontSize = (radius / 20) * 14, clamped 12–18.
    final fontSize = ((radius / 20.0) * 14.0).clamp(12.0, 18.0);
    Widget circle = CircleAvatar(
      radius: radius,
      backgroundColor: t.brandSubtle,
      child: Text(
        farmer.initials,
        style: DhenuText.label.copyWith(
          color: t.brand,
          fontSize: fontSize,
        ),
      ),
    );
    if (heroTag != null) {
      circle = Hero(tag: heroTag!, child: circle);
    }
    return circle;
  }
}
