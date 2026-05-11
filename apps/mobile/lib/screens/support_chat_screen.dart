import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../api/repos.dart';
import '../providers/auth_provider.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../widgets/runq_snack.dart';

const String _supportEmail = 'support@runq.in';

class _Msg {
  final String id;
  final String role;     // user | agent | human
  String content;
  bool streaming;
  String? toolStatus;
  _Msg({required this.id, required this.role, required this.content, this.streaming = false, this.toolStatus});
}

class SupportChatScreen extends ConsumerStatefulWidget {
  /// If provided, the screen opens directly to this conversation regardless
  /// of its status. Used by the support inbox to deep-link into any
  /// conversation including resolved or closed ones.
  final String? initialConversationId;
  /// When true, skip the "resume the user's last open conversation" lookup
  /// and open a blank chat. Set by the inbox's "New conversation" button so
  /// the user actually gets a new chat instead of being silently resumed
  /// into an existing one.
  final bool forceNew;
  const SupportChatScreen({super.key, this.initialConversationId, this.forceNew = false});

  @override
  ConsumerState<SupportChatScreen> createState() => _SupportChatScreenState();
}

class _SupportChatScreenState extends ConsumerState<SupportChatScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<_Msg> _msgs = [];
  StreamSubscription<SupportStreamEvent>? _sub;
  String? _conversationId;
  bool _busy = false;
  bool _loadingHistory = true;
  String? _conversationStatus;
  WebSocketChannel? _ws;
  StreamSubscription<dynamic>? _wsSub;
  Timer? _wsReconnectTimer;
  int _wsRetries = 0;

  @override
  void initState() {
    super.initState();
    final id = widget.initialConversationId;
    if (id != null && id.isNotEmpty) {
      _loadConversation(id);
    } else if (widget.forceNew) {
      // Caller explicitly wants a fresh chat — skip the resume lookup so
      // the empty-state composer is shown right away.
      setState(() => _loadingHistory = false);
    } else {
      _loadResumable();
    }
  }

  /// Load a specific conversation by ID — works for any status (open,
  /// agent_replied, waiting_human, resolved, closed). Closed conversations
  /// will be read-only on the API side; resolved ones re-open when the user
  /// sends a new message.
  Future<void> _loadConversation(String id) async {
    final token = ref.read(authProvider).token;
    if (token == null) {
      setState(() => _loadingHistory = false);
      return;
    }
    try {
      final list = await supportRepo.list(token: token);
      final found = list.where((c) => c.id == id).toList();
      final status = found.isNotEmpty ? found.first.status : null;
      final msgs = await supportRepo.messages(token: token, conversationId: id);
      if (!mounted) return;
      setState(() {
        _conversationId = id;
        _conversationStatus = status;
        _msgs.addAll(msgs.map((m) => _Msg(id: m.id, role: m.role, content: m.content)));
      });
      _connectWs();
    } catch (_) {/* show empty state */} finally {
      if (mounted) {
        setState(() => _loadingHistory = false);
        _scrollToEnd();
      }
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _wsSub?.cancel();
    _ws?.sink.close();
    _wsReconnectTimer?.cancel();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _connectWs() {
    final id = _conversationId;
    final token = ref.read(authProvider).token;
    if (id == null || token == null) return;

    try {
      _ws = WebSocketChannel.connect(supportRepo.wsUrl(token: token, conversationId: id));
      _wsSub = _ws!.stream.listen(
        (raw) {
          try {
            final data = jsonDecode(raw as String) as Map<String, dynamic>;
            final type = data['type'] as String?;
            // Refetch conversation history when server pushes a new message.
            // We scope to the current conversation only.
            if (type == 'message_added' || type == 'status_changed') {
              _refetchMessages();
            }
            if (type == 'connected') {
              _wsRetries = 0;
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
    final delay = Duration(seconds: (1 << _wsRetries.clamp(0, 5)).clamp(1, 30));
    _wsRetries++;
    _wsReconnectTimer = Timer(delay, () {
      if (mounted && _conversationId != null) _connectWs();
    });
  }

  Future<void> _refetchMessages() async {
    final id = _conversationId;
    final token = ref.read(authProvider).token;
    if (id == null || token == null) return;
    try {
      final msgs = await supportRepo.messages(token: token, conversationId: id);
      if (!mounted) return;
      // Only replace messages we don't already have (preserves streaming bubbles).
      final knownIds = _msgs.map((m) => m.id).toSet();
      final newOnes = msgs.where((m) => !knownIds.contains(m.id)).toList();
      if (newOnes.isEmpty) return;
      setState(() {
        for (final m in newOnes) {
          _msgs.add(_Msg(id: m.id, role: m.role, content: m.content));
        }
      });
      _scrollToEnd();
    } catch (_) {/* silent */}
  }

  Future<void> _loadResumable() async {
    final token = ref.read(authProvider).token;
    if (token == null) {
      setState(() => _loadingHistory = false);
      return;
    }
    try {
      final list = await supportRepo.list(token: token);
      final resumable = list.where((c) => c.status != 'closed' && c.status != 'resolved').toList();
      if (resumable.isNotEmpty) {
        final id = resumable.first.id;
        final msgs = await supportRepo.messages(token: token, conversationId: id);
        if (!mounted) return;
        setState(() {
          _conversationId = id;
          _conversationStatus = resumable.first.status;
          _msgs.addAll(msgs.map((m) => _Msg(id: m.id, role: m.role, content: m.content)));
        });
        _connectWs();
      }
    } catch (_) {/* show empty state */} finally {
      if (mounted) {
        setState(() => _loadingHistory = false);
        _scrollToEnd();
      }
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _send() {
    final text = _ctrl.text.trim();
    if (text.isEmpty || _busy) return;
    final token = ref.read(authProvider).token;
    if (token == null) return;

    final userMsg = _Msg(id: 'u-${DateTime.now().microsecondsSinceEpoch}', role: 'user', content: text);
    final agentMsg = _Msg(id: 'a-${DateTime.now().microsecondsSinceEpoch}', role: 'agent', content: '', streaming: true);
    setState(() {
      _msgs.add(userMsg);
      _msgs.add(agentMsg);
      _ctrl.clear();
      _busy = true;
    });
    _scrollToEnd();

    _sub?.cancel();
    _sub = supportRepo
        .stream(token: token, message: text, conversationId: _conversationId)
        .listen(
      (event) {
        if (!mounted) return;
        setState(() {
          if (event.type == 'conversation' && event.conversationId != null) {
            _conversationId = event.conversationId;
            _connectWs();
          } else if (event.type == 'text_delta' && event.text != null) {
            agentMsg.content += event.text!;
            agentMsg.toolStatus = null;
          } else if (event.type == 'tool_use_start') {
            agentMsg.toolStatus = _prettyTool(event.toolName ?? '');
          } else if (event.type == 'tool_result') {
            agentMsg.toolStatus = null;
          } else if (event.type == 'escalated') {
            agentMsg.toolStatus = 'Handing off to the runQ team…';
            _conversationStatus = 'waiting_human';
          } else if (event.type == 'error') {
            agentMsg.content = '${agentMsg.content}\n\n[Error: ${event.message ?? 'unknown'}]';
          } else if (event.type == 'done') {
            agentMsg.streaming = false;
            agentMsg.toolStatus = null;
            if (_conversationStatus != 'waiting_human') {
              _conversationStatus = 'agent_replied';
            }
          }
        });
        _scrollToEnd();
      },
      onError: (err) {
        if (!mounted) return;
        setState(() {
          agentMsg.streaming = false;
          agentMsg.content = "Couldn't reach support — please try again.";
        });
      },
      onDone: () {
        if (!mounted) return;
        setState(() {
          agentMsg.streaming = false;
          _busy = false;
        });
      },
    );
  }

  String _prettyTool(String name) {
    const map = {
      'get_user_context': 'Looking up your account…',
      'search_docs': 'Searching docs…',
      'list_recent_invoices': 'Checking your invoices…',
      'get_gst_status': 'Checking GST status…',
      'get_pay_run_status': 'Checking pay runs…',
      'lookup_recent_errors': 'Checking recent errors…',
      'escalate_to_human': 'Handing off to the runQ team…',
    };
    return map[name] ?? 'Working…';
  }

  void _newConversation() {
    setState(() {
      _conversationId = null;
      _conversationStatus = null;
      _msgs.clear();
    });
  }

  Future<void> _markResolved() async {
    final id = _conversationId;
    final token = ref.read(authProvider).token;
    if (id == null || token == null) return;
    try {
      await supportRepo.resolve(token: token, conversationId: id);
      if (!mounted) return;
      setState(() => _conversationStatus = 'resolved');
      showRunqSnack(context, 'Marked as resolved', kind: SnackKind.success);
    } catch (_) {
      if (!mounted) return;
      showRunqSnack(context, "Couldn't mark resolved — try again", kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(onNew: _newConversation, hasConversation: _conversationId != null),
            if (_conversationStatus == 'waiting_human')
              Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFCD34D)),
                ),
                child: Text(
                  'A team member has been notified and will reply within an hour. You can keep typing — your messages are saved.',
                  style: RunqText.caption.copyWith(color: const Color(0xFF92400E), fontSize: 12),
                ),
              ),
            Expanded(
              child: _loadingHistory
                  ? const Center(child: CircularProgressIndicator())
                  : _msgs.isEmpty
                      ? _EmptyState()
                      : ListView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                          itemCount: _msgs.length,
                          itemBuilder: (_, i) => _MessageBubble(msg: _msgs[i]),
                        ),
            ),
            if (_conversationStatus == 'agent_replied' && _msgs.length >= 2 && !_busy)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Center(
                  child: OutlinedButton.icon(
                    onPressed: _markResolved,
                    icon: const Icon(Icons.thumb_up_alt_outlined, size: 14),
                    label: const Text('That answered my question'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF047857),
                      side: const BorderSide(color: Color(0xFFA7F3D0)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      textStyle: const TextStyle(fontSize: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    ),
                  ),
                ),
              ),
            if (_conversationStatus == 'resolved')
              Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFD1FAE5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'Marked as resolved. Type to re-open if you need more help.',
                  style: RunqText.caption.copyWith(color: const Color(0xFF065F46), fontSize: 12),
                ),
              ),
            if (_conversationStatus == 'closed')
              Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF4F4F5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'This conversation is closed. Start a new one to ask another question.',
                  style: RunqText.caption.copyWith(color: const Color(0xFF52525B), fontSize: 12),
                ),
              ),
            if (_conversationStatus != 'closed')
              _Composer(controller: _ctrl, onSend: _send, busy: _busy)
            else
              const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Center(
                child: GestureDetector(
                  onTap: () async {
                    await Clipboard.setData(const ClipboardData(text: _supportEmail));
                    if (context.mounted) {
                      showRunqSnack(context, 'Email copied — paste into your mail app', kind: SnackKind.success);
                    }
                  },
                  child: Text(
                    'Or email $_supportEmail',
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final VoidCallback onNew;
  final bool hasConversation;
  const _Header({required this.onNew, required this.hasConversation});

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
          Expanded(child: Center(child: Text('Support', style: RunqText.h2.copyWith(color: t.ink)))),
          if (hasConversation)
            IconButton(
              icon: const Icon(Icons.add_comment_outlined, size: 20),
              onPressed: onNew,
              color: t.muted,
              tooltip: 'New conversation',
            )
          else
            const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final _Msg msg;
  const _MessageBubble({required this.msg});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isUser = msg.role == 'user';
    final isHuman = msg.role == 'human';

    Color bg;
    Color fg;
    if (isUser) {
      bg = RunqColors.indigo;
      fg = Colors.white;
    } else if (isHuman) {
      bg = const Color(0xFFD1FAE5);
      fg = t.ink;
    } else {
      bg = t.inputFill;
      fg = t.ink;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser)
            Container(
              width: 28, height: 28,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                color: isHuman ? const Color(0xFFD1FAE5) : RunqColors.indigo.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                isHuman ? Icons.person_outline_rounded : Icons.support_agent_rounded,
                size: 16,
                color: isHuman ? const Color(0xFF065F46) : RunqColors.indigo,
              ),
            ),
          Flexible(
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(14),
              ),
              child: msg.content.isEmpty && msg.toolStatus != null
                  ? Text(msg.toolStatus!, style: RunqText.caption.copyWith(color: fg.withValues(alpha: 0.7), fontStyle: FontStyle.italic, fontSize: 12))
                  : isUser
                      ? Text(msg.content + (msg.streaming ? ' ▍' : ''), style: RunqText.body.copyWith(color: fg, fontSize: 14, height: 1.4))
                      : _MarkdownBody(text: msg.content + (msg.streaming ? ' ▍' : ''), color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
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
            Text('Hi, how can I help?', style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const SizedBox(height: 6),
            Text(
              'Ask about features, troubleshooting, billing — anything.',
              style: RunqText.caption.copyWith(color: t.muted, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSend;
  final bool busy;
  const _Composer({required this.controller, required this.onSend, required this.busy});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
      padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: t.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 4,
              minLines: 1,
              textInputAction: TextInputAction.send,
              decoration: const InputDecoration(
                border: InputBorder.none,
                hintText: 'Ask anything about runQ…',
                isDense: true,
                contentPadding: EdgeInsets.symmetric(vertical: 10),
              ),
              onSubmitted: (_) => onSend(),
              enabled: !busy,
            ),
          ),
          const SizedBox(width: 4),
          Material(
            color: RunqColors.indigo,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: busy ? null : onSend,
              child: Container(
                width: 36, height: 36,
                alignment: Alignment.center,
                child: busy
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.arrow_upward_rounded, size: 18, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MarkdownBody extends StatelessWidget {
  final String text;
  final Color color;
  const _MarkdownBody({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final base = RunqText.body.copyWith(color: color, fontSize: 14, height: 1.4);
    return MarkdownBody(
      data: text,
      shrinkWrap: true,
      softLineBreak: true,
      styleSheet: MarkdownStyleSheet(
        p: base,
        strong: base.copyWith(fontWeight: FontWeight.w600),
        em: base.copyWith(fontStyle: FontStyle.italic),
        a: base.copyWith(color: RunqColors.indigo, decoration: TextDecoration.underline),
        h1: base.copyWith(fontSize: 15, fontWeight: FontWeight.w600),
        h2: base.copyWith(fontSize: 15, fontWeight: FontWeight.w600),
        h3: base.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
        h4: base.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
        listBullet: base,
        code: base.copyWith(
          fontFamily: 'monospace',
          fontSize: 12.5,
          backgroundColor: t.hairlineSoft,
        ),
        codeblockDecoration: BoxDecoration(
          color: t.hairlineSoft,
          borderRadius: BorderRadius.circular(6),
        ),
        codeblockPadding: const EdgeInsets.all(8),
        blockquoteDecoration: BoxDecoration(
          border: Border(left: BorderSide(color: t.hairline, width: 2)),
        ),
        blockquotePadding: const EdgeInsets.only(left: 8),
        blockSpacing: 6,
        listIndent: 18,
      ),
    );
  }
}
