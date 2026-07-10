import 'package:flutter/material.dart';
import '../../api/models.dart';
import '../../theme/runq_tokens.dart';

class ActivitySpec {
  final IconData icon;
  final Color tint;
  final String title;
  final String? statusLabel;
  final String Function(String when) subtitle;
  ActivitySpec({
    required this.icon,
    required this.tint,
    required this.title,
    required this.subtitle,
    this.statusLabel,
  });
}

/// Route to open for an activity entry, or null when the entity has no
/// mobile detail screen (payment / receipt / credit_note / debit_note). Rows
/// with no route render non-tappable rather than showing a dead ripple.
String? activityRoute(ActivityEntry e) {
  switch (e.entityType) {
    case 'sales_invoice':
      return '/invoices/${e.entityId}';
    case 'purchase_invoice':
      return '/bills/${e.entityId}';
    case 'bank_transaction':
      return '/banking';
    default:
      return null;
  }
}

ActivitySpec activitySpec(ActivityEntry e) {
  final ref = e.entityRef ?? '';
  final who = e.counterparty ?? 'someone';
  final user = e.userName ?? 'A teammate';
  final type = activityTypeLabel(e.entityType);
  final entity = ref.isEmpty ? type : '$type $ref';

  switch (e.action) {
    case 'created':
      return ActivitySpec(
        icon: Icons.add_rounded,
        tint: RunqColors.indigo,
        title: entity,
        statusLabel: 'Created',
        subtitle: (when) => '${who.isEmpty || who == 'someone' ? user : who} · $when',
      );
    case 'updated':
      return ActivitySpec(
        icon: Icons.edit_outlined,
        tint: RunqColors.muted,
        title: entity,
        statusLabel: 'Updated',
        subtitle: (when) => '$user · $when',
      );
    case 'sent':
      return ActivitySpec(
        icon: Icons.send_rounded,
        tint: RunqColors.indigo,
        title: entity,
        statusLabel: 'Sent',
        subtitle: (when) =>
            who.isNotEmpty && who != 'someone' ? 'to $who · $when' : '$user · $when',
      );
    case 'send_reminder':
      return ActivitySpec(
        icon: Icons.chat_bubble_outline_rounded,
        tint: RunqColors.whatsapp,
        title: entity,
        statusLabel: 'Reminder',
        subtitle: (when) =>
            who.isNotEmpty && who != 'someone' ? 'to $who · $when' : '$user · $when',
      );
    case 'applied':
      return ActivitySpec(
        icon: Icons.payments_outlined,
        tint: RunqColors.greenInk,
        title: entity,
        statusLabel: 'Paid',
        subtitle: (when) =>
            who.isNotEmpty && who != 'someone' ? 'to $who · $when' : '$user · $when',
      );
    case 'approved':
    case 'approve':
      return ActivitySpec(
        icon: Icons.check_circle_outline_rounded,
        tint: RunqColors.greenInk,
        title: entity,
        statusLabel: 'Approved',
        subtitle: (when) => '$user · $when',
      );
    case 'approval_submitted':
      return ActivitySpec(
        icon: Icons.task_alt_rounded,
        tint: RunqColors.amberInk,
        title: entity,
        statusLabel: 'Submitted',
        subtitle: (when) => '$user · $when',
      );
    case 'rejected':
      return ActivitySpec(
        icon: Icons.cancel_outlined,
        tint: RunqColors.redInk,
        title: entity,
        statusLabel: 'Rejected',
        subtitle: (when) => '$user · $when',
      );
    case 'cancelled':
      return ActivitySpec(
        icon: Icons.block_rounded,
        tint: RunqColors.redInk,
        title: entity,
        statusLabel: 'Cancelled',
        subtitle: (when) => '$user · $when',
      );
    case 'reversed':
      return ActivitySpec(
        icon: Icons.undo_rounded,
        tint: RunqColors.redInk,
        title: entity,
        statusLabel: 'Reversed',
        subtitle: (when) => '$user · $when',
      );
    case 'escalate_to_manager':
      return ActivitySpec(
        icon: Icons.priority_high_rounded,
        tint: RunqColors.amberInk,
        title: entity,
        statusLabel: 'Escalated',
        subtitle: (when) => '$user · $when',
      );
    case 'stop_supply':
      return ActivitySpec(
        icon: Icons.do_not_disturb_alt_rounded,
        tint: RunqColors.redInk,
        title: who.isNotEmpty && who != 'someone' ? who : entity,
        statusLabel: 'Supply stopped',
        subtitle: (when) => '$user · $when',
      );
    default:
      return ActivitySpec(
        icon: Icons.bolt_rounded,
        tint: RunqColors.muted,
        title: entity,
        statusLabel: e.action.replaceAll('_', ' '),
        subtitle: (when) => '$user · $when',
      );
  }
}

String activityTypeLabel(String t) => switch (t) {
      'sales_invoice' => 'Invoice',
      'purchase_invoice' => 'Bill',
      'payment' => 'Payment',
      'receipt' => 'Receipt',
      'credit_note' => 'Credit note',
      'debit_note' => 'Debit note',
      'bank_transaction' => 'Bank txn',
      'po_upload' => 'PO',
      _ => t.replaceAll('_', ' '),
    };
