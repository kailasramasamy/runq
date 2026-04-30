import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'runq_snack.dart';

enum ReminderChannel { email, whatsapp }

/// Reports the outcome of `dunningRepo.sendReminders`. The API now queues
/// delivery and returns immediately, so a successful response means "queued",
/// not "delivered". Actual send results land on the dunning_log row later
/// and can be inspected in the dunning history.
void reportReminderOutcome(BuildContext context, ReminderChannelChoice choice) {
  final parts = <String>[
    if (choice.hasEmail) 'Email',
    if (choice.hasWhatsapp) 'WhatsApp',
  ];
  if (parts.isEmpty) return;
  final label = parts.length == 2 ? '${parts[0]} + ${parts[1]}' : parts.first;
  showRunqSnack(context, '$label reminder queued for delivery',
      kind: SnackKind.success);
}

/// User's pick from the reminder channel sheet — one or both channels.
class ReminderChannelChoice {
  final Set<ReminderChannel> channels;
  const ReminderChannelChoice(this.channels);
  bool get hasEmail => channels.contains(ReminderChannel.email);
  bool get hasWhatsapp => channels.contains(ReminderChannel.whatsapp);
}

/// Bottom sheet asking how to deliver a payment reminder. Each option shows
/// the resolved contact under the label; options are disabled when the
/// customer has no email/phone on file. Returns the picked channels or null
/// if the user cancels.
Future<ReminderChannelChoice?> showReminderChannelSheet(
  BuildContext context, {
  required String? customerEmail,
  required String? customerPhone,
}) {
  return showModalBottomSheet<ReminderChannelChoice>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ReminderChannelSheet(
      customerEmail: customerEmail,
      customerPhone: customerPhone,
    ),
  );
}

class _ReminderChannelSheet extends StatelessWidget {
  final String? customerEmail;
  final String? customerPhone;
  const _ReminderChannelSheet({
    required this.customerEmail,
    required this.customerPhone,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final hasEmail = customerEmail != null && customerEmail!.trim().isNotEmpty;
    final hasPhone = customerPhone != null && customerPhone!.trim().isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.sheet,
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text('Send reminder', style: RunqText.h3.copyWith(color: t.ink)),
              const SizedBox(height: 4),
              Text('How should we reach the customer?',
                  style: RunqText.caption.copyWith(color: t.muted)),
              const SizedBox(height: 14),
              _ChannelTile(
                icon: Icons.email_rounded,
                label: 'Email',
                contact: hasEmail ? customerEmail! : 'No email on file',
                enabled: hasEmail,
                onTap: () => Navigator.of(context).pop(
                  const ReminderChannelChoice({ReminderChannel.email}),
                ),
              ),
              const SizedBox(height: 8),
              _ChannelTile(
                icon: Icons.chat_bubble_rounded,
                label: 'WhatsApp',
                contact: hasPhone ? customerPhone! : 'No phone on file',
                enabled: hasPhone,
                onTap: () => Navigator.of(context).pop(
                  const ReminderChannelChoice({ReminderChannel.whatsapp}),
                ),
              ),
              const SizedBox(height: 8),
              _ChannelTile(
                icon: Icons.send_rounded,
                label: 'Both',
                contact: hasEmail && hasPhone
                    ? 'Email + WhatsApp'
                    : 'Needs both email and phone on file',
                enabled: hasEmail && hasPhone,
                onTap: () => Navigator.of(context).pop(
                  const ReminderChannelChoice({
                    ReminderChannel.email,
                    ReminderChannel.whatsapp,
                  }),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChannelTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String contact;
  final bool enabled;
  final VoidCallback onTap;
  const _ChannelTile({
    required this.icon,
    required this.label,
    required this.contact,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inkColor = enabled ? t.ink : t.muted2;
    return Opacity(
      opacity: enabled ? 1.0 : 0.5,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: Border.all(color: t.hairline, width: 0.5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: t.brandSubtle,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: t.brand, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label,
                          style: RunqText.bodyStrong.copyWith(color: inkColor)),
                      const SizedBox(height: 2),
                      Text(contact,
                          style: RunqText.caption.copyWith(color: t.muted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                if (enabled)
                  Icon(Icons.chevron_right_rounded,
                      color: t.muted2, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
