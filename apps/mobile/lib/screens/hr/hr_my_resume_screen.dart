// Employee self-service: view and upload your own resume. The extracted
// profile is read-only here — corrections are an HR action — but the
// employee can upload or replace the resume that feeds it.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_resume_tab.dart';

class HrMyResumeScreen extends ConsumerWidget {
  const HrMyResumeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final me = ref.watch(hrMeProvider).asData?.value;
    final employeeId = me?.employee?.id;

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text('My Resume', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            Expanded(
              child: employeeId == null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'No employee record is linked to your account yet. '
                          'Ask HR to set up your profile.',
                          textAlign: TextAlign.center,
                          style: RunqText.body.copyWith(color: t.muted),
                        ),
                      ),
                    )
                  : HrResumeTab(employeeId: employeeId, selfService: true),
            ),
          ],
        ),
      ),
    );
  }
}
