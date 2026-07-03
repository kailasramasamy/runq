import 'dart:io';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/voice_field.dart';

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
    required this.nameNativeCtrl,
    required this.phoneCtrl,
    this.onNameChanged,
    this.onNativeNameChanged,
    this.onNativeVoiceResult,
  });

  final TextEditingController nameCtrl;
  final TextEditingController nameNativeCtrl;
  final TextEditingController phoneCtrl;
  final ValueChanged<String>? onNameChanged;
  final ValueChanged<String>? onNativeNameChanged;
  /// Called when the operator dictates into the native-name field so the
  /// screen can trigger Latin transliteration if nameCtrl is still untouched.
  final ValueChanged<String>? onNativeVoiceResult;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final isRegionalLocale =
        Localizations.localeOf(context).languageCode != 'en';
    return FormSectionCard(
      icon: DhenuIcons.user,
      title: l.addFarmerSectionBasics,
      children: [
        VoiceField(
          controller: nameCtrl,
          textCapitalization: TextCapitalization.words,
          labelText: l.addFarmerFieldFullName,
          textInputAction: TextInputAction.next,
          onChanged: onNameChanged,
        ),
        if (isRegionalLocale) ...[
          const SizedBox(height: DhenuSpacing.md),
          VoiceField(
            controller: nameNativeCtrl,
            textCapitalization: TextCapitalization.words,
            labelText: l.addFarmerNativeNameLabel,
            hintText: l.addFarmerNativeNameHint,
            textInputAction: TextInputAction.next,
            onChanged: onNativeNameChanged,
            onResult: onNativeVoiceResult,
            transliterateToAppScript: true,
          ),
        ],
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: phoneCtrl,
          keyboardType: TextInputType.phone,
          textCapitalization: TextCapitalization.none,
          inputFormatters: const [
            _DigitsOnlyLastTen(),
          ],
          decoration: InputDecoration(labelText: l.addFarmerFieldPhoneNumber),
          textInputAction: TextInputAction.next,
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
    final l = AppLocalizations.of(context);
    final hasPin = lat != null && lng != null;
    return FormSectionCard(
      icon: DhenuIcons.mapPin,
      title: l.addFarmerSectionLocation,
      children: [
        VoiceField(
          controller: villageCtrl,
          textCapitalization: TextCapitalization.sentences,
          labelText: l.addFarmerFieldVillage,
          textInputAction: TextInputAction.next,
          transliterateToAppScript: true,
        ),
        const SizedBox(height: DhenuSpacing.md),
        VoiceField(
          controller: addressCtrl,
          textCapitalization: TextCapitalization.sentences,
          labelText: l.addFarmerFieldAddress,
          maxLines: 2,
          textInputAction: TextInputAction.newline,
          transliterateToAppScript: true,
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
                ? l.addFarmerGettingLocation
                : hasPin
                    ? '📍 ${lat!.toStringAsFixed(5)}, ${lng!.toStringAsFixed(5)}'
                    : l.addFarmerCaptureGps,
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
    final l = AppLocalizations.of(context);
    return FormSectionCard(
      icon: DhenuIcons.idCard,
      title: l.addFarmerSectionIdentity,
      children: [
        _ProfilePhotoPicker(file: photoFile, onTap: onPickPhoto),
        const SizedBox(height: DhenuSpacing.lg),
        TextField(
          controller: aadhaarCtrl,
          keyboardType: TextInputType.number,
          textCapitalization: TextCapitalization.none,
          maxLength: 12,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            labelText: l.addFarmerFieldAadhaar,
            counterText: '',
          ),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        _DocPickerRow(
          label: l.addFarmerFieldKyc,
          addedLabel: l.addFarmerFieldKycAdded,
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
    final l = AppLocalizations.of(context);
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
                  has ? l.addFarmerPhotoAdded : l.addFarmerPhotoAdd,
                  style: DhenuText.body.copyWith(color: t.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  has ? l.addFarmerPhotoTapToChange : l.addFarmerPhotoHint,
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
    required this.addedLabel,
    required this.icon,
    required this.file,
    required this.onTap,
  });

  final String label;
  final String addedLabel;
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
                has ? addedLabel : label,
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

/// Keeps only digits and trims to the last 10 — so a pasted `+91 98765 43210`
/// (or a `0`-prefixed number) collapses to the bare 10-digit mobile number.
class _DigitsOnlyLastTen extends TextInputFormatter {
  const _DigitsOnlyLastTen();

  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 10) digits = digits.substring(digits.length - 10);
    return TextEditingValue(
      text: digits,
      selection: TextSelection.collapsed(offset: digits.length),
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
    final l = AppLocalizations.of(context);
    return FormSectionCard(
      icon: DhenuIcons.payments,
      title: l.addFarmerSectionPayment,
      children: [
        TextField(
          controller: bankNameCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(labelText: l.addFarmerFieldBankName),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: bankAccountNameCtrl,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(labelText: l.addFarmerFieldAccountHolderName),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: bankAccountNumberCtrl,
          keyboardType: TextInputType.number,
          textCapitalization: TextCapitalization.none,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: l.addFarmerFieldAccountNumber),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: bankIfscCtrl,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(labelText: l.addFarmerFieldIfscCode),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: upiIdCtrl,
          textCapitalization: TextCapitalization.none,
          decoration: InputDecoration(labelText: l.addFarmerFieldUpiId),
          textInputAction: TextInputAction.done,
        ),
      ],
    );
  }
}
