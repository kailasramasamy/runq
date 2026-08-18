// Labour contracts — list.
//
// Each row leads with what the job is and who leads it, then the running
// position: earned so far against advances already handed over. That
// outstanding figure is the number someone on site is actually asking
// about, so it gets the emphasis rather than the contract number.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_contract_models.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_contract_bits.dart';
import 'widgets/hr_contract_form_sheet.dart';
import 'widgets/hr_setup_widgets.dart';
import 'widgets/hr_widgets.dart';

class HrContractsScreen extends ConsumerStatefulWidget {
  const HrContractsScreen({super.key});

  @override
  ConsumerState<HrContractsScreen> createState() => _HrContractsScreenState();
}

class _HrContractsScreenState extends ConsumerState<HrContractsScreen> {
  /// Null means "all"; the API treats an absent status the same way.
  String? _status;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(hrContractsProvider(_status));

    return HrSetupScaffold(
      title: 'Contracts',
      addLabel: 'New contract',
      heroTag: 'add-contract',
      onAdd: _openEditor,
      onRefresh: () => ref.invalidate(hrContractsProvider(_status)),
      body: Column(
        children: [
          _filters(),
          Expanded(
            child: async.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(color: HrColors.teal)),
              error: (e, _) => HrSetupError(error: e),
              data: (rows) {
                if (rows.isEmpty) return _empty();
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(
                      parent: BouncingScrollPhysics()),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                  children: [
                    for (final c in rows)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _ContractCard(
                          contract: c,
                          onTap: () => context.push('/hr/contracts/${c.id}'),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _empty() => HrSetupEmpty(
        icon: Icons.assignment_ind_outlined,
        title: _status == null ? 'No contracts yet' : 'No $_status contracts',
        sub: 'Engage a worker or a crew, track the days worked, pay advances '
            'along the way and settle when the job is done.',
      );

  Widget _filters() {
    // All first and selected by default: a settled contract is still the one
    // people come looking for, and hiding it behind a filter made the list
    // look like work had gone missing.
    const options = <(String?, String)>[
      (null, 'All'),
      ('active', 'Active'),
      ('completed', 'Completed'),
    ];
    return SizedBox(
      height: 46,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        children: [
          for (final (value, label) in options)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _FilterChip(
                label: label,
                selected: _status == value,
                onTap: () => setState(() => _status = value),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _openEditor() async {
    final saved = await showHrContractFormSheet(context);
    if (saved == true) ref.invalidate(hrContractsProvider);
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? HrColors.tealSubtle : t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.chip),
          border: Border.all(
            color: selected ? brand : t.hairline,
            width: selected ? 1.5 : 0.5,
          ),
        ),
        child: Text(
          label,
          style: RunqText.caption.copyWith(
            color: selected ? brand : t.ink,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _ContractCard extends StatelessWidget {
  final HrContract contract;
  final VoidCallback onTap;
  const _ContractCard({required this.contract, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(contract.name,
                            style: RunqText.bodyStrong.copyWith(color: t.ink),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(
                          '${contract.leadPersonName} · ${contract.contractNumber}'
                          '${contract.memberCount > 1 ? ' · ${contract.memberCount} crew' : ''}',
                          style: RunqText.caption.copyWith(color: t.muted),
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  // A paused contract is still active — it just is not
                  // accruing today, which is what the list needs to show.
                  HrContractStatusChip(
                    status: contract.isPausedNow ? 'paused' : contract.status,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  HrContractTypeChip(type: contract.contractType),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      hrContractTerm(contract),
                      style: RunqText.caption.copyWith(color: t.muted),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft),
              const SizedBox(height: 8),
              Row(
                children: [
                  _stat(t, 'Earned', hrFormatINR(contract.earnedToDate)),
                  _stat(t, 'Advances',
                      contract.advancesPaidTotal > 0
                          ? '− ${hrFormatINR(contract.advancesPaidTotal)}'
                          : '—'),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('OUTSTANDING',
                            style: RunqText.micro.copyWith(color: t.muted)),
                        const SizedBox(height: 2),
                        Text(
                          hrFormatINR(contract.outstanding),
                          style: RunqText.bodyStrong.copyWith(
                            color: brand,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stat(RunqTokens t, String label, String value) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: RunqText.micro.copyWith(color: t.muted)),
            const SizedBox(height: 2),
            Text(value,
                style: RunqText.caption.copyWith(
                    color: t.ink, fontWeight: FontWeight.w600),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      );
}
