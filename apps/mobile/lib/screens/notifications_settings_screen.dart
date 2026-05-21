import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_card.dart';

/// Read-only summary of where notifications go. Per-channel toggles need a
/// `/notifications/preferences` endpoint that doesn't exist yet — when that
/// lands, swap the static rows for switches backed by a provider.
class NotificationsSettingsScreen extends StatelessWidget {
  const NotificationsSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(),
            Expanded(
              child: ListView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                children: [
                  RunqCard(
                    padding: const EdgeInsets.fromLTRB(0, 4, 0, 4),
                    child: Column(
                      children: [
                        _ChannelRow(
                          icon: Icons.chat_bubble_outline_rounded,
                          tile: const Color(0x3325D366),
                          ink: RunqColors.whatsapp,
                          label: 'WhatsApp',
                          subtitle: 'Reminders, payment alerts, approvals',
                        ),
                        _Divider(),
                        _ChannelRow(
                          icon: Icons.mail_outline_rounded,
                          tile: const Color(0x1A4F46E5),
                          ink: RunqColors.indigo,
                          label: 'Email',
                          subtitle: 'Invoices, receipts, monthly summaries',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      'Both channels are on by default. To pause a channel, reply STOP on WhatsApp or use the unsubscribe link in any email — fine-grained controls land in a future release.',
                      style: RunqText.caption.copyWith(color: t.muted, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      Container(height: 0.5, color: RT(context).hairline, margin: const EdgeInsets.symmetric(horizontal: 16));
}

class _ChannelRow extends StatelessWidget {
  final IconData icon;
  final Color tile, ink;
  final String label, subtitle;
  const _ChannelRow({required this.icon, required this.tile, required this.ink, required this.label, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: tile, borderRadius: BorderRadius.circular(10)),
            alignment: Alignment.center,
            child: Icon(icon, color: ink, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0x3310B981),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              'ON',
              style: RunqText.micro.copyWith(
                color: const Color(0xFF047857),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
            color: t.ink,
          ),
          Expanded(child: Center(child: Text('Notifications', style: RunqText.h2.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}
