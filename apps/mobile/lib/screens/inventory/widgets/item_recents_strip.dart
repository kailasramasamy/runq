// "Recently opened" — the shortcut row above the Items list.
//
// Horizontal chips rather than full cards: this is a jump list, not a
// reading list, and the whole point is that it costs no vertical space worth
// scrolling past. It shows only when the list is otherwise unfiltered, so it
// never competes with an answer the user is actively narrowing.

library;

import 'package:flutter/material.dart';

import '../../../services/item_recents.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

class ItemRecentsStrip extends StatelessWidget {
  const ItemRecentsStrip({
    super.key,
    required this.items,
    required this.onTap,
    required this.onClear,
  });

  final List<RecentItem> items;
  final void Function(RecentItem) onTap;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 2, 10, 4),
          child: Row(
            children: [
              Icon(Icons.history_rounded, size: 13, color: t.muted2),
              const SizedBox(width: 6),
              Text(
                'RECENTLY OPENED',
                style: RunqText.label.copyWith(color: t.muted),
              ),
              const Spacer(),
              InkWell(
                onTap: onClear,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  child: Text(
                    'Clear',
                    style: RunqText.caption.copyWith(color: t.muted2),
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 38,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (_, i) => _Chip(item: items[i], onTap: onTap),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.item, required this.onTap});
  final RecentItem item;
  final void Function(RecentItem) onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => onTap(item),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          constraints: const BoxConstraints(maxWidth: 200),
          decoration: BoxDecoration(
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.inventory_2_outlined,
                size: 14,
                color: InvColors.brand(context),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  item.name,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
