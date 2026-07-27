import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';

const double _cellW = 72; // column width (data + SNF header + FAT/corner header)
const double _headerH = 40; // top SNF-header band height
const double _rowH = 48; // data-row height
const double _maxBodyH = 6 * _rowH; // cap so the matrix never eats the screen

/// FAT × SNF rate matrix with frozen headers: the top SNF row and the left FAT
/// column stay pinned while the grid scrolls, so any cell keeps its row/column
/// labels visible. Highlights the cell nearest [lastFat]/[lastSnf].
class RateMatrix extends StatefulWidget {
  const RateMatrix({
    super.key,
    required this.cells,
    required this.lastFat,
    required this.lastSnf,
  });

  final List<MpRateCell> cells;
  final double? lastFat;
  final double? lastSnf;

  @override
  State<RateMatrix> createState() => _RateMatrixState();
}

class _RateMatrixState extends State<RateMatrix> {
  final _bodyH = ScrollController(); // grid horizontal — drives the SNF header
  final _bodyV = ScrollController(); // grid vertical — drives the FAT header
  final _colH = ScrollController(); // SNF header (follows _bodyH)
  final _rowV = ScrollController(); // FAT header (follows _bodyV)

  @override
  void initState() {
    super.initState();
    // Header controllers are NeverScrollable, so this one-way sync can't loop.
    _bodyH.addListener(() => _mirror(_bodyH, _colH));
    _bodyV.addListener(() => _mirror(_bodyV, _rowV));
  }

  void _mirror(ScrollController from, ScrollController to) {
    if (to.hasClients && to.offset != from.offset) to.jumpTo(from.offset);
  }

  @override
  void dispose() {
    for (final c in [_bodyH, _bodyV, _colH, _rowV]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    if (widget.cells.isEmpty) {
      return Text(l.farmerRateNoMatrixData, style: DhenuText.body.copyWith(color: t.inkSoft));
    }
    final fatVals = widget.cells.map((c) => c.fat).toSet().toList()..sort();
    final snfVals = widget.cells.map((c) => c.snf).toSet().toList()..sort();
    final highlighted = _findNearest();
    final fullH = fatVals.length * _rowH;
    final bodyH = math.min(fullH, _maxBodyH);
    // Only own the vertical gesture when the grid actually overflows the cap,
    // so a short matrix doesn't trap the page's scroll.
    final vScrolls = fullH > _maxBodyH;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _topBand(t, snfVals),
        SizedBox(
          height: bodyH,
          child: Row(children: [
            _fatHeaderColumn(t, fatVals),
            Expanded(child: _grid(t, fatVals, snfVals, highlighted, vScrolls)),
          ]),
        ),
      ],
    );
  }

  // Corner + frozen SNF header row (scrolls horizontally with the grid).
  Widget _topBand(DhenuTokens t, List<double> snfVals) => Row(children: [
        _headerCell(t, 'FAT↓ SNF→', _cellW, _headerH),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            controller: _colH,
            physics: const NeverScrollableScrollPhysics(),
            child: Row(children: [
              for (final s in snfVals) _headerCell(t, oneDp(s), _cellW, _headerH),
            ]),
          ),
        ),
      ]);

  // Frozen FAT header column (scrolls vertically with the grid).
  Widget _fatHeaderColumn(DhenuTokens t, List<double> fatVals) => SizedBox(
        width: _cellW,
        child: SingleChildScrollView(
          controller: _rowV,
          physics: const NeverScrollableScrollPhysics(),
          child: Column(children: [
            for (final f in fatVals) _headerCell(t, oneDp(f), _cellW, _rowH),
          ]),
        ),
      );

  // Two-axis scrollable data grid; both controllers drive the frozen headers.
  Widget _grid(DhenuTokens t, List<double> fatVals, List<double> snfVals,
          MpRateCell? highlighted, bool vScrolls) =>
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        controller: _bodyH,
        child: SizedBox(
          width: snfVals.length * _cellW,
          child: SingleChildScrollView(
            controller: _bodyV,
            physics: vScrolls ? null : const NeverScrollableScrollPhysics(),
            child: Column(children: [
              for (final f in fatVals)
                Row(children: [
                  for (final s in snfVals)
                    _dataCell(
                      t,
                      _rateAt(f, s),
                      highlighted != null && highlighted.fat == f && highlighted.snf == s,
                    ),
                ]),
            ]),
          ),
        ),
      );

  double _rateAt(double f, double s) => widget.cells
      .firstWhere((c) => c.fat == f && c.snf == s,
          orElse: () => MpRateCell(id: '', fat: f, snf: s, ratePerLitre: 0))
      .ratePerLitre;

  Widget _headerCell(DhenuTokens t, String text, double w, double h) => Container(
        width: w,
        height: h,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: t.hairline, border: Border.all(color: t.hairline)),
        child: Text(
          text,
          style: DhenuText.caption.copyWith(color: t.inkSoft),
          overflow: TextOverflow.ellipsis,
        ),
      );

  Widget _dataCell(DhenuTokens t, double rate, bool highlighted) => Container(
        width: _cellW,
        height: _rowH,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: highlighted ? t.brandSubtle : t.card,
          border: highlighted
              ? Border.all(color: t.brand, width: 2)
              : Border.all(color: t.hairline),
        ),
        child: Text(
          rupees(rate),
          style: DhenuText.number(size: 13, color: highlighted ? t.brand : t.ink),
        ),
      );

  MpRateCell? _findNearest() {
    if (widget.lastFat == null || widget.lastSnf == null || widget.cells.isEmpty) return null;
    return widget.cells.reduce((a, b) {
      final da = (a.fat - widget.lastFat!).abs() + (a.snf - widget.lastSnf!).abs();
      final db = (b.fat - widget.lastFat!).abs() + (b.snf - widget.lastSnf!).abs();
      return da <= db ? a : b;
    });
  }
}

/// CLR (lactometer) breakpoint table — highlights the row that priced the
/// farmer's last pour (nearest-floor, matching the server's resolution).
class ClrRateTable extends StatelessWidget {
  const ClrRateTable({super.key, required this.cells, required this.lastClr});

  final List<MpRateCell> cells;
  final double? lastClr;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final rows = cells.where((c) => c.clr != null).toList()
      ..sort((a, b) => a.clr!.compareTo(b.clr!));
    if (rows.isEmpty) {
      return Text(l.farmerRateNoMatrixData, style: DhenuText.body.copyWith(color: t.inkSoft));
    }
    final highlighted = _floorRow(rows);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(children: [_headerCell(t, 'CLR'), _headerCell(t, '₹ / L')]),
        ...rows.map((c) => Row(children: [
              _cell(t, oneDp(c.clr!), identical(c, highlighted), header: true),
              _cell(t, rupees(c.ratePerLitre), identical(c, highlighted)),
            ])),
      ],
    );
  }

  /// Largest row with clr ≤ lastClr — the server's nearest-floor pick.
  MpRateCell? _floorRow(List<MpRateCell> rows) {
    if (lastClr == null) return null;
    MpRateCell? best;
    for (final c in rows) {
      if (c.clr! <= lastClr!) best = c;
    }
    return best;
  }

  Widget _headerCell(DhenuTokens t, String text) => Container(
        width: 108,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: t.hairline,
          border: Border.all(color: t.hairline),
        ),
        child: Text(text, style: DhenuText.caption.copyWith(color: t.inkSoft)),
      );

  Widget _cell(DhenuTokens t, String text, bool highlighted, {bool header = false}) =>
      Container(
        width: 108,
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: highlighted ? t.brandSubtle : (header ? t.hairline : t.card),
          border: highlighted
              ? Border.all(color: t.brand, width: 2)
              : Border.all(color: t.hairline),
        ),
        child: Text(
          text,
          style: DhenuText.number(size: 13, color: highlighted ? t.brand : t.ink),
        ),
      );
}
