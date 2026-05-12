import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_card.dart';

/// A typed card frame with title, optional subtitle/trailing, an async body
/// that handles loading / empty / error consistently, and an optional drill
/// footer. Keeps card visual language consistent across the analytics page.
class MetricCard<T> extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final AsyncValue<T?> value;
  final Widget Function(T data) builder;
  final String? emptyHint;
  final VoidCallback? onTap;
  final String? footerLabel;

  const MetricCard({
    super.key,
    required this.title,
    required this.value,
    required this.builder,
    this.subtitle,
    this.trailing,
    this.emptyHint,
    this.onTap,
    this.footerLabel,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Header(title: title, subtitle: subtitle, trailing: trailing),
          const SizedBox(height: 12),
          value.when(
            data: (d) => d == null
                ? _EmptyBlock(hint: emptyHint ?? 'No data yet')
                : builder(d),
            loading: () => const _Skeleton(),
            error: (e, _) => _ErrorBlock(message: e.toString()),
          ),
          if (footerLabel != null && onTap != null) ...[
            const SizedBox(height: 14),
            _DrillFooter(label: footerLabel!, color: t.brand),
          ],
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  const _Header({required this.title, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title,
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!,
                    style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _DrillFooter extends StatelessWidget {
  final String label;
  final Color color;
  const _DrillFooter({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label,
            style: RunqText.caption.copyWith(
                color: color, fontWeight: FontWeight.w600, fontSize: 12)),
        Icon(Icons.arrow_forward_rounded, size: 14, color: color),
      ],
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget bar(double w, double h) => Container(
          width: w,
          height: h,
          decoration: BoxDecoration(
            color: t.bgWarmer,
            borderRadius: BorderRadius.circular(6),
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        bar(140, 24),
        const SizedBox(height: 10),
        bar(220, 12),
        const SizedBox(height: 6),
        bar(180, 12),
      ],
    );
  }
}

class _EmptyBlock extends StatelessWidget {
  final String hint;
  const _EmptyBlock({required this.hint});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(hint, style: RunqText.caption.copyWith(color: t.muted2)),
    );
  }
}

class _ErrorBlock extends StatelessWidget {
  final String message;
  const _ErrorBlock({required this.message});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Icon(Icons.cloud_off_rounded, size: 14, color: t.muted),
        const SizedBox(width: 6),
        Expanded(
          child: Text("Couldn't load",
              style: RunqText.caption.copyWith(color: t.muted, fontSize: 12)),
        ),
      ],
    );
  }
}

/// Big tabular number used as the headline within a card body.
class BigNumber extends StatelessWidget {
  final String text;
  final Color? color;
  final double size;
  const BigNumber(this.text, {super.key, this.color, this.size = 22});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Text(
      text,
      style: RunqText.tabular(size: size, w: FontWeight.w700, color: color ?? t.ink),
    );
  }
}

class StatusPill extends StatelessWidget {
  final String text;
  final StatusTone tone;
  const StatusPill(this.text, {super.key, this.tone = StatusTone.neutral});

  @override
  Widget build(BuildContext context) {
    final (bg, ink) = switch (tone) {
      StatusTone.ok => (RunqColors.greenBg, RunqColors.greenInk),
      StatusTone.warn => (RunqColors.amberBg, RunqColors.amberInk),
      StatusTone.neg => (RunqColors.redBg, RunqColors.redInk),
      StatusTone.info => (RunqColors.blueBg, RunqColors.blueInk),
      StatusTone.neutral => (RunqColors.grayBg, RunqColors.grayInk),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(text,
          style: RunqText.caption.copyWith(
              color: ink, fontWeight: FontWeight.w600, fontSize: 11)),
    );
  }
}

enum StatusTone { ok, warn, neg, info, neutral }

/// A labelled row used inside card bodies (label left, tabular value right).
class StatRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final bool emphasize;
  const StatRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.emphasize = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: RunqText.caption.copyWith(
                    color: emphasize ? t.ink : t.muted, fontSize: 12.5)),
          ),
          Text(value,
              style: RunqText.tabular(
                  size: 12.5,
                  w: emphasize ? FontWeight.w700 : FontWeight.w500,
                  color: valueColor ?? t.ink)),
        ],
      ),
    );
  }
}
