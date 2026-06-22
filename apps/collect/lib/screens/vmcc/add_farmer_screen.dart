import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../services/background_removal_service.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/image_source_sheet.dart';
import '../../widgets/primary_action.dart';
import 'add_farmer_form_sections.dart';
import 'add_farmer_herd_section.dart';

class AddFarmerScreen extends ConsumerStatefulWidget {
  const AddFarmerScreen({super.key, this.node, this.existing})
      : assert(
          node != null || existing != null,
          'Pass node to add, or existing to edit',
        );

  /// The VMCC node a new farmer is registered under (add mode).
  final MpNode? node;

  /// The farmer being edited (edit mode); null when adding.
  final MpFarmer? existing;

  bool get isEdit => existing != null;

  @override
  ConsumerState<AddFarmerScreen> createState() => _AddFarmerScreenState();
}

class _AddFarmerScreenState extends ConsumerState<AddFarmerScreen> {
  // Basics
  final _nameCtrl = TextEditingController();
  final _nameNativeCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _nativeEdited = false;
  Timer? _transliterateTimer;
  DateTime? _dob;

  // Location
  final _villageCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  double? _lat, _lng;
  bool _gpsLoading = false;

  // Identity
  final _aadhaarCtrl = TextEditingController();
  File? _photoFile;
  File? _kycFile;

  // Herd
  MilkType _milkType = MilkType.cowA1;
  final List<BreedRow> _breedRows = [];
  final _inMilkCtrl = TextEditingController();

  // Payment
  final _bankNameCtrl = TextEditingController();
  final _bankAccountNameCtrl = TextEditingController();
  final _bankAccountNumberCtrl = TextEditingController();
  final _bankIfscCtrl = TextEditingController();
  final _upiIdCtrl = TextEditingController();

  bool _saving = false;
  String? _scanningSide; // 'front' | 'back' | null
  bool _frontScanned = false;
  bool _backScanned = false;
  String? _nameError;

  @override
  void initState() {
    super.initState();
    final f = widget.existing;
    if (f == null) return;
    _nameCtrl.text = f.name;
    _nameNativeCtrl.text = f.nameNative ?? '';
    if (_nameNativeCtrl.text.isNotEmpty) _nativeEdited = true;
    _phoneCtrl.text = f.phone ?? '';
    _villageCtrl.text = f.village ?? '';
    _addressCtrl.text = f.address ?? '';
    _aadhaarCtrl.text = f.aadhaar ?? '';
    _milkType = f.defaultMilkType;
    _inMilkCtrl.text = f.inMilkCount?.toString() ?? '';
    _lat = f.lat;
    _lng = f.lng;
    for (final b in f.cattleBreeds) {
      _breedRows.add(BreedRow(breed: b.breed)..qtyCtrl.text = b.count.toString());
    }
  }

  void _onNameChanged(String value) {
    if (_nativeEdited) return;
    _transliterateTimer?.cancel();
    final lang = Localizations.localeOf(context).languageCode;
    if (lang == 'en') return;
    _transliterateTimer = Timer(const Duration(milliseconds: 600), () async {
      final trimmed = value.trim();
      if (trimmed.isEmpty) return;
      final suggestion = await mpRepo.transliterateName(trimmed, lang);
      if (!mounted || _nativeEdited || suggestion == null) return;
      setState(() => _nameNativeCtrl.text = suggestion);
    });
  }

  /// Called when the operator dictates into the native-name field.
  /// Fills the Latin name field via romanisation if it hasn't been manually edited.
  void _onNativeVoiceResult(String nativeText) {
    setState(() => _nativeEdited = true);
    final trimmed = nativeText.trim();
    if (trimmed.isEmpty || _nameCtrl.text.trim().isNotEmpty) return;
    mpRepo.transliterateName(trimmed, 'en').then((latin) {
      if (!mounted || latin == null || _nameCtrl.text.trim().isNotEmpty) return;
      setState(() => _nameCtrl.text = latin);
    });
  }

  @override
  void dispose() {
    _transliterateTimer?.cancel();
    _nameCtrl.dispose();
    _nameNativeCtrl.dispose();
    _phoneCtrl.dispose();
    _villageCtrl.dispose();
    _addressCtrl.dispose();
    _aadhaarCtrl.dispose();
    _inMilkCtrl.dispose();
    _bankNameCtrl.dispose();
    _bankAccountNameCtrl.dispose();
    _bankAccountNumberCtrl.dispose();
    _bankIfscCtrl.dispose();
    _upiIdCtrl.dispose();
    for (final r in _breedRows) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 30),
      firstDate: DateTime(1920),
      lastDate: now,
    );
    if (picked != null) setState(() => _dob = picked);
  }

  Future<void> _captureGps() async {
    setState(() => _gpsLoading = true);
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.deniedForever ||
          perm == LocationPermission.denied) {
        if (mounted) {
          showDhenuToast(
            context,
            AppLocalizations.of(context).addFarmerLocationPermissionDenied,
            type: DhenuToastType.error,
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      if (mounted) {
        setState(() {
          _lat = pos.latitude;
          _lng = pos.longitude;
        });
      }
    } catch (e) {
      if (mounted) {
        showDhenuToast(
          context,
          'Could not get location: $e',
          type: DhenuToastType.error,
        );
      }
    } finally {
      if (mounted) setState(() => _gpsLoading = false);
    }
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final src = await showImageSourceSheet(context);
    if (src == null) return;
    final xf = await picker.pickImage(source: src, imageQuality: 85);
    if (xf == null || !mounted) return;
    // Show the raw photo immediately, then swap in the brand-fill cut-out once
    // on-device segmentation finishes (best-effort — keeps the original on fail).
    setState(() => _photoFile = File(xf.path));
    final cut = await BackgroundRemovalService.personOnBrandFill(File(xf.path));
    if (mounted) setState(() => _photoFile = cut);
  }

  Future<void> _pickKyc() async {
    final picker = ImagePicker();
    final xf = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (xf != null && mounted) setState(() => _kycFile = File(xf.path));
  }

  // Aadhaar is two-sided: front carries name/DOB/sex/number, back the address.
  // Each scan overlays only the fields it finds, so the sides merge cleanly.
  Future<void> _scanAadhaar({required bool isBack}) async {
    final src = await showImageSourceSheet(context);
    if (src == null || !mounted) return;
    final picker = ImagePicker();
    final xf = await picker.pickImage(source: src, imageQuality: 90);
    if (xf == null || !mounted) return;
    final l = AppLocalizations.of(context);
    setState(() => _scanningSide = isBack ? 'back' : 'front');
    try {
      final data = await mpRepo.extractAadhaar(File(xf.path));
      if (!mounted) return;
      final allNull = data == null ||
          (data['name'] == null &&
              data['nameNative'] == null &&
              data['aadhaarNumber'] == null &&
              data['dob'] == null &&
              data['village'] == null &&
              data['address'] == null);
      if (allNull) {
        showDhenuToast(context, l.addFarmerScanFailed, type: DhenuToastType.error);
        return;
      }
      setState(() {
        final name = data['name'];
        if (name is String && name.trim().isNotEmpty) {
          _nameCtrl.text = name.trim();
        }
        final nameNative = data['nameNative'];
        if (nameNative is String && nameNative.trim().isNotEmpty) {
          _nameNativeCtrl.text = nameNative.trim();
          _nativeEdited = true;
        }
        final aadhaar = data['aadhaarNumber'];
        if (aadhaar is String && aadhaar.trim().isNotEmpty) {
          _aadhaarCtrl.text = aadhaar.replaceAll(RegExp(r'\D'), '');
        }
        final dobStr = data['dob'];
        if (dobStr is String) {
          final parsed = DateTime.tryParse(dobStr);
          if (parsed != null) _dob = parsed;
        }
        final village = data['village'];
        if (village is String && village.trim().isNotEmpty) {
          _villageCtrl.text = village.trim();
        }
        final address = data['address'];
        if (address is String && address.trim().isNotEmpty) {
          _addressCtrl.text = address.trim();
        }
        if (isBack) {
          _backScanned = true;
        } else {
          _frontScanned = true;
        }
      });
      showDhenuToast(context, l.addFarmerScanFilled, type: DhenuToastType.success);
    } finally {
      if (mounted) setState(() => _scanningSide = null);
    }
  }

  bool _validate() {
    final l = AppLocalizations.of(context);
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _nameError = l.addFarmerNameRequired);
      return false;
    }
    if (_aadhaarCtrl.text.isNotEmpty && _aadhaarCtrl.text.length != 12) {
      showDhenuToast(
        context,
        l.addFarmerAadhaarLength,
        type: DhenuToastType.error,
      );
      return false;
    }
    setState(() => _nameError = null);
    return true;
  }

  Future<void> _save() async {
    if (!_validate()) return;
    setState(() => _saving = true);
    try {
      final body = _buildBody();
      final farmer = widget.isEdit
          ? await mpRepo.updateFarmer(widget.existing!.id, body)
          : await mpRepo.createFarmer(body);
      if (farmer == null) throw Exception('No response from server');
      await _uploadDocs(farmer.id);
      if (!mounted) return;
      final l = AppLocalizations.of(context);
      final nodeId = widget.node?.id ?? widget.existing?.primaryNodeId;
      if (nodeId != null) ref.invalidate(nodeFarmersProvider(nodeId));
      showDhenuToast(
        context,
        widget.isEdit
            ? l.addFarmerUpdatedToast(farmer.name)
            : l.addFarmerRegisteredToast(farmer.name),
        type: DhenuToastType.success,
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        showDhenuToast(context, '$e', type: DhenuToastType.error);
        setState(() => _saving = false);
      }
    }
  }

  Map<String, dynamic> _buildBody() {
    final body = <String, dynamic>{
      'name': _nameCtrl.text.trim(),
      'defaultMilkType': milkTypeToApi(_milkType),
      // Membership only set on registration; an edit keeps the existing node.
      if (!widget.isEdit) 'nodeId': widget.node!.id,
    };
    final nameNative = _nameNativeCtrl.text.trim();
    if (nameNative.isNotEmpty) body['nameNative'] = nameNative;
    if (_phoneCtrl.text.isNotEmpty) body['phone'] = _phoneCtrl.text.trim();
    if (_dob != null) {
      body['dateOfBirth'] =
          '${_dob!.year.toString().padLeft(4, '0')}-${_dob!.month.toString().padLeft(2, '0')}-${_dob!.day.toString().padLeft(2, '0')}';
    }
    if (_villageCtrl.text.isNotEmpty) {
      body['village'] = _villageCtrl.text.trim();
    }
    if (_addressCtrl.text.isNotEmpty) {
      body['address'] = _addressCtrl.text.trim();
    }
    if (_aadhaarCtrl.text.isNotEmpty) {
      body['aadhaar'] = _aadhaarCtrl.text.trim();
    }
    if (_lat != null) { body['lat'] = _lat; }
    if (_lng != null) { body['lng'] = _lng; }
    final breeds = _breedRows
        .where((r) => r.count > 0)
        .map((r) => {'breed': r.breed, 'count': r.count})
        .toList();
    if (breeds.isNotEmpty) { body['cattleBreeds'] = breeds; }
    final inMilk = int.tryParse(_inMilkCtrl.text);
    if (inMilk != null) { body['inMilkCount'] = inMilk; }
    if (_bankNameCtrl.text.isNotEmpty) {
      body['bankName'] = _bankNameCtrl.text.trim();
    }
    if (_bankAccountNameCtrl.text.isNotEmpty) {
      body['bankAccountName'] = _bankAccountNameCtrl.text.trim();
    }
    if (_bankAccountNumberCtrl.text.isNotEmpty) {
      body['bankAccountNumber'] = _bankAccountNumberCtrl.text.trim();
    }
    if (_bankIfscCtrl.text.isNotEmpty) {
      body['bankIfsc'] = _bankIfscCtrl.text.trim().toUpperCase();
    }
    if (_upiIdCtrl.text.isNotEmpty) { body['upiId'] = _upiIdCtrl.text.trim(); }
    return body;
  }

  Future<void> _uploadDocs(String farmerId) async {
    if (_photoFile != null) {
      await mpRepo.uploadFarmerDoc(
        farmerId,
        _photoFile!,
        kind: 'profile_photo',
      );
    }
    if (_kycFile != null) {
      await mpRepo.uploadFarmerDoc(farmerId, _kycFile!, kind: 'kyc');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final keyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(
          widget.isEdit ? l.addFarmerEditTitle : l.addFarmerAddTitle,
          style: DhenuText.h2.copyWith(color: t.ink),
        ),
      ),
      // Column + Expanded keeps the scroll area resized above the keyboard so
      // the focused field auto-scrolls into view (point 1); the footer hides
      // while typing to give the fields the full height.
      body: Column(
        children: [
          Expanded(child: _form(t)),
          if (!keyboardOpen) _footer(t),
        ],
      ),
    );
  }

  Widget _form(DhenuTokens t) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.fromLTRB(
        DhenuSpacing.screen,
        DhenuSpacing.lg,
        DhenuSpacing.screen,
        DhenuSpacing.xl + MediaQuery.of(context).viewInsets.bottom,
      ),
      children: [
        _ScanAadhaarBanner(
          scanningSide: _scanningSide,
          frontScanned: _frontScanned,
          backScanned: _backScanned,
          onScanFront: _scanningSide != null ? null : () => _scanAadhaar(isBack: false),
          onScanBack: _scanningSide != null ? null : () => _scanAadhaar(isBack: true),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        FarmerBasicsSection(
          nameCtrl: _nameCtrl,
          nameNativeCtrl: _nameNativeCtrl,
          phoneCtrl: _phoneCtrl,
          dob: _dob,
          onPickDob: _dob != null ? () => setState(() => _dob = null) : _pickDob,
          onNameChanged: _onNameChanged,
          onNativeNameChanged: (_) => setState(() => _nativeEdited = true),
          onNativeVoiceResult: _onNativeVoiceResult,
        ),
        if (_nameError != null) ...[
          const SizedBox(height: DhenuSpacing.xs),
          Text(_nameError!, style: DhenuText.caption.copyWith(color: t.gradeC)),
        ],
        const SizedBox(height: DhenuSpacing.lg),
        FarmerLocationSection(
          villageCtrl: _villageCtrl,
          addressCtrl: _addressCtrl,
          lat: _lat,
          lng: _lng,
          gpsLoading: _gpsLoading,
          onCaptureGps: _captureGps,
        ),
        const SizedBox(height: DhenuSpacing.lg),
        FarmerIdentitySection(
          aadhaarCtrl: _aadhaarCtrl,
          photoFile: _photoFile,
          kycFile: _kycFile,
          onPickPhoto: _pickPhoto,
          onPickKyc: _pickKyc,
        ),
        const SizedBox(height: DhenuSpacing.lg),
        FarmerHerdSection(
          milkType: _milkType,
          onMilkTypeChanged: (m) => setState(() => _milkType = m),
          breedRows: _breedRows,
          inMilkCtrl: _inMilkCtrl,
          onAddBreed: () => setState(() => _breedRows.add(BreedRow(breed: 'desi_natti'))),
          onRemoveBreed: (i) => setState(() => _breedRows.removeAt(i).dispose()),
          onBreedChanged: (i, b) => setState(() => _breedRows[i].breed = b),
          onQtyChanged: () => setState(() {}),
        ),
        // Bank / UPI payout details are managed on the web (owner/accountant);
        // mobile registration captures them once, edits happen there.
        if (!widget.isEdit) ...[
          const SizedBox(height: DhenuSpacing.lg),
          FarmerPaymentSection(
            bankNameCtrl: _bankNameCtrl,
            bankAccountNameCtrl: _bankAccountNameCtrl,
            bankAccountNumberCtrl: _bankAccountNumberCtrl,
            bankIfscCtrl: _bankIfscCtrl,
            upiIdCtrl: _upiIdCtrl,
          ),
        ],
      ],
    );
  }

  Widget _footer(DhenuTokens t) {
    final l = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(DhenuSpacing.screen),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline)),
      ),
      child: SafeArea(
        top: false,
        child: PrimaryAction(
          label: widget.isEdit ? l.addFarmerSaveChanges : l.addFarmerRegisterFarmer,
          icon: widget.isEdit ? DhenuIcons.check : DhenuIcons.userPlus,
          loading: _saving,
          onPressed: _saving ? null : _save,
        ),
      ),
    );
  }
}

// ── Scan Aadhaar banner ───────────────────────────────────────────────────────

class _ScanAadhaarBanner extends StatelessWidget {
  const _ScanAadhaarBanner({
    required this.scanningSide,
    required this.frontScanned,
    required this.backScanned,
    required this.onScanFront,
    required this.onScanBack,
  });
  final String? scanningSide; // 'front' | 'back' | null
  final bool frontScanned;
  final bool backScanned;
  final VoidCallback? onScanFront;
  final VoidCallback? onScanBack;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return DhenuCard(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.lg,
        vertical: DhenuSpacing.md,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(DhenuIcons.scanDoc, size: 18, color: t.brand),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(l.addFarmerScanAadhaar,
                style: DhenuText.label.copyWith(color: t.ink)),
          ),
        ]),
        const SizedBox(height: DhenuSpacing.md),
        Row(children: [
          Expanded(
            child: _SideTile(
              label: l.addFarmerScanFront,
              hint: l.addFarmerScanFrontHint,
              done: frontScanned,
              busy: scanningSide == 'front',
              onTap: onScanFront,
            ),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: _SideTile(
              label: l.addFarmerScanBack,
              hint: l.addFarmerScanBackHint,
              done: backScanned,
              busy: scanningSide == 'back',
              onTap: onScanBack,
            ),
          ),
        ]),
      ]),
    );
  }
}

class _SideTile extends StatelessWidget {
  const _SideTile({
    required this.label,
    required this.hint,
    required this.done,
    required this.busy,
    required this.onTap,
  });
  final String label, hint;
  final bool done, busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(DhenuRadii.input),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
        decoration: BoxDecoration(
          color: done ? t.brandSubtle : Colors.transparent,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: done ? t.brand : t.hairline),
        ),
        child: Row(children: [
          SizedBox(
            width: 20,
            height: 20,
            child: busy
                ? CircularProgressIndicator(strokeWidth: 2, color: t.brand)
                : Icon(done ? Icons.check_circle : Icons.camera_alt_outlined,
                    size: 20, color: t.brand),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: DhenuText.label.copyWith(color: t.ink)),
              Text(hint,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// A large camera/gallery choice tile for the image-source sheet.
