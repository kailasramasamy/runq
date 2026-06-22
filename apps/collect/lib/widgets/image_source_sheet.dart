import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'sheet_grabber.dart';

/// Bottom sheet to choose Camera or Gallery as an image source. Shared by the
/// add-farmer flow and the farmer self-profile photo editor. Returns the chosen
/// [ImageSource], or null if dismissed.
Future<ImageSource?> showImageSourceSheet(BuildContext context) {
  final t = DT(context);
  final l = AppLocalizations.of(context);
  return showModalBottomSheet<ImageSource>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.lg),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const SheetGrabber(),
            Padding(
              padding: const EdgeInsets.only(bottom: DhenuSpacing.lg),
              child: Text(l.photoSourceTitle, style: DhenuText.title.copyWith(color: t.ink)),
            ),
            Row(children: [
              Expanded(
                child: _SourceTile(
                  icon: DhenuIcons.camera,
                  label: l.addFarmerCamera,
                  onTap: () => Navigator.pop(ctx, ImageSource.camera),
                ),
              ),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(
                child: _SourceTile(
                  icon: DhenuIcons.images,
                  label: l.addFarmerGallery,
                  onTap: () => Navigator.pop(ctx, ImageSource.gallery),
                ),
              ),
            ]),
            const SizedBox(height: DhenuSpacing.sm),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(l.commonCancel, style: DhenuText.label.copyWith(color: t.inkSoft)),
            ),
          ]),
        ),
      ),
    ),
  );
}

class _SourceTile extends StatelessWidget {
  const _SourceTile({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(DhenuRadii.card),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.lg),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.card),
          border: Border.all(color: t.hairline),
        ),
        child: Column(children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: t.brandSubtle, shape: BoxShape.circle),
            child: Icon(icon, color: t.brand, size: 24),
          ),
          const SizedBox(height: DhenuSpacing.sm),
          Text(label, style: DhenuText.label.copyWith(color: t.ink)),
        ]),
      ),
    );
  }
}
