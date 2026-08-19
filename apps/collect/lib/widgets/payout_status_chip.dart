import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// Where a set of payout lines stands, as the farmer and the operator both read
/// it. Shared rather than duplicated: this is a money-facing rule, and the two
/// Payments screens must never disagree about whether a cycle is paid.
enum PayoutStatus {
  /// Every line disbursed (operator mark-paid) or its cycle settled via GL.
  paid,

  /// Locked, awaiting payment.
  processing,

  /// At least one cycle still open.
  pending;

  /// Null when [lines] is empty — status is unknown, so callers show no chip
  /// rather than guessing.
  static PayoutStatus? of(List<MpPayoutLine> lines) {
    if (lines.isEmpty) return null;
    if (lines.every((ln) => ln.isPaid || ln.cycleStatus == 'paid')) return paid;
    if (lines.any((ln) => ln.cycleStatus == 'open')) return pending;
    return processing;
  }

  String label(AppLocalizations l) => switch (this) {
        paid => l.farmerPaymentsPaid,
        processing => l.farmerPaymentsStatusProcessing,
        pending => l.farmerPaymentsStatusPending,
      };

  Color color(DhenuTokens t) => switch (this) {
        paid => t.gradeA,
        processing => t.gradeB,
        pending => t.inkSoft,
      };
}

/// Pill rendering of a [PayoutStatus].
class PayoutStatusChip extends StatelessWidget {
  const PayoutStatusChip({super.key, required this.status});

  final PayoutStatus status;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final color = status.color(t);
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Text(
        status.label(AppLocalizations.of(context)),
        style: DhenuText.caption
            .copyWith(color: color, fontWeight: FontWeight.w700, letterSpacing: 0.8),
      ),
    );
  }
}
