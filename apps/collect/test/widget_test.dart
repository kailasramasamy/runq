import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dhenu/main.dart';

void main() {
  testWidgets('App boots and lands on the login screen when signed out', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const ProviderScope(child: DhenuApp()));
    await tester.pumpAndSettle();
    expect(find.byType(MaterialApp), findsOneWidget);
    // Signed out → the brand wordmark on the login screen.
    expect(find.text('dhenu'), findsOneWidget);
  });
}
