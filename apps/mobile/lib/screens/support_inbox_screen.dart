// User-side support inbox — lists this user's conversations with status
// badges. Tap a row to open the chat for that conversation.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/repos.dart';
import '../providers/auth_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

class SupportInboxScreen extends ConsumerStatefulWidget {
  const SupportInboxScreen({super.key});

  @override
  ConsumerState<SupportInboxScreen> createState() => _SupportInboxScreenState();
}

class _SupportInboxScreenState extends ConsumerState<SupportInboxScreen> {
  List<SupportConversationSummary> _conversations = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = ref.read(authProvider).token;
    if (token == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final list = await supportRepo.list(token: token);
      if (!mounted) return;
      setState(() {
        _conversations = list;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Failed to load — pull to retry';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final open = _conversations.where((c) =>
        c.status == 'open' || c.status == 'agent_replied' || c.status == 'waiting_human').toList();
    final past = _conversations.where((c) =>
        c.status == 'resolved' || c.status == 'closed').toList();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(),
            Expanded(
              child: RefreshIndicator(
                color: RunqColors.indigo,
                onRefresh: _load,
                child: _loading && _conversations.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : _conversations.isEmpty
                        ? _EmptyState(onStart: () => context.push('/profile/help?new=1'))
                        : ListView(
                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                            children: [
                              if (_error != null)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  child: Text(_error!, style: RunqText.caption.copyWith(color: t.muted)),
                                ),
                              _MiniStatsRow(
                                open: open.length,
                                waiting: _conversations.where((c) => c.status == 'waiting_human').length,
                                resolved: past.length,
                              ),
                              const SizedBox(height: 12),
                              if (open.isNotEmpty) ...[
                                _SectionLabel('Open'),
                                for (final c in open) _ConversationRow(conv: c),
                                const SizedBox(height: 12),
                              ],
                              if (past.isNotEmpty) ...[
                                _SectionLabel('Past'),
                                for (final c in past) _ConversationRow(conv: c),
                              ],
                            ],
                          ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: RunqColors.indigo,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/profile/help?new=1'),
        icon: const Icon(Icons.add_comment_outlined, size: 18),
        label: Text('New conversation', style: RunqText.bodyStrong),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
            color: t.ink,
          ),
          Expanded(child: Center(child: Text('My support', style: RunqText.h2.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class _MiniStatsRow extends StatelessWidget {
  final int open, waiting, resolved;
  const _MiniStatsRow({required this.open, required this.waiting, required this.resolved});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: _MiniStat(label: 'OPEN', value: open, bg: const Color(0xFFE0E7FF), fg: const Color(0xFF4338CA))),
          const SizedBox(width: 8),
          Expanded(child: _MiniStat(label: 'TEAM REPLYING', value: waiting, bg: const Color(0xFFFEF3C7), fg: const Color(0xFF92400E))),
          const SizedBox(width: 8),
          Expanded(child: _MiniStat(label: 'RESOLVED', value: resolved, bg: const Color(0xFFD1FAE5), fg: const Color(0xFF047857))),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final int value;
  final Color bg;
  final Color fg;
  const _MiniStat({required this.label, required this.value, required this.bg, required this.fg});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: RunqText.micro.copyWith(
              color: fg.withValues(alpha: 0.75),
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value.toString(),
            style: RunqText.tabular(size: 18, w: FontWeight.w700, color: fg).copyWith(height: 1.0),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
      child: Text(
        label.toUpperCase(),
        style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.6),
      ),
    );
  }
}

class _ConversationRow extends StatelessWidget {
  final SupportConversationSummary conv;
  const _ConversationRow({required this.conv});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => context.push('/profile/help?id=${conv.id}'),
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: Row(
              children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: RunqColors.indigo.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.support_agent_rounded, color: RunqColors.indigo, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        conv.subject ?? conv.preview ?? 'Support conversation',
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _timeAgo(conv.lastMessageAt),
                        style: RunqText.caption.copyWith(color: t.muted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _StatusChip(status: conv.status),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  static const _config = {
    'waiting_human': ('Team responding', Color(0xFFFEF3C7), Color(0xFF92400E)),
    'agent_replied': ('Reply when ready', Color(0xFFE0E7FF), Color(0xFF4338CA)),
    'open': ('In progress', Color(0xFFF4F4F5), Color(0xFF52525B)),
    'resolved': ('Resolved', Color(0xFFD1FAE5), Color(0xFF047857)),
    'closed': ('Closed', Color(0xFFF4F4F5), Color(0xFF71717A)),
  };

  @override
  Widget build(BuildContext context) {
    final cfg = _config[status] ?? ('—', const Color(0xFFF4F4F5), const Color(0xFF71717A));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: cfg.$2,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        cfg.$1,
        style: RunqText.micro.copyWith(color: cfg.$3, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onStart;
  const _EmptyState({required this.onStart});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56, height: 56,
              decoration: BoxDecoration(
                color: RunqColors.indigo.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(28),
              ),
              child: const Icon(Icons.support_agent_rounded, color: RunqColors.indigo, size: 28),
            ),
            const SizedBox(height: 14),
            Text('No conversations yet', style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const SizedBox(height: 6),
            Text(
              'Start one by tapping below — ask anything about runQ.',
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onStart,
              icon: const Icon(Icons.add_comment_outlined, size: 16),
              label: const Text('Start a conversation'),
              style: ElevatedButton.styleFrom(
                backgroundColor: RunqColors.indigo,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _timeAgo(DateTime t) {
  final diff = DateTime.now().difference(t);
  if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}
