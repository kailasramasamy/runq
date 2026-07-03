import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/farmer_avatar.dart';
import '../../widgets/farmer_photo_viewer.dart';
import 'add_farmer_herd_section.dart';
import 'add_farmer_screen.dart';
import 'add_farmer_form_sections.dart';
import 'farmer_payments_tab.dart';
import 'farmer_pours_tab.dart';
import 'farmer_qc_tab.dart';

class FarmerDetailScreen extends ConsumerStatefulWidget {
  const FarmerDetailScreen({
    super.key,
    required this.node,
    required this.farmer,
  });

  final MpNode node;
  final MpFarmer farmer;

  @override
  ConsumerState<FarmerDetailScreen> createState() => _FarmerDetailScreenState();
}

class _FarmerDetailScreenState extends ConsumerState<FarmerDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  MpFarmer _resolve(List<MpFarmer> farmers) => farmers.firstWhere(
    (f) => f.id == widget.farmer.id,
    orElse: () => widget.farmer,
  );

  void _openEdit(MpFarmer farmer) {
    Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => AddFarmerScreen(existing: farmer)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final farmersAsync = ref.watch(nodeFarmersProvider(widget.node.id));
    final farmer = farmersAsync.maybeWhen(
      data: _resolve,
      orElse: () => widget.farmer,
    );

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(farmerName(context, farmer),
            style: DhenuText.h2
                .copyWith(fontSize: 19, fontWeight: FontWeight.w800, color: t.ink, letterSpacing: -0.19)),
        actions: [
          IconButton(
            icon: Icon(DhenuIcons.edit, color: t.brand),
            tooltip: l.farmerDetailEditTooltip,
            onPressed: () => _openEdit(farmer),
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          indicatorColor: DhenuColors.accent,
          indicatorWeight: 2.5,
          indicatorSize: TabBarIndicatorSize.tab,
          labelColor: t.brand,
          unselectedLabelColor: t.inkSoft,
          labelStyle: DhenuText.label.copyWith(fontSize: 14.5, fontWeight: FontWeight.w700),
          unselectedLabelStyle: DhenuText.label.copyWith(fontSize: 14.5, fontWeight: FontWeight.w600),
          tabs: [
            Tab(text: l.farmerDetailTabDetails),
            Tab(text: l.farmerDetailTabPours),
            Tab(text: l.reportsTabQc),
            Tab(text: l.farmerDetailTabPayments),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _FarmerDetailsTab(farmer: farmer),
          FarmerPoursTab(node: widget.node, farmer: farmer),
          FarmerQcTab(node: widget.node, farmer: farmer),
          FarmerPaymentsTab(farmer: farmer),
        ],
      ),
    );
  }
}

// ── Details tab ───────────────────────────────────────────────────────────────

class _FarmerDetailsTab extends StatelessWidget {
  const _FarmerDetailsTab({required this.farmer});

  final MpFarmer farmer;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
        DhenuSpacing.screen,
        DhenuSpacing.lg,
        DhenuSpacing.screen,
        DhenuSpacing.x4,
      ),
      children: [
        _avatarBlock(context, t, l),
        const SizedBox(height: DhenuSpacing.lg),
        _contactSection(t, l),
        const SizedBox(height: DhenuSpacing.md),
        _locationSection(t, l),
        const SizedBox(height: DhenuSpacing.md),
        _herdSection(t, l),
        const SizedBox(height: DhenuSpacing.md),
        _identitySection(t, l),
        const SizedBox(height: DhenuSpacing.md),
        _paymentSection(t, l),
      ],
    );
  }

  Widget _avatarBlock(BuildContext context, DhenuTokens t, AppLocalizations l) {
    final display = farmerName(context, farmer);
    final showLatinBelow = display != farmer.name;
    return DhenuCard(
      child: Row(
        children: [
          FarmerAvatar(
            farmer: farmer,
            radius: 28,
            onTap: farmer.hasPhoto
                ? () => showFarmerPhoto(context, farmer)
                : null,
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  display,
                  style: DhenuText.title.copyWith(color: t.ink),
                ),
                const SizedBox(height: DhenuSpacing.xs),
                if (showLatinBelow)
                  Text(
                    farmer.name,
                    style: DhenuText.caption.copyWith(color: t.inkSoft),
                  )
                else
                  Text(
                    farmer.code,
                    style: DhenuText.caption.copyWith(color: t.inkSoft),
                  ),
              ],
            ),
          ),
          _statusChip(t, l),
        ],
      ),
    );
  }

  Widget _statusChip(DhenuTokens t, AppLocalizations l) {
    final active = farmer.isActive;
    final color = active ? t.gradeA : t.inkSoft;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: DhenuSpacing.sm,
        vertical: DhenuSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(
        active ? l.farmerDetailStatusActive : l.farmerDetailStatusInactive,
        style: DhenuText.caption.copyWith(color: color),
      ),
    );
  }

  Widget _contactSection(DhenuTokens t, AppLocalizations l) {
    final rows = [_row(t, l.farmerDetailPhone, farmer.phone)];
    return _section(
      t,
      l,
      icon: DhenuIcons.user,
      title: l.farmerDetailContact,
      rows: rows,
    );
  }

  Widget _locationSection(DhenuTokens t, AppLocalizations l) {
    final hasGps = farmer.lat != null && farmer.lng != null;
    final rows = [
      _row(t, l.farmerDetailVillage, farmer.village),
      _row(t, l.farmerDetailAddress, farmer.address),
      if (hasGps)
        _row(
          t,
          l.farmerDetailGps,
          '${farmer.lat!.toStringAsFixed(5)}, ${farmer.lng!.toStringAsFixed(5)}',
        ),
    ];
    return _section(
      t,
      l,
      icon: DhenuIcons.mapPin,
      title: l.farmerDetailLocation,
      rows: rows,
    );
  }

  Widget _herdSection(DhenuTokens t, AppLocalizations l) {
    final totalCattle =
        farmer.cattleCount ??
        farmer.cattleBreeds.fold<int>(0, (s, b) => s + b.count);
    final rows = [
      _row(t, l.commonMilkType, milkTypeL10n(l, farmer.defaultMilkType)),
      for (final b in farmer.cattleBreeds)
        _row(t, breedLabel(b.breed), '${b.count}'),
      if (totalCattle > 0) _row(t, l.farmerDetailTotalCattle, '$totalCattle'),
      if (farmer.inMilkCount != null)
        _row(t, l.farmerDetailCurrentlyMilking, '${farmer.inMilkCount}'),
    ];
    return _section(t, l, icon: DhenuIcons.pets, title: l.farmerDetailHerd, rows: rows);
  }

  Widget _identitySection(DhenuTokens t, AppLocalizations l) {
    final rows = [_row(t, l.farmerDetailAadhaar, farmer.aadhaar)];
    return _section(
      t,
      l,
      icon: DhenuIcons.idCard,
      title: l.farmerDetailIdentity,
      rows: rows,
    );
  }

  Widget _paymentSection(DhenuTokens t, AppLocalizations l) {
    final rows = [
      _row(t, l.farmerDetailBankName, farmer.bankName),
      _row(t, l.farmerDetailAccountNumber, farmer.bankAccountNumber),
      _row(t, l.farmerDetailIfsc, farmer.bankIfsc),
      _row(t, l.farmerDetailUpiId, farmer.upiId),
    ];
    return _section(
      t,
      l,
      icon: DhenuIcons.payments,
      title: l.farmerDetailPayment,
      rows: rows,
    );
  }

  Widget _section(
    DhenuTokens t,
    AppLocalizations l, {
    required IconData icon,
    required String title,
    required List<Widget?> rows,
  }) {
    final visible = rows.whereType<Widget>().toList();
    final children = visible.isNotEmpty
        ? visible
        : [
            Text(
              l.farmerDetailNotProvided,
              style: DhenuText.body.copyWith(color: t.inkSoft),
            ),
          ];
    return FormSectionCard(icon: icon, title: title, children: children);
  }

  Widget? _row(DhenuTokens t, String label, String? value) {
    if (value == null || value.isEmpty) return null;
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: DhenuText.caption.copyWith(color: t.inkSoft),
            ),
          ),
          Expanded(
            child: Text(value, style: DhenuText.body.copyWith(color: t.ink)),
          ),
        ],
      ),
    );
  }
}
