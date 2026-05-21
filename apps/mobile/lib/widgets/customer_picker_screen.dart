import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import 'avatar.dart';

/// Full-screen searchable customer picker. Returns the selected
/// [CustomerSummary] via Navigator pop, or null if dismissed. Used for
/// the new-invoice form, PO draft customer reassignment, and any other
/// flow that needs to pick a single customer from the masters.
Future<CustomerSummary?> showCustomerPicker(
  BuildContext context, {
  String? currentCustomerId,
}) {
  return Navigator.of(context).push<CustomerSummary>(
    MaterialPageRoute(
      builder: (_) => CustomerPickerScreen(currentCustomerId: currentCustomerId),
    ),
  );
}

class CustomerPickerScreen extends StatefulWidget {
  final String? currentCustomerId;
  const CustomerPickerScreen({super.key, this.currentCustomerId});

  @override
  State<CustomerPickerScreen> createState() => _CustomerPickerScreenState();
}

class _CustomerPickerScreenState extends State<CustomerPickerScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<CustomerSummary> _results = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _runQuery('');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () => _runQuery(q));
  }

  Future<void> _runQuery(String q) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await customersRepo.list(search: q);
      if (!mounted) return;
      setState(() {
        _results = res;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load customers';
        _loading = false;
      });
    }
  }

  InputDecoration _decoration(RunqTokens t) => InputDecoration(
        isDense: true,
        filled: true,
        fillColor: t.inputFill,
        hintText: 'Search by name',
        hintStyle: RunqText.body.copyWith(color: t.muted),
        prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
        prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline, width: 0.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline, width: 0.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: RunqColors.indigo, width: 1),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Pick customer'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: Column(
            children: [
              TextField(
                controller: _ctrl,
                autofocus: true,
                onChanged: _onChanged,
                decoration: _decoration(t),
              ),
              const SizedBox(height: 12),
              Expanded(child: _buildList(t)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildList(RunqTokens t) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text(_error!, style: RunqText.body.copyWith(color: RunqColors.redInk)));
    }
    if (_results.isEmpty) {
      return Center(child: Text('No customers found', style: RunqText.body.copyWith(color: t.muted)));
    }
    // Float the currently-selected customer to the top so it's the first
    // thing the user sees — saves a search when they're just confirming
    // the existing assignment or reviewing it.
    final currentId = widget.currentCustomerId;
    final ordered = [..._results];
    if (currentId != null) {
      final idx = ordered.indexWhere((c) => c.id == currentId);
      if (idx > 0) {
        final cur = ordered.removeAt(idx);
        ordered.insert(0, cur);
      }
    }
    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      itemCount: ordered.length,
      separatorBuilder: (_, __) => Divider(height: 1, color: t.hairlineSoft),
      itemBuilder: (_, i) {
        final c = ordered[i];
        final selected = c.id == currentId;
        return _CustomerTile(
          customer: c,
          selected: selected,
          onTap: () => Navigator.of(context).pop(c),
        );
      },
    );
  }
}

class _CustomerTile extends StatelessWidget {
  final CustomerSummary customer;
  final bool selected;
  final VoidCallback onTap;
  const _CustomerTile({
    required this.customer,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: selected ? RunqColors.indigo.withValues(alpha: 0.08) : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
          child: Row(
            children: [
              RqAvatar(name: customer.name, size: 36),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            customer.name,
                            style: RunqText.bodyStrong.copyWith(
                              color: selected ? RunqColors.indigo : t.ink,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (selected) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: RunqColors.indigo,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              'CURRENT',
                              style: RunqText.micro.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (customer.gstin != null && customer.gstin!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(customer.gstin!,
                          style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.chevron_right_rounded,
                color: selected ? RunqColors.indigo : t.muted2,
                size: selected ? 20 : 24,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
