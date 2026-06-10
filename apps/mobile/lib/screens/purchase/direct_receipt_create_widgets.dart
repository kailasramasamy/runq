// Form primitives + batch picker + item picker for the direct-receipt
// create screen. Kept as a `part` so the screen file stays under the
// 500-line cap while sharing its imports.

part of 'direct_receipt_create_screen.dart';

/// Uppercase group heading, e.g. "What and how much" / "Batch + transport".
class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Text(
        label.toUpperCase(),
        style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5),
      ),
    );
  }
}

/// Themed text field — filled surface, hairline border, brand-violet focus.
/// Matches the app's input styling used across inventory / purchase forms.
class _TextField extends StatelessWidget {
  const _TextField({
    required this.label,
    required this.controller,
    this.number = false,
    this.caps = false,
    this.hint,
    this.lines = 1,
    this.onChanged,
  });
  final String label;
  final TextEditingController controller;
  final bool number;
  final bool caps;
  final String? hint;
  final int lines;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          keyboardType:
              number ? const TextInputType.numberWithOptions(decimal: true) : null,
          textCapitalization:
              caps ? TextCapitalization.sentences : TextCapitalization.none,
          maxLines: lines,
          onChanged: onChanged == null ? null : (_) => onChanged!(),
          style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
          decoration: _fieldDecoration(context, hint: hint),
        ),
      ],
    );
  }
}

/// Tappable read-only field used for the item picker and the date pickers.
/// Same fill / border / radius as [_TextField] for a consistent rhythm.
class _TapField extends StatelessWidget {
  const _TapField({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
    this.hint,
  });
  final IconData icon;
  final String label;
  final String? value;
  final String? hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final shown = (value == null || value!.isEmpty) ? null : value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: RunqText.micro.copyWith(color: t.muted2, letterSpacing: 0.3)),
        const SizedBox(height: 4),
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: t.bgWarmer,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: t.hairline),
            ),
            child: Row(
              children: [
                Icon(icon, size: 18, color: t.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    shown ?? (hint ?? 'Select…'),
                    style: RunqText.body.copyWith(
                      color: shown == null ? t.muted2 : t.ink,
                      fontSize: 14,
                    ),
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: t.muted2),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

InputDecoration _fieldDecoration(BuildContext context, {String? hint}) {
  final t = RT(context);
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c, width: w),
      );
  return InputDecoration(
    isDense: true,
    filled: true,
    fillColor: t.bgWarmer,
    hintText: hint,
    hintStyle: RunqText.body.copyWith(color: t.muted2, fontSize: 14),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: border(t.hairline),
    enabledBorder: border(t.hairline),
    focusedBorder: border(PurColors.brand(context), 1.2),
  );
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: PurColors.orangeAlertBg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 16, color: PurColors.orangeAlert),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: RunqText.caption.copyWith(color: PurColors.orangeAlert)),
          ),
        ],
      ),
    );
  }
}

// ── Batch picker ────────────────────────────────────────────────────────────
// Lists open batches (on-hand > 0) for the item × warehouse as one-tap chips
// so a fresh receipt pools into an existing batch without retyping, plus a
// "New" chip from the item's code template. Free text stays available.

class _BatchField extends StatefulWidget {
  const _BatchField({
    required this.controller,
    required this.itemId,
    required this.warehouseId,
    required this.required,
    required this.itemName,
  });
  final TextEditingController controller;
  final String? itemId;
  final String? warehouseId;
  final bool required;
  final String itemName;

  @override
  State<_BatchField> createState() => _BatchFieldState();
}

class _BatchFieldState extends State<_BatchField> {
  List<OpenBatch> _open = const [];
  String? _suggested;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(_BatchField old) {
    super.didUpdateWidget(old);
    if (old.itemId != widget.itemId || old.warehouseId != widget.warehouseId) {
      _load();
    }
  }

  Future<void> _load() async {
    final id = widget.itemId, wh = widget.warehouseId;
    if (id == null || wh == null) {
      setState(() {
        _open = const [];
        _suggested = null;
      });
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await purchaseRepo.openBatches(id, wh);
      if (!mounted) return;
      setState(() {
        _open = res.open;
        _suggested = res.suggested;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _pick(String code) {
    widget.controller.text = code;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final val = widget.controller.text;
    final showSuggested = _suggested != null && _suggested != val;
    final ready = widget.itemId != null && widget.warehouseId != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (ready && !_loading && (_open.isNotEmpty || showSuggested)) ...[
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final b in _open)
                _BatchChip(
                  label: '${b.batchNo} · ${_fmtQty(b.onHandQty)}'
                      '${b.expiryDate != null ? ' · exp ${b.expiryDate}' : ''}',
                  active: val == b.batchNo,
                  onTap: () => _pick(b.batchNo),
                ),
              if (showSuggested)
                _BatchChip(
                  label: '+ New: $_suggested',
                  active: false,
                  suggest: true,
                  onTap: () => _pick(_suggested!),
                ),
            ],
          ),
          const SizedBox(height: 8),
        ],
        _TextField(
          label: widget.required ? 'Batch *' : 'Batch',
          controller: widget.controller,
          hint: widget.required
              ? 'Required — ${widget.itemName} is batch-tracked'
              : 'Optional',
          onChanged: () => setState(() {}),
        ),
        if (ready && !_loading && _open.isEmpty && !showSuggested)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'No open batches for this item × warehouse yet — type a fresh code.',
              style: RunqText.micro.copyWith(color: t.muted),
            ),
          ),
      ],
    );
  }

  static String _fmtQty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);
}

class _BatchChip extends StatelessWidget {
  const _BatchChip({
    required this.label,
    required this.active,
    required this.onTap,
    this.suggest = false,
  });
  final String label;
  final bool active;
  final bool suggest;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    final Color bg, fg, border;
    if (active) {
      bg = PurColors.violetTint;
      fg = brand;
      border = brand;
    } else if (suggest) {
      bg = Colors.transparent;
      fg = brand;
      border = brand.withValues(alpha: 0.5);
    } else {
      bg = t.bgWarmer;
      fg = t.ink;
      border = t.hairline;
    }
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Text(label,
            style: RunqText.micro.copyWith(color: fg, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

// ── Item picker ─────────────────────────────────────────────────────────────
// Name/SKU search over the item master, filtered to input classes so the
// list mirrors the web form. Returns the full InvItem so the screen can read
// its batch / expiry / serial tracking flags.

class _ItemPickerSheet extends StatefulWidget {
  const _ItemPickerSheet();
  @override
  State<_ItemPickerSheet> createState() => _ItemPickerSheetState();
}

class _ItemPickerSheetState extends State<_ItemPickerSheet> {
  final _ctl = TextEditingController();
  List<InvItem> _results = [];
  bool _loading = false;
  String _lastQuery = '';

  @override
  void initState() {
    super.initState();
    _search('');
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    setState(() {
      _loading = true;
      _lastQuery = q;
    });
    try {
      final res = await inventoryRepo.searchItems(q,
          limit: 50, itemClassGroup: _inputsClassGroup);
      if (!mounted || _lastQuery != q) return;
      setState(() => _results = res);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtl) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 8),
              decoration:
                  BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                controller: _ctl,
                autofocus: true,
                onChanged: _search,
                textCapitalization: TextCapitalization.none,
                style: RunqText.body.copyWith(color: t.ink, fontSize: 14),
                decoration: _fieldDecoration(context, hint: 'Search input items…')
                    .copyWith(prefixIcon: const Icon(Icons.search_rounded)),
              ),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _results.isEmpty
                  ? Center(
                      child: Text('No input items',
                          style: RunqText.caption.copyWith(color: t.muted)))
                  : ListView.separated(
                      controller: scrollCtl,
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      itemCount: _results.length,
                      separatorBuilder: (_, _) => Divider(height: 1, color: t.hairline),
                      itemBuilder: (_, i) {
                        final item = _results[i];
                        return ListTile(
                          title: Text(item.name,
                              style: RunqText.bodyStrong.copyWith(color: t.ink)),
                          subtitle: item.sku != null
                              ? Text(item.sku!,
                                  style: RunqText.caption.copyWith(color: t.muted))
                              : null,
                          onTap: () => Navigator.pop(context, item),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
