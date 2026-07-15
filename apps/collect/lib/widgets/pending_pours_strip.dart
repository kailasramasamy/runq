import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../services/pour_queue.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'dhenu_card.dart';
import 'source_row.dart';

/// Queue-saved pours awaiting sync — rendered as a strip above the recorded
/// list rather than inside [ShiftGroupedPours]: a pending pour has no resolved
/// rate/amount, so mixing it in would corrupt the shift ₹ subtotals.
class PendingPoursStrip extends StatelessWidget {
  const PendingPoursStrip({
    super.key,
    required this.pending,
    required this.farmersById,
    this.onTapPour,
  });

  final List<PendingPour> pending;
  final Map<String, MpFarmer> farmersById;
  final void Function(PendingPour)? onTapPour;

  @override
  Widget build(BuildContext context) {
    if (pending.isEmpty) return const SizedBox.shrink();
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.md),
      child: DhenuCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < pending.length; i++) ...[
              if (i > 0) Divider(height: 1, thickness: 1, color: t.hairline),
              _row(context, t, l, pending[i]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(BuildContext context, DhenuTokens t, AppLocalizations l, PendingPour p) {
    final farmer = farmersById[p.farmerId];
    return SourceRow(
      title: farmer != null ? farmerName(context, farmer) : '—',
      farmer: farmer,
      litres: litres(p.qtyLitres, unit: true),
      trailingStatus: _pill(t, l, p),
      onTap: onTapPour == null ? null : () => onTapPour!(p),
    );
  }

  Widget _pill(DhenuTokens t, AppLocalizations l, PendingPour p) {
    final color = p.hasFailed ? t.gradeC : t.gradeB;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(
        p.hasFailed ? l.pendingFailedPill : l.pendingSavingPill,
        style: DhenuText.caption.copyWith(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}
