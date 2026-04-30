import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_card.dart';

/// Read-only view of the signed-in user's profile. Editing is web-only for
/// now (no `/auth/me` PATCH endpoint exposed to mobile), but having this
/// screen lets the user verify whose account is active without bouncing
/// out to the dashboard.
class PersonalInfoScreen extends ConsumerWidget {
  const PersonalInfoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final user = ref.watch(authProvider).user;

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
                        _InfoRow(label: 'Name', value: user?.name ?? '—'),
                        _Divider(),
                        _InfoRow(label: 'Email', value: user?.email ?? '—'),
                        if ((user?.role ?? '').isNotEmpty) ...[
                          _Divider(),
                          _InfoRow(label: 'Role', value: user!.role!),
                        ],
                        if ((user?.tenant ?? '').isNotEmpty) ...[
                          _Divider(),
                          _InfoRow(label: 'Workspace', value: user!.tenant!),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      'Account changes are owner-only and currently managed from the runQ web dashboard. Reach out to support if anything here is wrong.',
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

class _InfoRow extends StatelessWidget {
  final String label, value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: RunqText.body.copyWith(color: t.muted, fontSize: 14)),
          ),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 220),
            child: Text(
              value,
              style: RunqText.body.copyWith(color: t.ink, fontSize: 14, fontWeight: FontWeight.w500),
              maxLines: 2, overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
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
          Expanded(child: Center(child: Text('Personal info', style: RunqText.bodyStrong.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}
