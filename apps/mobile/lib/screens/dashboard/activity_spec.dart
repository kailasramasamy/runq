import 'package:flutter/material.dart';
import '../../api/models.dart';
import '../../theme/runq_tokens.dart';

class ActivitySpec {
  final IconData icon;
  final Color tint;
  final String title;
  final String Function(String when) subtitle;
  ActivitySpec({required this.icon, required this.tint, required this.title, required this.subtitle});
}

ActivitySpec activitySpec(ActivityEntry e) {
  final ref = e.entityRef ?? '';
  final who = e.counterparty ?? 'someone';
  final user = e.userName ?? 'A teammate';
  final type = activityTypeLabel(e.entityType);

  switch (e.action) {
    case 'created':
      return ActivitySpec(
        icon: Icons.add_rounded,
        tint: RunqColors.indigo,
        title: '$type ${ref.isEmpty ? 'created' : '$ref created'}',
        subtitle: (when) => '${who.isEmpty || who == 'someone' ? user : who} · $when',
      );
    case 'updated':
      return ActivitySpec(
        icon: Icons.edit_outlined,
        tint: RunqColors.muted,
        title: '${ref.isEmpty ? type : ref} updated',
        subtitle: (when) => '$user · $when',
      );
    case 'sent':
      return ActivitySpec(
        icon: Icons.send_rounded,
        tint: RunqColors.indigo,
        title: '${ref.isEmpty ? type : ref} sent${who.isNotEmpty && who != 'someone' ? ' to $who' : ''}',
        subtitle: (when) => '$user · $when',
      );
    case 'send_reminder':
      return ActivitySpec(
        icon: Icons.chat_bubble_outline_rounded,
        tint: RunqColors.whatsapp,
        title: 'Reminder for ${ref.isEmpty ? type : ref}',
        subtitle: (when) => '${who.isEmpty || who == 'someone' ? user : 'to $who'} · $when',
      );
    case 'applied':
      return ActivitySpec(
        icon: Icons.payments_outlined,
        tint: RunqColors.greenInk,
        title: 'Payment applied to ${ref.isEmpty ? type : ref}',
        subtitle: (when) => '$user · $when',
      );
    case 'approved':
    case 'approve':
      return ActivitySpec(
        icon: Icons.check_circle_outline_rounded,
        tint: RunqColors.greenInk,
        title: '${ref.isEmpty ? type : ref} approved',
        subtitle: (when) => '$user · $when',
      );
    case 'approval_submitted':
      return ActivitySpec(
        icon: Icons.task_alt_rounded,
        tint: RunqColors.amberInk,
        title: '${ref.isEmpty ? type : ref} submitted for approval',
        subtitle: (when) => '$user · $when',
      );
    case 'rejected':
      return ActivitySpec(
        icon: Icons.cancel_outlined,
        tint: RunqColors.redInk,
        title: '${ref.isEmpty ? type : ref} rejected',
        subtitle: (when) => '$user · $when',
      );
    case 'cancelled':
      return ActivitySpec(
        icon: Icons.block_rounded,
        tint: RunqColors.redInk,
        title: '${ref.isEmpty ? type : ref} cancelled',
        subtitle: (when) => '$user · $when',
      );
    case 'reversed':
      return ActivitySpec(
        icon: Icons.undo_rounded,
        tint: RunqColors.redInk,
        title: '${ref.isEmpty ? type : ref} reversed',
        subtitle: (when) => '$user · $when',
      );
    case 'escalate_to_manager':
      return ActivitySpec(
        icon: Icons.priority_high_rounded,
        tint: RunqColors.amberInk,
        title: '${ref.isEmpty ? type : ref} escalated',
        subtitle: (when) => '$user · $when',
      );
    case 'stop_supply':
      return ActivitySpec(
        icon: Icons.do_not_disturb_alt_rounded,
        tint: RunqColors.redInk,
        title: 'Supply stopped${who.isNotEmpty && who != 'someone' ? ' to $who' : ''}',
        subtitle: (when) => '$user · $when',
      );
    default:
      return ActivitySpec(
        icon: Icons.bolt_rounded,
        tint: RunqColors.muted,
        title: '${e.action} · ${ref.isEmpty ? type : ref}',
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
