import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';

class AsyncSlot<T> extends StatelessWidget {
  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget? loading;
  final VoidCallback? onRetry;
  const AsyncSlot({super.key, required this.value, required this.data, this.loading, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: data,
      loading: () => loading ?? const _DefaultLoading(),
      error: (e, _) => _ErrorView(error: e, onRetry: onRetry),
    );
  }
}

class _DefaultLoading extends StatelessWidget {
  const _DefaultLoading();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: SizedBox(
          width: 22, height: 22,
          child: CircularProgressIndicator(strokeWidth: 2, color: RT(context).brand),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final Object error;
  final VoidCallback? onRetry;
  const _ErrorView({required this.error, this.onRetry});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_rounded, size: 28, color: t.muted),
          const SizedBox(height: 8),
          Text("Couldn't load", style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(_message(error),
              textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted)),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            FilledButton.tonal(onPressed: onRetry, child: const Text('Retry')),
          ],
        ],
      ),
    );
  }

  String _message(Object e) {
    final s = e.toString();
    return s.length > 200 ? '${s.substring(0, 200)}…' : s;
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  const EmptyState({super.key, required this.icon, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 32, color: t.muted2),
          const SizedBox(height: 8),
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!,
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ],
      ),
    );
  }
}
