import 'dart:io';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';

// ── Section shell ────────────────────────────────────────────────────────────

/// One labelled card with an emerald icon chip — the repeating unit that gives
/// the Add Farmer form its structure. [trailing] sits at the far right of the
/// header (used for the herd total badge).
class FormSectionCard extends StatelessWidget {
  const FormSectionCard({
    super.key,
    required this.icon,
    required this.title,
    required this.children,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return DhenuCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: t.brandSubtle,
                  borderRadius: BorderRadius.circular(DhenuRadii.input),
                ),
                child: Icon(icon, size: 18, color: t.brand),
              ),
              const SizedBox(width: DhenuSpacing.sm),
              Expanded(
                child: Text(title, style: DhenuText.title.copyWith(color: t.ink)),
              ),
              ?trailing,
            ],
          ),
          const SizedBox(height: DhenuSpacing.lg),
          ...children,
        ],
      ),
    );
  }
}

/// A small grey field caption used above non-TextField controls.
class FieldCaption extends StatelessWidget {
  const FieldCaption(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
      child: Text(text, style: DhenuText.label.copyWith(color: t.inkSoft)),
    );
  }
}

// ── Basics section ───────────────────────────────────────────────────────────

class FarmerBasicsSection extends StatelessWidget {
  const FarmerBasicsSection({
    super.key,
    required this.nameCtrl,
    required this.phoneCtrl,
    required this.dob,
    required this.onPickDob,
  });

  final TextEditingController nameCtrl;
  final TextEditingController phoneCtrl;
  final DateTime? dob;
  final VoidCallback onPickDob;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return FormSectionCard(
      icon: DhenuIcons.user,
      title: 'Basics',
      children: [
        TextField(
          controller: nameCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Full Name *'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: phoneCtrl,
          keyboardType: TextInputType.phone,
          textCapitalization: TextCapitalization.none,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(labelText: 'Phone Number'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        GestureDetector(
          onTap: onPickDob,
          child: Container(
            height: DhenuSpacing.minTap,
            padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg),
            decoration: BoxDecoration(
              color: t.inputFill,
              borderRadius: BorderRadius.circular(DhenuRadii.input),
              border: Border.all(color: t.hairline),
            ),
            child: Row(
              children: [
                Icon(DhenuIcons.cake, size: 18, color: t.inkSoft),
                const SizedBox(width: DhenuSpacing.sm),
                Expanded(
                  child: Text(
                    dob == null
                        ? 'Date of Birth (optional — enables app login)'
                        : '${dob!.day.toString().padLeft(2, '0')}/${dob!.month.toString().padLeft(2, '0')}/${dob!.year}',
                    style: DhenuText.body.copyWith(
                      color: dob == null ? t.inkSoft : t.ink,
                    ),
                  ),
                ),
                if (dob != null)
                  Icon(DhenuIcons.close, size: 18, color: t.inkSoft),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ── Location section ─────────────────────────────────────────────────────────

class FarmerLocationSection extends StatelessWidget {
  const FarmerLocationSection({
    super.key,
    required this.villageCtrl,
    required this.addressCtrl,
    required this.lat,
    required this.lng,
    required this.gpsLoading,
    required this.onCaptureGps,
  });

  final TextEditingController villageCtrl;
  final TextEditingController addressCtrl;
  final double? lat;
  final double? lng;
  final bool gpsLoading;
  final VoidCallback onCaptureGps;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final hasPin = lat != null && lng != null;
    return FormSectionCard(
      icon: DhenuIcons.mapPin,
      title: 'Location',
      children: [
        TextField(
          controller: villageCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Village'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: addressCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Address'),
          maxLines: 2,
          textInputAction: TextInputAction.newline,
        ),
        const SizedBox(height: DhenuSpacing.md),
        OutlinedButton.icon(
          onPressed: gpsLoading ? null : onCaptureGps,
          icon: gpsLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(hasPin ? DhenuIcons.checkCircle : DhenuIcons.mapPin, size: 18),
          label: Text(
            gpsLoading
                ? 'Getting location…'
                : hasPin
                    ? '📍 ${lat!.toStringAsFixed(5)}, ${lng!.toStringAsFixed(5)}'
                    : 'Capture GPS location',
          ),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
            side: BorderSide(color: t.brand),
            foregroundColor: t.brand,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(DhenuRadii.button),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Identity section ─────────────────────────────────────────────────────────

class FarmerIdentitySection extends StatelessWidget {
  const FarmerIdentitySection({
    super.key,
    required this.aadhaarCtrl,
    required this.photoFile,
    required this.kycFile,
    required this.onPickPhoto,
    required this.onPickKyc,
  });

  final TextEditingController aadhaarCtrl;
  final File? photoFile;
  final File? kycFile;
  final VoidCallback onPickPhoto;
  final VoidCallback onPickKyc;

  @override
  Widget build(BuildContext context) {
    return FormSectionCard(
      icon: DhenuIcons.idCard,
      title: 'Identity',
      children: [
        _ProfilePhotoPicker(file: photoFile, onTap: onPickPhoto),
        const SizedBox(height: DhenuSpacing.lg),
        TextField(
          controller: aadhaarCtrl,
          keyboardType: TextInputType.number,
          textCapitalization: TextCapitalization.none,
          maxLength: 12,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'Aadhaar Number',
            counterText: '',
          ),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        _DocPickerRow(
          label: 'KYC Document',
          icon: DhenuIcons.document,
          file: kycFile,
          onTap: onPickKyc,
        ),
      ],
    );
  }
}

/// Circular avatar that previews the picked profile photo (point 3).
class _ProfilePhotoPicker extends StatelessWidget {
  const _ProfilePhotoPicker({required this.file, required this.onTap});
  final File? file;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final has = file != null;
    return GestureDetector(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: t.brandSubtle,
              shape: BoxShape.circle,
              border: Border.all(color: has ? t.brand : t.hairline, width: has ? 2 : 1),
            ),
            child: has
                ? ClipOval(
                    child: Image.file(file!, width: 64, height: 64, fit: BoxFit.cover),
                  )
                : Icon(DhenuIcons.user, size: 30, color: t.brand),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  has ? 'Profile photo added' : 'Add profile photo',
                  style: DhenuText.body.copyWith(color: t.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  has ? 'Tap to change' : 'Take a photo or pick from gallery',
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
              ],
            ),
          ),
          Icon(
            has ? DhenuIcons.edit : DhenuIcons.camera,
            size: 18,
            color: t.inkSoft,
          ),
        ],
      ),
    );
  }
}

class _DocPickerRow extends StatelessWidget {
  const _DocPickerRow({
    required this.label,
    required this.icon,
    required this.file,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final File? file;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final has = file != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(DhenuSpacing.sm),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: has ? t.brand : t.hairline),
        ),
        child: Row(
          children: [
            has
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(file!, width: 40, height: 40, fit: BoxFit.cover),
                  )
                : Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    child: Icon(icon, size: 20, color: t.inkSoft),
                  ),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: Text(
                has ? '$label added' : label,
                style: DhenuText.body.copyWith(color: has ? t.ink : t.inkSoft),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(
              has ? DhenuIcons.edit : DhenuIcons.upload,
              size: 18,
              color: t.inkSoft,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Payment section ──────────────────────────────────────────────────────────

class FarmerPaymentSection extends StatelessWidget {
  const FarmerPaymentSection({
    super.key,
    required this.bankNameCtrl,
    required this.bankAccountNameCtrl,
    required this.bankAccountNumberCtrl,
    required this.bankIfscCtrl,
    required this.upiIdCtrl,
  });

  final TextEditingController bankNameCtrl;
  final TextEditingController bankAccountNameCtrl;
  final TextEditingController bankAccountNumberCtrl;
  final TextEditingController bankIfscCtrl;
  final TextEditingController upiIdCtrl;

  @override
  Widget build(BuildContext context) {
    return FormSectionCard(
      icon: DhenuIcons.payments,
      title: 'Payment',
      children: [
        TextField(
          controller: bankNameCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Bank Name'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: bankAccountNameCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Account Holder Name'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: bankAccountNumberCtrl,
          keyboardType: TextInputType.number,
          textCapitalization: TextCapitalization.none,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(labelText: 'Account Number'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: bankIfscCtrl,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'IFSC Code'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: upiIdCtrl,
          textCapitalization: TextCapitalization.none,
          decoration: const InputDecoration(labelText: 'UPI ID'),
          textInputAction: TextInputAction.done,
        ),
      ],
    );
  }
}
