import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'runq_card.dart';

/// 2-col grid tile for section hubs.
///
/// Shows an icon chip, title, primary metric, and an optional caption /
/// trend chip. Tap takes the user into the matching list/feature screen.
class HubSectionTile extends StatelessWidget {
  final IconData icon;
  final Color iconBg;
  final Color iconFg;
  final String title;
  final String metric;
  final String? caption;
  final Color? captionColor;
  final VoidCallback onTap;

  const HubSectionTile({
    super.key,
    required this.icon,
    required this.iconBg,
    required this.iconFg,
    required this.title,
    required this.metric,
    this.caption,
    this.captionColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      // Icon row pinned top, text block pinned bottom — Spacer eats any
      // height the grid hands us so the column never overflows.
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 32,
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  alignment: Alignment.center,
                  child: Icon(icon, size: 16, color: iconFg),
                ),
                const Spacer(),
                Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
              ],
            ),
          ),
          const Spacer(),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: RunqText.caption.copyWith(
              color: t.muted,
              height: 1.2,
              letterSpacing: 0.04 * 11,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            metric,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: RunqText.tabular(size: 17, w: FontWeight.w700, color: t.ink)
                .copyWith(height: 1.15),
          ),
          if (caption != null) ...[
            const SizedBox(height: 2),
            Text(
              caption!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(
                color: captionColor ?? t.muted,
                height: 1.2,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 2-col layout for HubSectionTiles. Hand-rolled with Rows + a fixed tile
/// height so the parent sliver can't reserve an extra empty row's worth
/// of space the way SliverGridDelegate sometimes does.
class HubSectionGrid extends StatelessWidget {
  final List<Widget> tiles;
  static const _tileHeight = 118.0;
  static const _gap = 12.0;
  const HubSectionGrid({super.key, required this.tiles});

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < tiles.length; i += 2) {
      final left = tiles[i];
      final right = i + 1 < tiles.length ? tiles[i + 1] : null;
      rows.add(SizedBox(
        height: _tileHeight,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: left),
            const SizedBox(width: _gap),
            Expanded(child: right ?? const SizedBox.shrink()),
          ],
        ),
      ));
      if (i + 2 < tiles.length) rows.add(const SizedBox(height: _gap));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: rows,
    );
  }
}
