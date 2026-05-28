import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/pur_primitives.dart';

/// PP "Match" tab. Phase 3's match commit happens on the AP bill detail
/// screen (where the user reviews the bill and sees open POs for the
/// vendor). This tab is a discovery surface — a list of bills that are
/// waiting to be matched. v1 ships an instructional empty state; Phase
/// 5 wires the actual "bills awaiting match" query.
class PoMatchScreen extends StatelessWidget {
  const PoMatchScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        child: Column(
          children: [
            const PurPlainAppBar(title: '3-way match', showBack: false),
            Expanded(
              child: PurEmptyState(
                icon: Icons.link_rounded,
                title: '3-way match lives on the bill',
                description:
                    'Open an AP bill from a vendor with open POs and tap the Match panel to suggest, confirm, or override.',
                action: PurPrimaryButton(
                  label: 'Go to bills',
                  icon: Icons.receipt_long_outlined,
                  onPressed: () => context.push('/purchases/bills'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
