// Chart labels are held to three significant figures so a crowded axis stays
// readable, but not so coarse that a lakh-scale value loses real money.
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/utils/format_inr.dart';

void main() {
  test('rounds away the decimal at 10 or more of a unit', () {
    expect(formatChartINR(64900), '₹65k');
    expect(formatChartINR(140000), '₹1.4L');
    expect(formatChartINR(99400), '₹99k');
    expect(formatChartINR(12300000), '₹1.2Cr');
  });

  test('keeps one decimal below 10 of a unit', () {
    // ₹6.7L rounded to ₹7L would hide thirty thousand rupees.
    expect(formatChartINR(674967), '₹6.7L');
    expect(formatChartINR(1240), '₹1.2k');
    expect(formatChartINR(23400000), '₹2.3Cr');
  });

  test('drops a trailing .0 and handles small, zero, negative and null', () {
    expect(formatChartINR(2000), '₹2k');
    expect(formatChartINR(649), '₹649');
    expect(formatChartINR(0), '₹0');
    expect(formatChartINR(-64900), '−₹65k');
    expect(formatChartINR(null), '—');
  });
}
