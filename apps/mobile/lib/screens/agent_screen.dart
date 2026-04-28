import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/repos.dart';
import '../providers/auth_provider.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../widgets/sparkle.dart';

class _Msg {
  final String id;
  final bool fromUser;
  String content;
  bool streaming;
  List<String> followUps;
  List<String> toolNames;
  _Msg({
    required this.id,
    required this.fromUser,
    required this.content,
    this.streaming = false,
    List<String>? followUps,
    List<String>? toolNames,
  })  : followUps = followUps ?? [],
        toolNames = toolNames ?? [];
}

class AgentScreen extends ConsumerStatefulWidget {
  const AgentScreen({super.key});

  @override
  ConsumerState<AgentScreen> createState() => _AgentScreenState();
}

class _AgentScreenState extends ConsumerState<AgentScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<_Msg> _msgs = [];
  StreamSubscription<AgentEvent>? _sub;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _sub?.cancel();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    });
  }

  Future<void> _send([String? prefilled]) async {
    if (_busy) return;
    final text = (prefilled ?? _ctrl.text).trim();
    if (text.isEmpty) return;

    final token = ref.read(authProvider).token;
    if (token == null) {
      setState(() => _error = 'You need to sign in.');
      return;
    }

    final user = _Msg(id: _id(), fromUser: true, content: text);
    final agent = _Msg(id: _id(), fromUser: false, content: '', streaming: true);
    setState(() {
      _msgs.add(user);
      _msgs.add(agent);
      _ctrl.clear();
      _busy = true;
      _error = null;
    });
    _scrollToEnd();

    final history = _msgs
        .where((m) => !m.streaming)
        .map((m) => {'role': m.fromUser ? 'user' : 'assistant', 'content': m.content})
        .toList();

    _sub = agentRepo.chat(messages: history, token: token).listen(
      (event) {
        switch (event.type) {
          case 'text_delta':
            if (event.text != null) {
              setState(() => agent.content += event.text!);
              _scrollToEnd();
            }
            break;
          case 'tool_use_start':
            if (event.toolName != null) {
              setState(() => agent.toolNames.add(event.toolName!));
            }
            break;
          case 'done':
            final extracted = _extractFollowUps(agent.content);
            setState(() {
              agent.content = extracted.cleaned;
              agent.followUps = extracted.followUps;
              agent.streaming = false;
              _busy = false;
            });
            break;
          case 'error':
            setState(() {
              agent.content = event.message ?? 'Agent error';
              agent.streaming = false;
              _busy = false;
              _error = event.message;
            });
            break;
        }
      },
      onError: (e) {
        setState(() {
          agent.content = e.toString();
          agent.streaming = false;
          _busy = false;
          _error = e.toString();
        });
      },
      onDone: () {
        if (agent.streaming) {
          setState(() {
            agent.streaming = false;
            _busy = false;
          });
        }
      },
    );
  }

  String _id() => DateTime.now().microsecondsSinceEpoch.toString();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(),
            Expanded(
              child: _msgs.isEmpty
                  ? const _EmptyAgent()
                  : ListView.builder(
                      controller: _scroll,
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                      itemCount: _msgs.length,
                      itemBuilder: (_, i) => _MsgBubble(msg: _msgs[i], onChip: _send),
                    ),
            ),
            if (_error != null && !_busy)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Text(_error!, style: RunqText.caption.copyWith(color: RunqColors.redInk)),
              ),
            _Composer(controller: _ctrl, busy: _busy, onSend: () => _send()),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: const BoxDecoration(color: RunqColors.purpleBg, shape: BoxShape.circle),
            child: const Center(child: Sparkle(size: 18, color: RunqColors.indigo, animated: true)),
          ),
          const SizedBox(width: 10),
          Text('Agent', style: RunqText.bodyStrong.copyWith(fontSize: 16)),
          const Spacer(),
          IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => context.pop()),
        ],
      ),
    );
  }
}

class _EmptyAgent extends StatelessWidget {
  const _EmptyAgent();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Sparkle(size: 36, color: RunqColors.indigo, animated: true),
          const SizedBox(height: 14),
          Text('Ask anything about your books', style: RunqText.h3, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(
            'How is cash trending? Who hasn\'t paid? What\'s due this week?',
            textAlign: TextAlign.center,
            style: RunqText.caption.copyWith(color: RT(context).muted),
          ),
        ],
      ),
    );
  }
}

class _MsgBubble extends StatelessWidget {
  final _Msg msg;
  final void Function(String) onChip;
  const _MsgBubble({required this.msg, required this.onChip});

  @override
  Widget build(BuildContext context) {
    final tk = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: msg.fromUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!msg.fromUser)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Sparkle(size: 10, color: tk.muted2),
                  const SizedBox(width: 4),
                  Text('AGENT', style: RunqText.micro.copyWith(color: tk.muted2)),
                  if (msg.toolNames.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Text('· ${msg.toolNames.last}',
                        style: RunqText.caption.copyWith(color: tk.muted2, fontSize: 11)),
                  ],
                ],
              ),
            ),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: msg.fromUser ? RunqColors.indigo : tk.surface,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(msg.fromUser ? 18 : 4),
                  bottomRight: Radius.circular(msg.fromUser ? 4 : 18),
                ),
                border: msg.fromUser ? null : Border.all(color: tk.hairline, width: 0.5),
              ),
              child: msg.streaming && msg.content.isEmpty
                  ? const _DotsLoader()
                  : Text(
                      msg.content,
                      style: RunqText.body.copyWith(color: msg.fromUser ? Colors.white : tk.ink),
                    ),
            ),
          ),
          if (msg.followUps.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in msg.followUps)
                  GestureDetector(
                    onTap: () => onChip(c),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: tk.surface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: tk.hairline, width: 0.5),
                      ),
                      child: Text(c,
                          style: RunqText.caption.copyWith(
                            color: RunqColors.indigo,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          )),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _DotsLoader extends StatefulWidget {
  const _DotsLoader();

  @override
  State<_DotsLoader> createState() => _DotsLoaderState();
}

class _DotsLoaderState extends State<_DotsLoader> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final phase = ((_c.value + i / 3) % 1.0);
            final scale = 0.5 + 0.5 * (1 - (phase * 2 - 1).abs());
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: Transform.scale(
                scale: scale,
                child: Container(
                  width: 6, height: 6,
                  decoration: BoxDecoration(color: RT(context).muted2, shape: BoxShape.circle),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final bool busy;
  final VoidCallback onSend;
  const _Composer({required this.controller, required this.busy, required this.onSend});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      child: Row(
        children: [
          Expanded(
            child: Container(
              constraints: const BoxConstraints(minHeight: 44),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: t.inputFill,
                borderRadius: BorderRadius.circular(12),
              ),
              child: TextField(
                controller: controller,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSend(),
                minLines: 1,
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: 'Ask anything…',
                  hintStyle: RunqText.body.copyWith(color: t.muted2),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
                style: RunqText.body.copyWith(color: t.ink),
              ),
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: busy ? null : onSend,
            child: Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: busy ? RunqColors.indigo.withValues(alpha: 0.6) : RunqColors.indigo,
                shape: BoxShape.circle,
                boxShadow: RunqShadows.fab,
              ),
              child: busy
                  ? const Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
                  : const Icon(Icons.send_rounded, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExtractedFollowUps {
  final String cleaned;
  final List<String> followUps;
  _ExtractedFollowUps({required this.cleaned, required this.followUps});
}

_ExtractedFollowUps _extractFollowUps(String content) {
  final lines = content.split('\n');
  for (var i = lines.length - 1; i >= 0; i--) {
    final line = lines[i].trim();
    if (line.isEmpty) continue;
    final match = RegExp(r'^follow_up:\s*(.+)$', caseSensitive: false).firstMatch(line);
    if (match != null) {
      final follows = match.group(1)!.split('|').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      final cleaned = lines.sublist(0, i).join('\n').trimRight();
      return _ExtractedFollowUps(cleaned: cleaned, followUps: follows);
    }
    break;
  }
  return _ExtractedFollowUps(cleaned: content, followUps: const []);
}
