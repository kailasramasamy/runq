import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../api/api_config.dart';
import '../api/mp_models.dart';

/// Open a full-screen photo viewer for [farmer].
/// Noop if [farmer.hasPhoto] is false.
Future<void> showFarmerPhoto(BuildContext context, MpFarmer farmer) {
  if (!farmer.hasPhoto) return Future.value();
  return Navigator.of(context).push<void>(
    PageRouteBuilder(
      opaque: false,
      barrierColor: Colors.black,
      barrierDismissible: true,
      pageBuilder: (ctx, anim, secAnim) => _FarmerPhotoPage(farmer: farmer),
      transitionsBuilder: (ctx, anim, secAnim, child) =>
          FadeTransition(opacity: anim, child: child),
    ),
  );
}

class _FarmerPhotoPage extends StatelessWidget {
  const _FarmerPhotoPage({required this.farmer});
  final MpFarmer farmer;

  @override
  Widget build(BuildContext context) {
    final token = apiClient.token;
    final url = '${ApiConfig.baseUrl}/milk-procurement/farmers/${farmer.id}/photo';
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
      body: GestureDetector(
        onTap: () => Navigator.of(context).pop(),
        child: Center(
          child: Hero(
            tag: 'farmer-photo-${farmer.id}',
            child: InteractiveViewer(
              minScale: 0.5,
              maxScale: 6.0,
              child: Image.network(
                url,
                headers:
                    token != null ? {'Authorization': 'Bearer $token'} : const {},
                fit: BoxFit.contain,
                loadingBuilder: (_, child, progress) {
                  if (progress == null) return child;
                  return const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  );
                },
                errorBuilder: (context2, error, stackTrace) => const Icon(
                  Icons.broken_image_outlined,
                  color: Colors.white54,
                  size: 64,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
