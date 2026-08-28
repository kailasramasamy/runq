// Full-screen catalogue search, returning the picked item.
//
// Lifted out of the invoice form because it is not part of it: order line
// editing wants the same picker, and a second copy would drift the moment one
// of them learned about stock or price lists.

library;

import 'dart:async';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../screens/invoice/invoice_form_fields.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';

class ItemPickerScreen extends StatefulWidget {
  const ItemPickerScreen({super.key});

  @override
  State<ItemPickerScreen> createState() => ItemPickerScreenState();
}

class ItemPickerScreenState extends State<ItemPickerScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<ItemSummary> _results = const [];
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
      final res = await orderRepo.searchItems(q);
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
        _error = 'Could not load items';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Pick item'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(),
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
                decoration: invoiceInputDecoration(t, hint: 'Search by name or SKU'),
              ),
              const SizedBox(height: 12),
              // Results sit on their own surface rather than straight on the
              // page. On the warm background a bare list of tiles reads as
              // loose text; a card gives the rows an edge to align to and
              // makes the separators mean something.
              Expanded(
                child: Container(
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: t.surface,
                    borderRadius: BorderRadius.circular(RunqRadii.smallCard),
                    border: Border.all(color: t.hairline, width: 0.5),
                  ),
                  child: _buildList(t),
                ),
              ),
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
      return Center(child: Text('No items found', style: RunqText.body.copyWith(color: t.muted)));
    }
    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.zero,
      itemCount: _results.length,
      separatorBuilder: (_, __) =>
          Divider(height: 1, indent: 16, endIndent: 16, color: t.hairlineSoft),
      itemBuilder: (_, i) {
        final item = _results[i];
        return ListTile(
          title: Text(item.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          subtitle: Text(
            [
              if (item.sku.isNotEmpty) 'SKU ${item.sku}',
              if (item.unit != null && item.unit!.isNotEmpty) item.unit!,
              if (item.defaultSellingPrice != null) formatINR(item.defaultSellingPrice!),
            ].join(' · '),
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          trailing: Icon(Icons.chevron_right_rounded, color: t.muted2),
          onTap: () => Navigator.of(context).pop(item),
        );
      },
    );
  }
}
