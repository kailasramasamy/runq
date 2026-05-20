// Builds an "official" payslip PDF the employee can share / save. Layout
// modelled on the standard Indian payroll format: company header, period
// + employee block, days summary, earnings + deductions tables, net pay
// box with amount-in-words, machine-generated footer.
//
// Scope intentionally narrow today: uses only data the mobile client
// already has (HrPayslip, HrEmployeeBrief, /settings/company name).
// Future polish — PAN / UAN / bank a/c / signature image / company logo
// — would attach to this builder without changing the call site.

library;

import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../api/hr_models.dart';

class PayslipPdf {
  final HrPayslip slip;
  final String employeeName;
  final String employeeCode;
  final String? companyName;
  final String? designationName;
  final String? departmentName;

  PayslipPdf({
    required this.slip,
    required this.employeeName,
    required this.employeeCode,
    this.companyName,
    this.designationName,
    this.departmentName,
  });

  /// Renders the payslip to a temp PDF file and returns its path. Caller
  /// passes the path to Share.shareXFiles. The filename embeds the
  /// period so received files don't all read "payslip.pdf" in the chat.
  Future<File> save() async {
    final dir = await getTemporaryDirectory();
    final filename = 'Payslip-${_fileSafe(employeeCode)}-${slip.year}-${slip.month.toString().padLeft(2, '0')}.pdf';
    final file = File('${dir.path}/$filename');
    final bytes = await _render();
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  Future<List<int>> _render() async {
    // Default PDF Helvetica is ASCII-only — it can't draw ₹ (U+20B9) or
    // em-dash. NotoSans covers all Indic + currency glyphs we need.
    // PdfGoogleFonts downloads on first use and caches locally.
    final regular = await PdfGoogleFonts.notoSansRegular();
    final bold = await PdfGoogleFonts.notoSansBold();
    final italic = await PdfGoogleFonts.notoSansItalic();
    final theme = pw.ThemeData.withFont(
      base: regular,
      bold: bold,
      italic: italic,
    );
    final doc = pw.Document(theme: theme);
    final headerFmt = pw.TextStyle(fontSize: 9, color: PdfColors.grey700);
    final labelFmt = pw.TextStyle(fontSize: 9, color: PdfColors.grey700);
    final valueFmt = pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold);

    final net = slip.netPay < 0 ? 0.0 : slip.netPay;
    final owed = slip.netPay < 0 ? -slip.netPay : 0.0;

    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(28, 32, 28, 28),
      build: (ctx) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          // Company header
          pw.Text(companyName ?? 'Company', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 2),
          pw.Text('Payslip for ${slip.periodLabel}', style: headerFmt.copyWith(fontSize: 11)),
          pw.SizedBox(height: 16),
          pw.Divider(thickness: 0.6, color: PdfColors.grey400),

          // Employee block — two columns
          pw.SizedBox(height: 10),
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(
                child: _kvBlock([
                  ('Employee name', employeeName),
                  ('Employee code', employeeCode),
                  if (designationName != null) ('Designation', designationName!),
                  if (departmentName != null) ('Department', departmentName!),
                ], labelFmt: labelFmt, valueFmt: valueFmt),
              ),
              pw.SizedBox(width: 16),
              pw.Expanded(
                child: _kvBlock([
                  ('Pay period', slip.periodLabel),
                  ('Run status', slip.runStatus.toUpperCase()),
                  ('Days in month', _fmtDays(slip.workingDays)),
                  ('Days paid', _fmtDays(slip.paidDays)),
                  ('Loss of pay', _fmtDays(slip.lopDays)),
                ], labelFmt: labelFmt, valueFmt: valueFmt),
              ),
            ],
          ),
          pw.SizedBox(height: 18),

          // Earnings + Deductions side-by-side
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(child: _moneyTable(
                title: 'Earnings',
                rows: slip.earnings.map((c) => (c.name, c.amount)).toList(),
                total: ('Gross earnings', slip.gross),
              )),
              pw.SizedBox(width: 12),
              pw.Expanded(child: _moneyTable(
                title: 'Deductions',
                rows: slip.deductions.map((c) => (c.name, c.amount)).toList(),
                total: ('Total deductions', slip.totalDeductions),
              )),
            ],
          ),
          pw.SizedBox(height: 18),

          // Net pay box
          pw.Container(
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
              color: PdfColors.indigo50,
              borderRadius: pw.BorderRadius.circular(6),
              border: pw.Border.all(color: PdfColors.indigo200, width: 0.6),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Row(
                  children: [
                    pw.Expanded(
                      child: pw.Text('Net pay (take-home)',
                          style: pw.TextStyle(fontSize: 11, color: PdfColors.indigo800)),
                    ),
                    pw.Text(_fmtINR(net),
                        style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: PdfColors.indigo900)),
                  ],
                ),
                pw.SizedBox(height: 4),
                pw.Text(_amountInWords(net),
                    style: pw.TextStyle(fontSize: 9, fontStyle: pw.FontStyle.italic, color: PdfColors.indigo700)),
                if (owed > 0) ...[
                  pw.SizedBox(height: 6),
                  pw.Text('${_fmtINR(owed)} due to company — check with HR',
                      style: pw.TextStyle(fontSize: 9, color: PdfColors.red700)),
                ],
              ],
            ),
          ),
          pw.Spacer(),

          // Footer
          pw.Divider(thickness: 0.4, color: PdfColors.grey300),
          pw.SizedBox(height: 4),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('Computer-generated payslip — no signature required',
                  style: pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
              pw.Text('Generated by runQ · ${_today()}',
                  style: pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
            ],
          ),
        ],
      ),
    ));

    return doc.save();
  }

  pw.Widget _kvBlock(List<(String, String)> rows, {required pw.TextStyle labelFmt, required pw.TextStyle valueFmt}) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        for (final (label, value) in rows) ...[
          pw.Text(label, style: labelFmt),
          pw.SizedBox(height: 1),
          pw.Text(value, style: valueFmt),
          pw.SizedBox(height: 6),
        ],
      ],
    );
  }

  pw.Widget _moneyTable({
    required String title,
    required List<(String, double)> rows,
    required (String, double) total,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        pw.Container(
          padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          color: PdfColors.grey200,
          child: pw.Text(title.toUpperCase(),
              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, letterSpacing: 0.5)),
        ),
        ...rows.map((r) => pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey300, width: 0.4)),
              ),
              child: pw.Row(
                children: [
                  pw.Expanded(child: pw.Text(r.$1, style: const pw.TextStyle(fontSize: 10))),
                  pw.Text(_fmtINR(r.$2), style: const pw.TextStyle(fontSize: 10)),
                ],
              ),
            )),
        pw.Container(
          padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          color: PdfColors.grey100,
          child: pw.Row(
            children: [
              pw.Expanded(child: pw.Text(total.$1, style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold))),
              pw.Text(_fmtINR(total.$2), style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
            ],
          ),
        ),
      ],
    );
  }

  String _today() {
    final now = DateTime.now();
    return '${now.day} ${_monthName(now.month)} ${now.year}';
  }

  static String _monthName(int m) => const [
        '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ][m];

  static String _fmtDays(double v) => v.toStringAsFixed(v % 1 == 0 ? 0 : 2);

  static String _fmtINR(double v) {
    // Indian grouping with two decimals — payslip convention.
    final neg = v < 0;
    final abs = v.abs();
    final whole = abs.truncate();
    final paise = ((abs - whole) * 100).round();
    final s = whole.toString();
    final buf = StringBuffer();
    var count = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      buf.write(s[i]);
      count++;
      if (i == 0) break;
      if (count == 3 || (count > 3 && (count - 3) % 2 == 0)) buf.write(',');
    }
    final body = buf.toString().split('').reversed.join();
    return '${neg ? '-' : ''}₹$body.${paise.toString().padLeft(2, '0')}';
  }

  static String _fileSafe(String s) => s.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');

  // Crude "amount in words" for INR — handles up to 9,99,99,999. Skips the
  // paise (mobile-payroll convention is rupees-only in words; the figure
  // above already shows the .XX).
  static String _amountInWords(double v) {
    final n = v.truncate();
    if (n == 0) return 'Zero rupees only';
    return '${_inrInWords(n)} rupees only';
  }

  static const _ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ];
  static const _tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  static String _twoDigits(int n) {
    if (n < 20) return _ones[n];
    final t = n ~/ 10;
    final r = n % 10;
    return r == 0 ? _tens[t] : '${_tens[t]} ${_ones[r]}';
  }

  static String _threeDigits(int n) {
    final h = n ~/ 100;
    final r = n % 100;
    if (h == 0) return _twoDigits(r);
    if (r == 0) return '${_ones[h]} hundred';
    return '${_ones[h]} hundred ${_twoDigits(r)}';
  }

  static String _inrInWords(int n) {
    if (n < 1000) return _capitalize(_threeDigits(n));
    final crore = n ~/ 10000000;
    final lakh = (n % 10000000) ~/ 100000;
    final thousand = (n % 100000) ~/ 1000;
    final rest = n % 1000;
    final parts = <String>[];
    if (crore > 0) parts.add('${_twoDigits(crore)} crore');
    if (lakh > 0) parts.add('${_twoDigits(lakh)} lakh');
    if (thousand > 0) parts.add('${_twoDigits(thousand)} thousand');
    if (rest > 0) parts.add(_threeDigits(rest));
    return _capitalize(parts.join(' '));
  }

  static String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}
