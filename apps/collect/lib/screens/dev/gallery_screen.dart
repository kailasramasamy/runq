import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_tokens.dart';
import '../../theme/dhenu_theme.dart';
import '../../api/mp_models.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/shift_toggle.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/source_row.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/sync_status.dart';
import '../../widgets/tank_gauge.dart';
import '../../widgets/language_toggle.dart';
import '../../widgets/audio_play.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_card.dart';

/// Dev-only visual QA surface — renders every component (§3) so we can eyeball
/// light + dark. Not part of any production nav.
class GalleryScreen extends StatefulWidget {
  const GalleryScreen({super.key});
  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  Shift _shift = Shift.am;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dhenu Gallery'),
        actions: [
          LanguageToggle(currentLabel: 'EN', onTap: () {}),
          const SizedBox(width: DhenuSpacing.sm),
          AudioPlay(onTap: () {}),
          const SizedBox(width: DhenuSpacing.sm),
        ],
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        children: [
          _section('SyncStatus'),
          Wrap(spacing: DhenuSpacing.sm, runSpacing: DhenuSpacing.sm, children: [
            SyncStatus(state: SyncState.synced, agoLabel: '2m ago', onTap: () {}),
            SyncStatus(state: SyncState.pending, pendingCount: 3, onTap: () {}),
            SyncStatus(state: SyncState.offline, onTap: () {}),
          ]),
          _section('HeroNumberCard'),
          const HeroNumberCard(
            label: 'THIS CYCLE',
            primaryValue: '142.5 L',
            secondaryValue: '₹ 6,840',
            delta: '▲ 8% vs last cycle',
          ),
          _section('ShiftToggle'),
          ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s)),
          _section('QualityBadge'),
          Wrap(spacing: DhenuSpacing.sm, runSpacing: DhenuSpacing.sm, children: const [
            QualityBadge(fat: 4.2, snf: 8.6, grade: Grade.a),
            QualityBadge(fat: 3.6, snf: 8.1, grade: Grade.b),
            QualityBadge(fat: 3.0, snf: 7.8, grade: Grade.c),
            QualityBadge(fat: 4.2, snf: 8.6, grade: Grade.a, compact: true),
          ]),
          _section('SourceRow / FarmerRow'),
          Container(
            decoration: BoxDecoration(color: t.card, borderRadius: BorderRadius.circular(DhenuRadii.card)),
            child: Column(children: [
              SourceRow(
                title: 'Ramesh Patel',
                leadingInitials: 'RP',
                litres: '7.5L',
                quality: const QualityBadge(fat: 4.2, snf: 8.6, grade: Grade.a, compact: true),
                amount: '₹360',
                onTap: () {},
              ),
              Divider(height: 1, color: t.hairline),
              SourceRow(
                title: 'Kadod VMCC',
                litres: '428L',
                trailingStatus: Text('✓ received', style: DhenuText.caption.copyWith(color: t.gradeA)),
                onTap: () {},
              ),
            ]),
          ),
          _section('TankGauge'),
          const TankGauge(current: 428, capacity: 1000, label: 'BMC tank'),
          const SizedBox(height: DhenuSpacing.md),
          const TankGauge(current: 5200, capacity: 5000, label: 'Chilling (overflow)'),
          _section('States'),
          const DhenuOfflineBanner(),
          const SizedBox(height: DhenuSpacing.md),
          const DhenuLoadingList(rows: 3),
          const SizedBox(height: DhenuSpacing.md),
          const DhenuEmptyState(
            icon: DhenuIcons.drop,
            title: 'No collection yet today',
            subtitle: 'Tap Record Collection to start',
          ),
          _section('DhenuCard'),
          const DhenuCard(child: Text('Standard card — hairline border, soft rounding.')),
          const SizedBox(height: DhenuSpacing.md),
          const DhenuCard(
            elevated: true,
            child: Text('Elevated card — adds the soft ambient shadow.'),
          ),
          _section('Form fields (themed InputDecoration)'),
          const DhenuCard(
            child: Column(children: [
              TextField(decoration: InputDecoration(labelText: 'Farmer name', hintText: 'e.g. Ramesh Patel')),
              SizedBox(height: DhenuSpacing.md),
              Row(children: [
                Expanded(child: TextField(
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'Litres', suffixText: 'L'),
                )),
                SizedBox(width: DhenuSpacing.md),
                Expanded(child: TextField(
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'FAT', suffixText: '%'),
                )),
              ]),
              SizedBox(height: DhenuSpacing.md),
              TextField(decoration: InputDecoration(
                labelText: 'Phone',
                prefixIcon: Icon(DhenuIcons.phone),
                errorText: 'Enter a 10-digit number',
              )),
            ]),
          ),
          const SizedBox(height: DhenuSpacing.bottomGap),
        ],
      ),
      bottomSheet: Padding(
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        child: PrimaryAction(label: 'Record Collection', onPressed: () {}),
      ),
    );
  }

  Widget _section(String label) => Padding(
        padding: const EdgeInsets.only(top: DhenuSpacing.xxl, bottom: DhenuSpacing.sm),
        child: Text(label, style: DhenuText.label.copyWith(color: DT(context).inkSoft)),
      );
}
