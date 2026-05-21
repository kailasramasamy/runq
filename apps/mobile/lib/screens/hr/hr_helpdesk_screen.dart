// HR helpdesk — employee raises tickets to HR (payroll, leave, IT, etc.)
// and continues the conversation in a chat-style thread.

library;

import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../../api/hr_phase_next.dart';
import '../../providers/auth_provider.dart';
import '../../theme/runq_theme.dart';
import '../../widgets/runq_snack.dart';

const _hrAccent = Color(0xFF0891B2);

class HrHelpdeskScreen extends ConsumerWidget {
  const HrHelpdeskScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myTicketsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Helpdesk')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const _AskHrScreen()),
        ).then((_) => ref.invalidate(myTicketsProvider)),
        backgroundColor: _hrAccent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Ask HR'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myTicketsProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (rows) => _Body(rows: rows),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.rows});
  final List<HrTicket> rows;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final open = rows.where((t) => t.status == 'open' || t.status == 'in_progress').toList();
    final closed = rows.where((t) => t.status == 'resolved' || t.status == 'closed').toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 96),
      children: [
        _HeroCard(open: open.length, closed: closed.length, isDark: isDark),
        if (open.isNotEmpty)
          _TicketGroupCard(label: 'Active', count: open.length, tickets: open),
        if (closed.isNotEmpty)
          _TicketGroupCard(label: 'Resolved & closed', count: closed.length, tickets: closed, dimmed: true),
        if (open.isEmpty && closed.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 36, 24, 16),
            child: Column(children: [
              Icon(Icons.support_agent, size: 48, color: theme.hintColor.withValues(alpha: 0.7)),
              const SizedBox(height: 12),
              Text(
                'No tickets yet. Tap “Ask HR” below to start a conversation.',
                textAlign: TextAlign.center,
                style: RunqText.body.copyWith(color: theme.hintColor),
              ),
            ]),
          ),
      ],
    );
  }
}

class _TicketGroupCard extends StatelessWidget {
  const _TicketGroupCard({
    required this.label,
    required this.count,
    required this.tickets,
    this.dimmed = false,
  });
  final String label;
  final int count;
  final List<HrTicket> tickets;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 18, 12, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Row(children: [
            Text(
              label.toUpperCase(),
              style: RunqText.label.copyWith(letterSpacing: 0.8, color: theme.hintColor),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(color: theme.hintColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
              child: Text('$count', style: RunqText.label.copyWith(color: theme.hintColor)),
            ),
          ]),
        ),
        Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border.all(color: theme.dividerColor.withValues(alpha: 0.5)),
            borderRadius: BorderRadius.circular(14),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (int i = 0; i < tickets.length; i++) ...[
              _TicketRow(ticket: tickets[i], dimmed: dimmed),
              if (i < tickets.length - 1)
                Divider(height: 1, color: theme.dividerColor.withValues(alpha: 0.4)),
            ],
          ]),
        ),
      ]),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.open, required this.closed, required this.isDark});
  final int open, closed;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [_hrAccent.withValues(alpha: 0.28), _hrAccent.withValues(alpha: 0.08)]
              : [_hrAccent.withValues(alpha: 0.20), _hrAccent.withValues(alpha: 0.05)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: _hrAccent.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.support_agent, color: _hrAccent, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('HR Assistant', style: RunqText.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(
                'Ask anything about leave, pay, or policies',
                style: RunqText.caption.copyWith(color: Theme.of(context).hintColor),
              ),
            ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: _hrAccent.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.auto_awesome, size: 10, color: _hrAccent),
              const SizedBox(width: 3),
              Text('AI', style: RunqText.micro.copyWith(color: _hrAccent, letterSpacing: 0.4)),
            ]),
          ),
        ]),
        if (open > 0 || closed > 0) ...[
          const SizedBox(height: 14),
          Row(children: [
            _stat(context, '$open', 'open'),
            const SizedBox(width: 18),
            _stat(context, '$closed', 'closed'),
            const Spacer(),
            Icon(Icons.bolt, size: 14, color: Theme.of(context).hintColor),
            const SizedBox(width: 3),
            Text('replies in seconds', style: RunqText.caption.copyWith(color: Theme.of(context).hintColor)),
          ]),
        ],
      ]),
    );
  }

  Widget _stat(BuildContext context, String v, String l) {
    return Row(children: [
      Text(v, style: RunqText.tabular(size: 20, w: FontWeight.w700)),
      const SizedBox(width: 4),
      Text(l, style: RunqText.caption.copyWith(color: Theme.of(context).hintColor)),
    ]);
  }
}

class _TicketRow extends StatelessWidget {
  const _TicketRow({required this.ticket, this.dimmed = false});
  final HrTicket ticket;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final catColor = _categoryColor(ticket.category);
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => _TicketDetailScreen(id: ticket.id),
      )),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: catColor.withValues(alpha: isDark ? 0.18 : 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(_categoryIcon(ticket.category), color: catColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: Text(
                    ticket.subject,
                    style: RunqText.bodyStrong.copyWith(
                      color: dimmed ? theme.hintColor : null,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _relativeTime(ticket.createdAt),
                  style: RunqText.caption.copyWith(color: theme.hintColor),
                ),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                Text(
                  _categoryLabel(ticket.category),
                  style: RunqText.caption.copyWith(color: theme.hintColor),
                ),
                Text('  ·  ', style: RunqText.caption.copyWith(color: theme.hintColor)),
                Text(
                  ticket.ticketNumber,
                  style: RunqText.tabular(size: 12, color: theme.hintColor),
                ),
                const Spacer(),
                _StatusPill(status: ticket.status),
              ]),
              if (ticket.priority == 'high' || ticket.priority == 'urgent') ...[
                const SizedBox(height: 6),
                _PriorityFlag(priority: ticket.priority),
              ],
            ]),
          ),
        ]),
      ),
    );
  }
}

String _relativeTime(DateTime when) {
  final now = DateTime.now();
  final d = now.difference(when.toLocal());
  if (d.inMinutes < 1) return 'now';
  if (d.inMinutes < 60) return '${d.inMinutes}m';
  if (d.inHours < 24) return '${d.inHours}h';
  if (d.inDays < 7) return '${d.inDays}d';
  return DateFormat('d MMM').format(when.toLocal());
}

class _PriorityFlag extends StatelessWidget {
  const _PriorityFlag({required this.priority});
  final String priority;
  @override
  Widget build(BuildContext context) {
    final color = priority == 'urgent' ? Colors.red : Colors.orange;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.priority_high, size: 12, color: color),
        const SizedBox(width: 2),
        Text(priority, style: RunqText.micro.copyWith(color: color)),
      ]),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) {
    final (label, icon, color) = _statusMeta(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 4),
        Text(label, style: RunqText.label.copyWith(color: color)),
      ]),
    );
  }
}

(String, IconData, Color) _statusMeta(String s) => switch (s) {
  'open' => ('Open', Icons.schedule, Colors.orange),
  'in_progress' => ('In progress', Icons.autorenew, _hrAccent),
  'waiting_human' => ('Needs HR', Icons.priority_high, Colors.amber),
  'resolved' => ('Resolved', Icons.check_circle, Colors.green),
  'closed' => ('Closed', Icons.lock_outline, Colors.grey),
  _ => (s, Icons.help_outline, Colors.grey),
};

IconData _categoryIcon(String c) => switch (c) {
  'payroll' => Icons.payments_outlined,
  'leave' => Icons.beach_access_outlined,
  'attendance' => Icons.access_time,
  'reimbursement' => Icons.receipt_long_outlined,
  'asset' => Icons.devices_outlined,
  'it' => Icons.computer_outlined,
  'document' => Icons.description_outlined,
  _ => Icons.help_outline,
};

Color _categoryColor(String c) => switch (c) {
  'payroll' => Colors.teal,
  'leave' => Colors.indigo,
  'attendance' => Colors.deepOrange,
  'reimbursement' => Colors.purple,
  'asset' => Colors.brown,
  'it' => Colors.blue,
  'document' => Colors.cyan,
  _ => _hrAccent,
};

String _categoryLabel(String c) => switch (c) {
  'payroll' => 'Payroll',
  'leave' => 'Leave',
  'attendance' => 'Attendance',
  'reimbursement' => 'Reimbursement',
  'asset' => 'Asset',
  'it' => 'IT',
  'document' => 'Document',
  _ => 'General',
};

// ─── New ticket sheet ──────────────────────────────────────────────────────

// ─── Ask HR full-screen flow ───────────────────────────────────────────────
//
// Step 1: pick a category from a grid of big tiles.
// Step 2 (Letters): list available letter kinds → tap → confirm → issue.
// Step 2 (everything else): preset questions chips + free-text input.

class _AskHrScreen extends ConsumerStatefulWidget {
  const _AskHrScreen();
  @override
  ConsumerState<_AskHrScreen> createState() => _AskHrScreenState();
}

class _AskHrScreenState extends ConsumerState<_AskHrScreen> {
  String? _category;

  static const _cats = [
    ('leave', 'Leave', Icons.beach_access_outlined),
    ('payroll', 'Payroll', Icons.payments_outlined),
    ('attendance', 'Attendance', Icons.access_time),
    ('reimbursement', 'Reimburse', Icons.receipt_long_outlined),
    ('document', 'Letters', Icons.description_outlined),
    ('asset', 'Asset', Icons.devices_outlined),
    ('it', 'IT', Icons.computer_outlined),
    ('general', 'Other', Icons.help_outline),
  ];

  // Letters category opens chat with a starter prompt; the HR agent issues
  // the letter via tool call and the result lands under HR → Letters.

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_category == null ? 'Ask HR' : _categoryLabel(_category!)),
        leading: _category != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() => _category = null),
              )
            : null,
      ),
      body: SafeArea(
        child: _category == null
            ? _CategoryGrid(
                cats: _cats,
                onPick: (c) => setState(() => _category = c),
              )
            : _PresetsAndInput(
                category: _category!,
                onSent: () => Navigator.pop(context, true),
              ),
      ),
    );
  }
}

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({required this.cats, required this.onPick});
  final List<(String, String, IconData)> cats;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(color: _hrAccent.withValues(alpha: 0.15), shape: BoxShape.circle),
            child: const Icon(Icons.support_agent, color: _hrAccent, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'What can I help with today?',
              style: RunqText.h4,
            ),
          ),
        ]),
        const SizedBox(height: 8),
        Text(
          'Pick a topic to see common questions, or request a letter.',
          style: RunqText.body.copyWith(color: theme.hintColor),
        ),
        const SizedBox(height: 20),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.6,
          children: cats.map((c) {
            final col = _categoryColor(c.$1);
            return InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => onPick(c.$1),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: col.withValues(alpha: isDark ? 0.15 : 0.08),
                  border: Border.all(color: col.withValues(alpha: 0.3)),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: col.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(c.$3, color: col, size: 22),
                  ),
                  Text(c.$2, style: RunqText.bodyStrong.copyWith(color: col)),
                ]),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _PresetsAndInput extends StatefulWidget {
  const _PresetsAndInput({required this.category, required this.onSent});
  final String category;
  final VoidCallback onSent;

  @override
  State<_PresetsAndInput> createState() => _PresetsAndInputState();
}

class _PresetsAndInputState extends State<_PresetsAndInput> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  bool _busy = false;

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    if (_busy || text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final firstLine = text.split('\n').first;
      final subject = firstLine.length > 80 ? '${firstLine.substring(0, 77)}…' : firstLine;
      final description = text.trim() == firstLine ? null : text.trim();
      final t = await hrPhaseNextRepo.createTicket(
        subject: subject,
        description: description,
        category: widget.category,
        priority: 'normal',
      );
      if (!mounted) return;
      widget.onSent();
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => _TicketDetailScreen(id: t.id),
      ));
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final col = _categoryColor(widget.category);
    final presets = _presetsFor(widget.category);

    return Column(children: [
      Expanded(
        child: ListView(
          padding: const EdgeInsets.all(16),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          children: [
            Text(
              'COMMON QUESTIONS',
              style: RunqText.label.copyWith(letterSpacing: 0.8, color: theme.hintColor),
            ),
            const SizedBox(height: 4),
            Text(
              'Tap one to ask, or type your own below.',
              style: RunqText.caption.copyWith(color: theme.hintColor),
            ),
            const SizedBox(height: 12),
            ...presets.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: _busy ? null : () => _send(p),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: col.withValues(alpha: isDark ? 0.10 : 0.06),
                    border: Border.all(color: col.withValues(alpha: 0.25)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(children: [
                    Expanded(child: Text(p, style: RunqText.body)),
                    Icon(Icons.arrow_forward, size: 16, color: col),
                  ]),
                ),
              ),
            )),
          ],
        ),
      ),
      SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(top: BorderSide(color: theme.dividerColor.withValues(alpha: 0.5))),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
              child: TextField(
                controller: _input,
                focusNode: _focus,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                inputFormatters: [LengthLimitingTextInputFormatter(1000)],
                decoration: InputDecoration(
                  hintText: 'Type your own question…',
                  filled: true,
                  fillColor: theme.hintColor.withValues(alpha: 0.08),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                onSubmitted: _send,
              ),
            ),
            const SizedBox(width: 8),
            Material(
              color: _busy ? theme.hintColor : _hrAccent,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _busy ? null : () => _send(_input.text),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: _busy
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.arrow_upward, color: Colors.white, size: 18),
                ),
              ),
            ),
          ]),
        ),
      ),
    ]);
  }
}

List<String> _presetsFor(String category) => switch (category) {
  'leave' => const [
    'How many CL days do I have left?',
    'How many SL days do I have left?',
    'What\'s the status of my latest leave request?',
    'When does my leave reset?',
    'What\'s the company leave policy?',
  ],
  'payroll' => const [
    'When will my salary be credited?',
    'Show my latest payslip',
    'How is my PF calculated?',
    'What\'s my TDS for this year?',
  ],
  'attendance' => const [
    'How many days have I worked this month?',
    'How many OT hours do I have?',
    'I forgot to clock out — how do I fix it?',
    'What are the company working hours?',
  ],
  'reimbursement' => const [
    'Status of my latest expense claim?',
    'How do I submit a new reimbursement?',
    'What\'s the company reimbursement policy?',
  ],
  'document' => const [
    'I need a salary certificate for my home loan',
    'I need a salary certificate for visa',
    'I need an address proof letter',
    'I need a copy of my appointment letter',
    'I need a copy of my offer letter',
    'I need a copy of my confirmation letter',
    'I need a copy of my latest increment letter',
    'I need an experience letter',
    'I need a relieving letter',
  ],
  'asset' => const [
    'I need a new laptop charger',
    'How do I report a broken company asset?',
  ],
  'it' => const [
    'I forgot my email password',
    'I need access to the VPN',
    'My laptop is running slow',
  ],
  _ => const [
    'I have a general question for HR',
  ],
};

// ─── Detail screen with chat-style thread ──────────────────────────────────

class _TicketDetailScreen extends ConsumerStatefulWidget {
  const _TicketDetailScreen({required this.id});
  final String id;
  @override
  ConsumerState<_TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends ConsumerState<_TicketDetailScreen> {
  final _comment = TextEditingController();
  final _scroll = ScrollController();
  final _composerFocus = FocusNode();
  bool _busy = false;

  WebSocketChannel? _ws;
  StreamSubscription<dynamic>? _wsSub;
  Timer? _wsReconnectTimer;
  int _wsRetries = 0;

  bool _agentTyping = false;
  Timer? _typingStaleTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _connectWs());
    _composerFocus.addListener(() {
      if (_composerFocus.hasFocus) {
        // Keyboard slides up over ~250ms; scroll once it's settled so the
        // latest message sits just above the composer.
        Future<void>.delayed(const Duration(milliseconds: 300), _scrollToBottom);
      }
    });
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    _ws?.sink.close();
    _wsReconnectTimer?.cancel();
    _typingStaleTimer?.cancel();
    _comment.dispose();
    _scroll.dispose();
    _composerFocus.dispose();
    super.dispose();
  }

  void _connectWs() {
    final token = ref.read(authProvider).token;
    if (token == null) return;
    try {
      _ws = WebSocketChannel.connect(
        hrPhaseNextRepo.helpdeskWsUrl(token: token, ticketId: widget.id),
      );
      _wsSub = _ws!.stream.listen(
        (raw) {
          try {
            final data = jsonDecode(raw as String) as Map<String, dynamic>;
            final type = data['type'] as String?;
            if (type == 'comment_added' || type == 'status_changed') {
              if (mounted) {
                ref.invalidate(ticketProvider(widget.id));
                if (_agentTyping) setState(() => _agentTyping = false);
                _typingStaleTimer?.cancel();
              }
            }
            if (type == 'typing_started' && data['actor'] == 'agent') {
              if (mounted) setState(() => _agentTyping = true);
              // Safety: auto-clear after 30s in case typing_stopped is lost.
              _typingStaleTimer?.cancel();
              _typingStaleTimer = Timer(const Duration(seconds: 30), () {
                if (mounted) setState(() => _agentTyping = false);
              });
            }
            if (type == 'typing_stopped' && data['actor'] == 'agent') {
              if (mounted) setState(() => _agentTyping = false);
              _typingStaleTimer?.cancel();
            }
            if (type == 'connected') {
              _wsRetries = 0;
              // Always refetch on (re)connect so anything that happened
              // between mount and subscribe (e.g., the agent's first reply
              // on a brand-new ticket) is picked up.
              if (mounted) ref.invalidate(ticketProvider(widget.id));
            }
          } catch (_) {/* ignore malformed */}
        },
        onError: (_) => _scheduleReconnect(),
        onDone: _scheduleReconnect,
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (!mounted) return;
    _wsSub?.cancel();
    _ws?.sink.close();
    _ws = null;
    final delaySec = (1 << _wsRetries.clamp(0, 5)).clamp(1, 30);
    _wsRetries++;
    _wsReconnectTimer = Timer(Duration(seconds: delaySec), _connectWs);
  }

  void _scrollToBottom() {
    // Wait one frame so the new comment is laid out before we animate.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  int _lastCommentCount = -1;

  Future<void> _send() async {
    final body = _comment.text.trim();
    if (body.isEmpty) return;
    // Hide the keyboard so the user sees the sent message immediately.
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.commentOnTicket(widget.id, body);
      _comment.clear();
      ref.invalidate(ticketProvider(widget.id));
      _scrollToBottom();
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Widget> _buildAgentDraftStrips(List<HrTicketComment> comments) {
    final role = ref.read(authProvider).user?.role;
    final isHrOperator = role == 'owner' || role == 'accountant' || role == 'hr';
    if (!isHrOperator) return const [];
    final drafts = comments.where((c) => c.isAgentDraft).toList();
    if (drafts.isEmpty) return const [];
    return drafts.map((d) => _AgentDraftCard(
      ticketId: widget.id,
      draft: d,
      onEdit: (b) {
        _comment.text = b;
        _comment.selection = TextSelection.collapsed(offset: b.length);
      },
      onAfterMutation: () => ref.invalidate(ticketProvider(widget.id)),
    )).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Scroll to bottom whenever the sent-comment count grows (covers our own
    // sends AND remote messages pushed via WebSocket).
    ref.listen<AsyncValue<HrTicketDetail>>(ticketProvider(widget.id), (_, next) {
      next.whenData((d) {
        final sentCount = d.comments.where((c) => !c.isAgentDraft).length;
        // First data load — jump to the bottom so the user sees the latest
        // message immediately. Subsequent grows animate.
        if (_lastCommentCount < 0 && sentCount > 0) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scroll.hasClients) {
              _scroll.jumpTo(_scroll.position.maxScrollExtent);
            }
          });
        } else if (sentCount > _lastCommentCount) {
          _scrollToBottom();
        }

        // Optimistic "agent is working" indicator on first load — fills the
        // window between landing on the screen and the typing_started WS
        // event arriving (or the first agent comment). Triggers when:
        //   - We've just opened the screen (first observation)
        //   - The ticket isn't closed/resolved
        //   - The most recent sent comment isn't from HR/agent (i.e., the
        //     agent owes us a reply)
        if (_lastCommentCount < 0 && !_agentTyping) {
          final terminal = d.ticket.status == 'resolved' || d.ticket.status == 'closed';
          final sent = d.comments.where((c) => !c.isAgentDraft).toList();
          final lastFromAgent = sent.isNotEmpty &&
              (sent.last.agentConfidence != null ||
               (sent.last.authorRole != null && sent.last.authorRole != 'viewer'));
          if (!terminal && !lastFromAgent) {
            setState(() => _agentTyping = true);
            _typingStaleTimer?.cancel();
            _typingStaleTimer = Timer(const Duration(seconds: 30), () {
              if (mounted) setState(() => _agentTyping = false);
            });
          }
        }
        _lastCommentCount = sentCount;
      });
    });
    final async = ref.watch(ticketProvider(widget.id));
    final meId = ref.watch(authProvider).user?.id;

    return Scaffold(
      appBar: AppBar(title: const Text('Ticket')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (d) {
          final t = d.ticket;
          final isDark = theme.brightness == Brightness.dark;
          return Column(children: [
            Container(
              margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: isDark
                      ? [_hrAccent.withValues(alpha: 0.22), _hrAccent.withValues(alpha: 0.08)]
                      : [_hrAccent.withValues(alpha: 0.14), _hrAccent.withValues(alpha: 0.04)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: _categoryColor(t.category).withValues(alpha: isDark ? 0.22 : 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(_categoryIcon(t.category), color: _categoryColor(t.category), size: 18),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      t.subject,
                      style: RunqText.bodyStrong.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                ]),
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  _StatusPill(status: t.status),
                  if (t.priority == 'high' || t.priority == 'urgent')
                    _PriorityFlag(priority: t.priority),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: theme.hintColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(t.ticketNumber, style: RunqText.label.copyWith(color: theme.hintColor)),
                  ),
                ]),
                if (t.description != null && t.description!.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(t.description!, style: RunqText.body.copyWith(height: 1.4)),
                ],
              ]),
            ),
            Expanded(
              child: Builder(builder: (context) {
                final sent = d.comments.where((c) => !c.isAgentDraft).toList();
                // No empty-state copy here — the typing bubble below already
                // communicates "agent is working" on fresh tickets, and
                // anything else (closed/no agent enabled) is self-evident
                // from the header status.
                return ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 16),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  itemCount: sent.length,
                  itemBuilder: (_, i) => _CommentBubble(comment: sent[i], isMe: sent[i].authorUserId == meId),
                );
              }),
            ),
            if (_agentTyping)
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 12, 8),
                child: Align(alignment: Alignment.centerLeft, child: _TypingBubble()),
              ),
            ..._buildAgentDraftStrips(d.comments),
            SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  border: Border(top: BorderSide(color: theme.dividerColor.withValues(alpha: 0.5))),
                ),
                child: Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _comment,
                      focusNode: _composerFocus,
                      minLines: 1,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        hintText: 'Type a message…',
                        filled: true,
                        fillColor: theme.hintColor.withValues(alpha: 0.08),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(22),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Material(
                    color: _busy ? theme.hintColor : _hrAccent,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: _busy ? null : _send,
                      child: Padding(
                        padding: const EdgeInsets.all(11),
                        child: _busy
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.send, color: Colors.white, size: 18),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
          ]);
        },
      ),
    );
  }
}

class _CommentBubble extends StatelessWidget {
  const _CommentBubble({required this.comment, required this.isMe});
  final HrTicketComment comment;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = isMe
        ? _hrAccent
        : (isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.05));
    final fgColor = isMe ? Colors.white : (isDark ? Colors.white : Colors.black87);
    final authorLabel = comment.authorName ?? comment.authorEmail ?? 'HR';
    final timeLabel = DateFormat('d MMM, HH:mm').format(comment.createdAt.toLocal());

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!isMe)
            Padding(
              padding: const EdgeInsets.only(left: 6, bottom: 2),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  authorLabel,
                  style: RunqText.label.copyWith(color: theme.hintColor),
                ),
                if (!comment.isAgentDraft && comment.agentConfidence != null) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    decoration: BoxDecoration(
                      color: _hrAccent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.auto_awesome, size: 8, color: _hrAccent),
                      const SizedBox(width: 2),
                      Text('AI', style: RunqText.micro.copyWith(color: _hrAccent, letterSpacing: 0.4)),
                    ]),
                  ),
                ],
              ]),
            ),
          Row(
            mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
            children: [
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: bgColor,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(14),
                      topRight: const Radius.circular(14),
                      bottomLeft: Radius.circular(isMe ? 14 : 4),
                      bottomRight: Radius.circular(isMe ? 4 : 14),
                    ),
                  ),
                  child: MarkdownBody(
                    data: comment.body,
                    shrinkWrap: true,
                    softLineBreak: true,
                    selectable: true,
                    styleSheet: MarkdownStyleSheet(
                      p: RunqText.body.copyWith(color: fgColor, height: 1.4),
                      strong: RunqText.bodyStrong.copyWith(color: fgColor, height: 1.4),
                      em: RunqText.body.copyWith(color: fgColor, height: 1.4, fontStyle: FontStyle.italic),
                      listBullet: RunqText.body.copyWith(color: fgColor, height: 1.4),
                      code: RunqText.caption.copyWith(color: fgColor, fontFamily: 'monospace', backgroundColor: theme.hintColor.withValues(alpha: 0.15)),
                      h3: RunqText.bodyStrong.copyWith(color: fgColor),
                      h4: RunqText.bodyStrong.copyWith(color: fgColor),
                      blockSpacing: 6,
                      listIndent: 18,
                    ),
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 3, left: 6, right: 6),
            child: Text(timeLabel, style: RunqText.micro.copyWith(color: theme.hintColor)),
          ),
        ],
      ),
    );
  }
}

class _AgentDraftCard extends StatefulWidget {
  const _AgentDraftCard({
    required this.ticketId,
    required this.draft,
    required this.onEdit,
    required this.onAfterMutation,
  });
  final String ticketId;
  final HrTicketComment draft;
  final void Function(String) onEdit;
  final VoidCallback onAfterMutation;

  @override
  State<_AgentDraftCard> createState() => _AgentDraftCardState();
}

class _AgentDraftCardState extends State<_AgentDraftCard> {
  bool _busy = false;

  Color _confidenceColor(BuildContext ctx) {
    switch (widget.draft.agentConfidence) {
      case 'high':   return Colors.green.shade600;
      case 'medium': return Colors.orange.shade700;
      default:       return Theme.of(ctx).hintColor;
    }
  }

  Future<void> _accept() async {
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.acceptAgentDraft(widget.ticketId, widget.draft.id);
      widget.onAfterMutation();
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed to send: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _discard() async {
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.discardAgentDraft(widget.ticketId, widget.draft.id);
      widget.onAfterMutation();
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed to discard: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isEscalation = widget.draft.isEscalationNote;
    final accent = isEscalation ? Colors.amber.shade700 : _hrAccent;
    final bodyText = isEscalation
        ? widget.draft.body.replaceFirst(RegExp(r'^\(agent escalated this ticket\)\s*\n+', caseSensitive: false), '')
        : widget.draft.body;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? accent.withValues(alpha: 0.15) : accent.withValues(alpha: 0.06),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(isEscalation ? Icons.priority_high : Icons.auto_awesome, size: 14, color: accent),
          const SizedBox(width: 6),
          Text(
            isEscalation ? 'AI FLAGGED — INTERNAL NOTE' : 'AI DRAFT',
            style: RunqText.micro.copyWith(color: accent, letterSpacing: 0.5),
          ),
          if (isEscalation) ...[
            const Spacer(),
            Text('HR only', style: RunqText.micro.copyWith(color: theme.hintColor)),
          ] else if (widget.draft.agentConfidence != null) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: _confidenceColor(context).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                '${widget.draft.agentConfidence} confidence',
                style: RunqText.micro.copyWith(color: _confidenceColor(context)),
              ),
            ),
          ],
        ]),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: theme.dividerColor.withValues(alpha: 0.4)),
          ),
          child: MarkdownBody(
            data: bodyText,
            shrinkWrap: true,
            softLineBreak: true,
            selectable: true,
            styleSheet: MarkdownStyleSheet(
              p: RunqText.body.copyWith(height: 1.4),
              strong: RunqText.bodyStrong.copyWith(height: 1.4),
              em: RunqText.body.copyWith(height: 1.4, fontStyle: FontStyle.italic),
              listBullet: RunqText.body.copyWith(height: 1.4),
              code: RunqText.label.copyWith(fontFamily: 'monospace', backgroundColor: theme.hintColor.withValues(alpha: 0.15)),
              blockSpacing: 6,
              listIndent: 18,
            ),
          ),
        ),
        const SizedBox(height: 8),
        if (isEscalation)
          Row(children: [
            OutlinedButton(
              onPressed: _busy ? null : _discard,
              style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
              child: const Text('Dismiss note'),
            ),
          ])
        else
          Row(children: [
          FilledButton.icon(
            onPressed: _busy ? null : _accept,
            icon: const Icon(Icons.send, size: 14),
            label: const Text('Send'),
            style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _busy ? null : () => widget.onEdit(widget.draft.body),
            style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
            child: const Text('Edit'),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _busy ? null : _discard,
            style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
            child: const Text('Discard'),
          ),
        ]),
      ]),
    );
  }
}

/// WhatsApp-style three-dot typing bubble. Shown when the agent is processing.
class _TypingBubble extends StatefulWidget {
  const _TypingBubble();

  @override
  State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bg = isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.05);
    final dotColor = theme.hintColor;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Padding(
        padding: const EdgeInsets.only(left: 6, bottom: 2),
        child: Text(
          'HR Assistant',
          style: RunqText.label.copyWith(color: theme.hintColor),
        ),
      ),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(14),
            topRight: Radius.circular(14),
            bottomLeft: Radius.circular(4),
            bottomRight: Radius.circular(14),
          ),
        ),
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (_, _) {
            final t = _ctrl.value;
            return Row(mainAxisSize: MainAxisSize.min, children: List.generate(3, (i) {
              // Stagger each dot's pulse by 1/3 of the cycle.
              final phase = (t + i / 3) % 1.0;
              final opacity = (phase < 0.5) ? 0.3 + phase * 1.4 : 0.3 + (1.0 - phase) * 1.4;
              return Padding(
                padding: EdgeInsets.only(right: i < 2 ? 5 : 0),
                child: Container(
                  width: 7, height: 7,
                  decoration: BoxDecoration(
                    color: dotColor.withValues(alpha: opacity.clamp(0.3, 1.0)),
                    shape: BoxShape.circle,
                  ),
                ),
              );
            }));
          },
        ),
      ),
    ]);
  }
}
