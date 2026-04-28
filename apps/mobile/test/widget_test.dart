import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:runq_mobile/main.dart';

void main() {
  testWidgets('App boots without throwing', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: RunqApp()));
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
