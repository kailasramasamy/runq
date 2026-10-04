import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/to_pay_models.dart';
import '../../providers/to_pay_provider.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/list_filter_kit.dart';
import '../recurring/recurring_ledger_sections.dart';
import 'to_pay_hero.dart';
import 'to_pay_rows.dart';
import 'to_pay_sections.dart';
import 'to_pay_style.dart';

class ToPayScreen extends ConsumerStatefulWidget {
  const ToPayScreen({super.key});

  @override
  ConsumerState<ToPayScreen> createState() => _ToPayScreenState();
}

class _ToPayScreenState extends ConsumerState<ToPayScreen> {
  bool _byMonth = false;
  String? _category;
  final Map<String, GlobalKey> _sections = {};

  GlobalKey _sectionKey(String key) => _sections.putIfAbsent(key, GlobalKey.new);

  /// Bring a category's section into view (month view lists items by category).
  void _jumpTo(String key) {
    final ctx = _sections[key]?.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic, alignment: 0.02);
  }
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);

  String? get _key => _byMonth ? monthKey(_month) : null;

  bool get _canGoNext {
    final now = DateTime.now();
    return _month.isBefore(DateTime(now.year, now.month + 1));
  }

  void _step(int by) => setState(() => _month = DateTime(_month.year, _month.month + by));

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(toPayProvider(_key));
    return Scaffold(
      backgroundColor: t.bgWarmer,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: t.brand,
          onRefresh: () async => ref.invalidate(toPayProvider(_key)),
          child: CustomScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              const SliverToBoxAdapter(child: _Header()),
              SliverToBoxAdapter(child: _tabs()),
              if (_byMonth) SliverToBoxAdapter(child: _stepper(t)),
              SliverToBoxAdapter(
                child: AsyncSlot<ToPay>(
                  value: async,
                  onRetry: () => ref.invalidate(toPayProvider(_key)),
                  data: _content,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tabs() {
    Widget pill(String label, bool month) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: FilterPill(
            label: label,
            active: _byMonth == month,
            onTap: () => setState(() {
              _byMonth = month;
              _category = null;
            }),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Row(children: [pill('Outstanding', false), pill('By month', true)]),
    );
  }

  Widget _stepper(RunqTokens t) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => _step(-1),
            icon: Icon(Icons.chevron_left_rounded, color: t.ink),
          ),
          Expanded(
            child: Text(monthTitle(_month),
                textAlign: TextAlign.center,
                style: RunqText.bodyStrong.copyWith(color: t.ink)),
          ),
          IconButton(
            onPressed: _canGoNext ? () => _step(1) : null,
            icon: Icon(Icons.chevron_right_rounded, color: _canGoNext ? t.ink : t.muted2),
          ),
        ],
      ),
    );
  }

  Widget _content(ToPay data) {
    if (data.items.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(16, 40, 16, 120),
        child: EmptyState(
          icon: Icons.celebration_outlined,
          title: 'All caught up — nothing to pay',
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ToPayHero(data: data),
          const SizedBox(height: 16),
          _categories(data),
          const SizedBox(height: 24),
          ...toPaySections(data, _category, _sectionKey),
        ],
      ),
    );
  }

  Widget _categories(ToPay data) {
    return LedgerSection(
      title: 'By category',
      summary: '',
      emptyText: '',
      rows: [
        for (final c in data.categories)
          ToPayCategoryRow(
            c: c,
            month: data.isMonth,
            selected: !data.isMonth && _category == c.key,
            onTap: data.isMonth
                ? () => _jumpTo(c.key)
                : () => setState(() => _category = _category == c.key ? null : c.key),
          ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Money', style: RunqText.body.copyWith(color: t.muted)),
                Text('To pay', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
