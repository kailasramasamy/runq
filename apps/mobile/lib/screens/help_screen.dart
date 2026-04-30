import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/app_info.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';

const String _supportEmail = 'support@runq.in';

/// Lightweight contact screen — no `url_launcher` dependency, so we
/// surface the email address and offer a one-tap clipboard copy. When
/// `url_launcher` is added, swap the copy buttons for `mailto:` launches.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

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
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Need a hand?', style: RunqText.h3.copyWith(fontSize: 16)),
                        const SizedBox(height: 6),
                        Text(
                          'We respond within one business day. Include your invoice/bill number when possible — speeds things up a lot.',
                          style: RunqText.body.copyWith(color: t.muted, fontSize: 13, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  RunqCard(
                    padding: const EdgeInsets.fromLTRB(0, 4, 0, 4),
                    child: Column(
                      children: [
                        _ContactRow(
                          icon: Icons.mail_outline_rounded,
                          tile: const Color(0x1A4F46E5),
                          ink: RunqColors.indigo,
                          label: 'Email support',
                          value: _supportEmail,
                          onTap: () async {
                            await Clipboard.setData(const ClipboardData(text: _supportEmail));
                            if (context.mounted) {
                              showRunqSnack(context, 'Email copied — paste into your mail app',
                                  kind: SnackKind.success);
                            }
                          },
                        ),
                        _Divider(),
                        _ContactRow(
                          icon: Icons.tag_rounded,
                          tile: t.hairlineSoft,
                          ink: t.muted,
                          label: 'App version',
                          value: kAppVersion,
                          onTap: null,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      'Tip: many things — invoices, bills, GST status — are also available as a quick "Ask agent" question on the dashboard.',
                      style: RunqText.caption.copyWith(color: t.muted, fontSize: 12, height: 1.4),
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

class _ContactRow extends StatelessWidget {
  final IconData icon;
  final Color tile, ink;
  final String label, value;
  final VoidCallback? onTap;
  const _ContactRow({
    required this.icon,
    required this.tile,
    required this.ink,
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
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
                  Text(
                    value,
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 12),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            if (onTap != null) Icon(Icons.copy_rounded, color: t.muted2, size: 18),
          ],
        ),
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
          Expanded(child: Center(child: Text('Help & support', style: RunqText.bodyStrong.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}
