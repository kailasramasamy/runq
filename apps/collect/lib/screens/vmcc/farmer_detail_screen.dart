import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import 'add_farmer_herd_section.dart';
import 'add_farmer_screen.dart';
import 'add_farmer_form_sections.dart';
import 'farmer_payments_tab.dart';
import 'farmer_pours_tab.dart';

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
    _tab = TabController(length: 3, vsync: this);
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
    final farmersAsync = ref.watch(nodeFarmersProvider(widget.node.id));
    final farmer = farmersAsync.maybeWhen(
      data: _resolve,
      orElse: () => widget.farmer,
    );

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        title: Text(farmer.name, style: DhenuText.h2.copyWith(color: t.ink)),
        actions: [
          IconButton(
            icon: Icon(DhenuIcons.edit, color: t.brand),
            tooltip: 'Edit farmer',
            onPressed: () => _openEdit(farmer),
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          indicatorColor: t.brand,
          labelColor: t.brand,
          unselectedLabelColor: t.inkSoft,
          labelStyle: DhenuText.label,
          unselectedLabelStyle: DhenuText.label,
          tabs: const [
            Tab(text: 'Details'),
            Tab(text: 'Pours'),
            Tab(text: 'Payments'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _FarmerDetailsTab(farmer: farmer),
          FarmerPoursTab(node: widget.node, farmer: farmer),
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

  String _milkTypeLabel(MilkType m) => switch (m) {
    MilkType.cow => 'Cow',
    MilkType.buffalo => 'Buffalo',
    MilkType.mixed => 'Mixed',
  };

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
        DhenuSpacing.screen,
        DhenuSpacing.lg,
        DhenuSpacing.screen,
        DhenuSpacing.x4,
      ),
      children: [
        _avatarBlock(t),
        const SizedBox(height: DhenuSpacing.lg),
        _contactSection(t),
        const SizedBox(height: DhenuSpacing.md),
        _locationSection(t),
        const SizedBox(height: DhenuSpacing.md),
        _herdSection(t),
        const SizedBox(height: DhenuSpacing.md),
        _identitySection(t),
        const SizedBox(height: DhenuSpacing.md),
        _paymentSection(t),
      ],
    );
  }

  Widget _avatarBlock(DhenuTokens t) {
    return DhenuCard(
      child: Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: t.brandSubtle,
            child: Text(
              farmer.initials,
              style: DhenuText.title.copyWith(color: t.brand),
            ),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  farmer.name,
                  style: DhenuText.title.copyWith(color: t.ink),
                ),
                const SizedBox(height: DhenuSpacing.xs),
                Text(
                  farmer.code,
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
              ],
            ),
          ),
          _statusChip(t),
        ],
      ),
    );
  }

  Widget _statusChip(DhenuTokens t) {
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
        active ? 'Active' : 'Inactive',
        style: DhenuText.caption.copyWith(color: color),
      ),
    );
  }

  Widget _contactSection(DhenuTokens t) {
    final rows = [_row(t, 'Phone', farmer.phone)];
    return _section(
      t,
      icon: DhenuIcons.user,
      title: 'Contact',
      rows: rows,
    );
  }

  Widget _locationSection(DhenuTokens t) {
    final hasGps = farmer.lat != null && farmer.lng != null;
    final rows = [
      _row(t, 'Village', farmer.village),
      _row(t, 'Address', farmer.address),
      if (hasGps)
        _row(
          t,
          'GPS',
          '${farmer.lat!.toStringAsFixed(5)}, ${farmer.lng!.toStringAsFixed(5)}',
        ),
    ];
    return _section(
      t,
      icon: DhenuIcons.mapPin,
      title: 'Location',
      rows: rows,
    );
  }

  Widget _herdSection(DhenuTokens t) {
    final totalCattle =
        farmer.cattleCount ??
        farmer.cattleBreeds.fold<int>(0, (s, b) => s + b.count);
    final rows = [
      _row(t, 'Milk type', _milkTypeLabel(farmer.defaultMilkType)),
      for (final b in farmer.cattleBreeds)
        _row(t, breedLabel(b.breed), '${b.count}'),
      if (totalCattle > 0) _row(t, 'Total cattle', '$totalCattle'),
      if (farmer.inMilkCount != null)
        _row(t, 'Currently milking', '${farmer.inMilkCount}'),
    ];
    return _section(t, icon: DhenuIcons.pets, title: 'Herd', rows: rows);
  }

  Widget _identitySection(DhenuTokens t) {
    final rows = [_row(t, 'Aadhaar', farmer.aadhaar)];
    return _section(
      t,
      icon: DhenuIcons.idCard,
      title: 'Identity',
      rows: rows,
    );
  }

  Widget _paymentSection(DhenuTokens t) {
    final rows = [
      _row(t, 'Bank name', farmer.bankName),
      _row(t, 'Account number', farmer.bankAccountNumber),
      _row(t, 'IFSC', farmer.bankIfsc),
      _row(t, 'UPI ID', farmer.upiId),
    ];
    return _section(
      t,
      icon: DhenuIcons.payments,
      title: 'Payment',
      rows: rows,
    );
  }

  Widget _section(
    DhenuTokens t, {
    required IconData icon,
    required String title,
    required List<Widget?> rows,
  }) {
    final visible = rows.whereType<Widget>().toList();
    final children = visible.isNotEmpty
        ? visible
        : [
            Text(
              'Not provided',
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
