import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../api/api_client.dart';
import '../api/api_config.dart';
import '../api/mp_models.dart';
import '../api/mp_repo.dart';
import '../l10n/app_localizations.dart';
import '../providers/farmer_providers.dart';
import '../services/background_removal_service.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'dhenu_toast.dart';
import 'image_source_sheet.dart';

/// The 64px avatar on the farmer's profile hero. Shows the profile photo when
/// one exists (auth-gated network image, initials fallback), and lets the
/// farmer tap to set/change it: pick from camera or gallery, on-device
/// background cut-out, upload, then refresh [farmerSelfProvider].
class FarmerProfilePhoto extends ConsumerStatefulWidget {
  const FarmerProfilePhoto({super.key, required this.farmer, required this.initial});

  final MpFarmer farmer;

  /// Single-letter fallback shown while there's no photo (white on gradient).
  final String initial;

  @override
  ConsumerState<FarmerProfilePhoto> createState() => _FarmerProfilePhotoState();
}

class _FarmerProfilePhotoState extends ConsumerState<FarmerProfilePhoto> {
  static const double _size = 64;
  bool _busy = false;

  Future<void> _edit() async {
    if (_busy) return;
    final l = AppLocalizations.of(context);
    final src = await showImageSourceSheet(context);
    if (src == null || !mounted) return;
    final xf = await ImagePicker().pickImage(source: src, imageQuality: 85);
    if (xf == null || !mounted) return;
    setState(() => _busy = true);
    try {
      // Best-effort person cut-out on brand fill (returns the original on fail).
      final file = await BackgroundRemovalService.personOnBrandFill(File(xf.path));
      await mpRepo.uploadFarmerDoc(widget.farmer.id, file, kind: 'profile_photo');
      ref.invalidate(farmerSelfProvider);
      if (mounted) showDhenuToast(context, l.farmerPhotoUpdated, type: DhenuToastType.success);
    } on ApiException catch (e) {
      if (mounted) showDhenuToast(context, e.message, type: DhenuToastType.error);
    } catch (_) {
      if (mounted) showDhenuToast(context, l.farmerPhotoFailed, type: DhenuToastType.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _edit,
      child: SizedBox(
        width: _size + 8,
        height: _size + 8,
        child: Stack(
          alignment: Alignment.center,
          children: [
            _circle(),
            if (_busy)
              const SizedBox(
                width: 24, height: 24,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              ),
            Positioned(right: 0, bottom: 0, child: _cameraBadge(context)),
          ],
        ),
      ),
    );
  }

  Widget _circle() {
    final ring = Container(
      width: _size,
      height: _size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 2),
      ),
      child: widget.farmer.hasPhoto ? _photo() : _initials(),
    );
    return ring;
  }

  Widget _initials() => Text(
        widget.initial,
        style: DhenuText.h2.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
      );

  Widget _photo() {
    final token = apiClient.token;
    // Cache-bust by photoDocId so a freshly uploaded photo replaces the old one
    // (the URL is otherwise stable and Image.network would serve the cached one).
    final url = '${ApiConfig.baseUrl}/milk-procurement/farmers/${widget.farmer.id}'
        '/photo?v=${widget.farmer.photoDocId}';
    return ClipOval(
      child: Image.network(
        url,
        headers: token != null ? {'Authorization': 'Bearer $token'} : const {},
        width: _size - 4,
        height: _size - 4,
        fit: BoxFit.cover,
        cacheWidth: (_size * 3).round(),
        loadingBuilder: (_, child, progress) => progress == null ? child : _initials(),
        errorBuilder: (_, _, _) => _initials(),
      ),
    );
  }

  Widget _cameraBadge(BuildContext context) {
    final t = DT(context);
    return Container(
      width: 24,
      height: 24,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: t.brand.withValues(alpha: 0.15)),
      ),
      child: Icon(DhenuIcons.camera, size: 13, color: t.brand),
    );
  }
}
