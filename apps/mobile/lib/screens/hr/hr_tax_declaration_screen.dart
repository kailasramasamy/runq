// Form 12BB investment declaration — employee self-service.
// Lists past declarations and lets the user create / edit / submit
// the current FY's declaration. HR approves on the web.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../api/hr_phase_next.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';

String _currentFy() {
  final now = DateTime.now();
  final startYear = now.month >= 4 ? now.year : now.year - 1;
  return '$startYear-${startYear + 1}';
}

final _inrFmt = NumberFormat.decimalPattern('en_IN');
String _formatInr(num v) => _inrFmt.format(v.round());

// ─── List screen ──────────────────────────────────────────────────────────

class HrTaxDeclarationScreen extends ConsumerWidget {
  const HrTaxDeclarationScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myTaxDeclarationsProvider);
    final t = RT(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        backgroundColor: t.bgWarm,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Tax declarations',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: RefreshIndicator(
        color: HrColors.teal,
        onRefresh: () async => ref.invalidate(myTaxDeclarationsProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
          error: (e, _) => Center(child: Text('$e')),
          data: (rows) => ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              _CurrentFyHero(
                onTap: () {
                  final existing = rows
                      .where((r) => r.financialYear == _currentFy())
                      .cast<HrTaxDeclaration?>()
                      .firstWhere((_) => true, orElse: () => null);
                  Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => _DeclarationForm(initial: existing),
                  )).then((_) => ref.invalidate(myTaxDeclarationsProvider));
                },
                existing: rows.where((r) => r.financialYear == _currentFy())
                    .cast<HrTaxDeclaration?>().firstWhere((_) => true, orElse: () => null),
              ),
              const SizedBox(height: 20),
              const _HowItWorks(),
              const SizedBox(height: 16),
              const _DeductionsAtAGlance(),
              const SizedBox(height: 16),
              const _KeyDates(),
              if (rows.isNotEmpty) ...[
                const SizedBox(height: 20),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                  child: Text('HISTORY',
                      // uppercase tracking label → label token (11, w600, letterSpacing)
                      style: RunqText.label.copyWith(color: t.muted2)),
                ),
                ...rows.map((d) => _HistoryTile(d: d)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentFyHero extends StatelessWidget {
  final VoidCallback onTap;
  final HrTaxDeclaration? existing;
  const _CurrentFyHero({required this.onTap, required this.existing});
  @override
  Widget build(BuildContext context) {
    final hasDraft = existing != null;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: HrColors.heroGradient,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: HrColors.teal.withValues(alpha: 0.25),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.receipt_long_rounded, color: Colors.white, size: 22),
              const SizedBox(width: 8),
              Text('FY ${_currentFy()}',
                  // section/card title on gradient → h3 (18, w600); original had w700 so keep override
                  style: RunqText.h3.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
              const Spacer(),
              const Icon(Icons.chevron_right_rounded, color: Colors.white),
            ]),
            const SizedBox(height: 8),
            Text(
              hasDraft
                  ? 'Status: ${existing!.status.toUpperCase()}  •  ₹${_formatInr(existing!.total)} declared'
                  : 'Declare your investments to reduce TDS on salary',
              // body content sentence → body (14)
              style: RunqText.body.copyWith(color: Colors.white.withValues(alpha: 0.92)),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                hasDraft ? 'Continue' : 'Start declaration',
                // button label in pill → caption (12) with w700 override
                style: RunqText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  final HrTaxDeclaration d;
  const _HistoryTile({required this.d});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (bg, fg) = _statusColors(d.status);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // primary line of list row → bodyStrong; original w700 override needed
              Text('FY ${d.financialYear}',
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              // secondary line subtitle with a rupee amount — sentence-case meta → caption (12)
              Text('${d.regime.toUpperCase()} regime  •  ₹${_formatInr(d.total)}',
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
          // uppercase badge → micro (10, w700, letterSpacing)
          child: Text(d.status.toUpperCase(),
              style: RunqText.micro.copyWith(color: fg)),
        ),
      ]),
    );
  }

  static (Color, Color) _statusColors(String s) => switch (s) {
        'approved' => (const Color(0xFFD1FAE5), const Color(0xFF065F46)),
        'submitted' => (HrColors.tealSubtle, HrColors.tealDeep),
        'rejected' => (const Color(0xFFFEE2E2), const Color(0xFF991B1B)),
        _ => (const Color(0xFFF3F4F6), const Color(0xFF374151)),
      };
}

// ─── Form ─────────────────────────────────────────────────────────────────

class _FieldSpec {
  final String key, title, helper;
  final IconData icon;
  final num? cap;
  const _FieldSpec(this.key, this.title, this.helper, this.icon, [this.cap]);
}

const _sections80 = [
  _FieldSpec('section80c', 'Section 80C', 'LIC, PPF, ELSS, principal on home loan, tuition fees',
      Icons.savings_outlined, 150000),
  _FieldSpec('section80d', 'Section 80D', 'Health insurance premium (self + parents)',
      Icons.medical_services_outlined, 100000),
  _FieldSpec('section80ccd1b', 'Section 80CCD(1B)', 'NPS additional contribution',
      Icons.account_balance_outlined, 50000),
  _FieldSpec('section80g', 'Section 80G', 'Donations to approved charities',
      Icons.volunteer_activism_outlined),
];

const _sectionsAllowance = [
  _FieldSpec('hraTotal', 'HRA — Rent paid', 'Annual rent paid to landlord',
      Icons.home_outlined),
  _FieldSpec('ltaTotal', 'LTA', 'Leave travel allowance bills',
      Icons.flight_takeoff_outlined),
];

const _sectionsOther = [
  _FieldSpec('homeLoanInterest', 'Home loan interest', 'Interest paid on self-occupied property',
      Icons.house_outlined, 200000),
  _FieldSpec('otherDeductions', 'Other deductions', 'Anything else not covered above',
      Icons.more_horiz_rounded),
];

class _DeclarationForm extends StatefulWidget {
  const _DeclarationForm({this.initial});
  final HrTaxDeclaration? initial;
  @override
  State<_DeclarationForm> createState() => _DeclarationFormState();
}

class _DeclarationFormState extends State<_DeclarationForm> {
  String _regime = 'new';
  late final Map<String, TextEditingController> _ctrls;
  bool _busy = false;
  // Local override — when the user withdraws a submitted declaration we
  // flip the form into edit mode immediately without round-tripping the
  // parent list. The server-side status is now 'draft'.
  bool _withdrawn = false;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _regime = i?.regime ?? 'new';
    num init(num? v) => (v ?? 0);
    _ctrls = {
      'section80c': _ctrl(init(i?.section80c)),
      'section80d': _ctrl(init(i?.section80d)),
      'section80g': _ctrl(init(i?.section80g)),
      'section80ccd1b': _ctrl(init(i?.section80ccd1b)),
      'hraTotal': _ctrl(init(i?.hraTotal)),
      'ltaTotal': _ctrl(init(i?.ltaTotal)),
      'homeLoanInterest': _ctrl(init(i?.homeLoanInterest)),
      'otherDeductions': _ctrl(init(i?.otherDeductions)),
    };
    for (final c in _ctrls.values) {
      c.addListener(() => setState(() {}));
    }
  }

  TextEditingController _ctrl(num v) =>
      TextEditingController(text: v == 0 ? '' : _formatInr(v));

  @override
  void dispose() {
    for (final c in _ctrls.values) { c.dispose(); }
    super.dispose();
  }

  double _parse(String s) => double.tryParse(s.replaceAll(',', '')) ?? 0;
  double get _total => _ctrls.values.fold(0.0, (a, c) => a + _parse(c.text));

  Future<HrTaxDeclaration> _save() async {
    // Under the new regime none of the Chapter VI-A / HRA / LTA / home-loan
    // deductions are allowed, so we persist zeros — keeps payroll TDS math
    // honest if the employee toggles regime later.
    final sections = <String, double>{
      for (final e in _ctrls.entries)
        e.key: _regime == 'new' ? 0 : _parse(e.value.text),
    };
    return hrPhaseNextRepo.upsertMyTaxDeclaration(
      financialYear: widget.initial?.financialYear ?? _currentFy(),
      regime: _regime,
      sections: sections,
    );
  }

  Future<void> _onSaveDraft() async {
    setState(() => _busy = true);
    try {
      await _save();
      if (mounted) showRunqSnack(context, 'Saved as draft', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _onWithdraw() async {
    setState(() => _busy = true);
    try {
      await hrPhaseNextRepo.withdrawMyTaxDeclaration(widget.initial!.id);
      if (mounted) {
        setState(() => _withdrawn = true);
        showRunqSnack(context, 'Withdrawn — you can edit now', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _onSubmit() async {
    setState(() => _busy = true);
    try {
      final saved = await _save();
      await hrPhaseNextRepo.submitMyTaxDeclaration(saved.id);
      if (mounted) {
        Navigator.pop(context);
        showRunqSnack(context, 'Submitted for approval', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final status = widget.initial?.status;
    // Submitted = locked but withdraw-able. Approved = permanently locked.
    // Draft / rejected = editable. After local withdraw we treat as draft.
    final readOnly = !_withdrawn &&
        widget.initial != null &&
        status != 'draft' &&
        status != 'rejected';
    final canWithdraw = !_withdrawn && status == 'submitted';
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        backgroundColor: t.bgWarm,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text('FY ${widget.initial?.financialYear ?? _currentFy()}',
            style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            if (_regime == 'old') _TotalBanner(total: _total),
            if (_regime == 'old') const SizedBox(height: 16),
            _SectionLabel('Tax regime'),
            _RegimePicker(
              value: _regime,
              onChanged: readOnly ? null : (v) => setState(() => _regime = v),
            ),
            const SizedBox(height: 20),
            if (_regime == 'new') ...[
              const _NewRegimeInfo(),
              const SizedBox(height: 16),
            ] else ...[
              _SectionLabel('Section 80 deductions'),
              _Card(children: [
                for (final f in _sections80) _TaxField(spec: f, ctrl: _ctrls[f.key]!, readOnly: readOnly),
              ]),
              const SizedBox(height: 16),
              _SectionLabel('Allowances'),
              _Card(children: [
                for (final f in _sectionsAllowance) _TaxField(spec: f, ctrl: _ctrls[f.key]!, readOnly: readOnly),
              ]),
              const SizedBox(height: 16),
              _SectionLabel('Other'),
              _Card(children: [
                for (final f in _sectionsOther) _TaxField(spec: f, ctrl: _ctrls[f.key]!, readOnly: readOnly),
              ]),
              const SizedBox(height: 16),
            ],
            if (canWithdraw)
              _WithdrawBanner(busy: _busy, onWithdraw: _onWithdraw),
            if (readOnly && !canWithdraw)
              const _LockedBanner(),
          ],
        ),
      ),
      bottomNavigationBar: readOnly
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(children: [
                  if (_regime == 'old') ...[
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: HrColors.tealDeep,
                          side: const BorderSide(color: HrColors.teal, width: 1.2),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: _busy ? null : _onSaveDraft,
                        child: const Text('Save draft', style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: HrColors.teal,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: _busy ? null : _onSubmit,
                      child: _busy
                          ? const SizedBox(width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(_regime == 'new' ? 'Confirm new regime' : 'Submit',
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ]),
              ),
            ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
      child: Text(text.toUpperCase(),
          // uppercase tracking label → label token (11, w600, letterSpacing)
          style: RunqText.label.copyWith(color: t.muted2)),
    );
  }
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            children[i],
            if (i < children.length - 1)
              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
          ],
        ],
      ),
    );
  }
}

class _TotalBanner extends StatelessWidget {
  final double total;
  const _TotalBanner({required this.total});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: HrColors.tealSubtle,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: HrColors.teal.withValues(alpha: 0.25), width: 0.5),
      ),
      child: Row(children: [
        const Icon(Icons.calculate_outlined, color: HrColors.tealDeep, size: 22),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // label above a metric value — body content (not uppercase label) → body (14)
              Text('Total declared',
                  style: RunqText.body.copyWith(color: t.muted)),
              const SizedBox(height: 2),
              // rupee total metric → h3 (18); original was 20/w800, use h3 + weight override
              Text('₹${_formatInr(total)}',
                  style: RunqText.tabular(size: 20, w: FontWeight.w800, color: HrColors.tealDeep)),
            ],
          ),
        ),
      ]),
    );
  }
}

class _RegimePicker extends StatelessWidget {
  final String value;
  final ValueChanged<String>? onChanged;
  const _RegimePicker({required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget pill(String v, String label, String sub) {
      final active = v == value;
      return Expanded(
        child: GestureDetector(
          onTap: onChanged == null ? null : () => onChanged!(v),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
            decoration: BoxDecoration(
              color: active ? HrColors.teal : t.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: active ? HrColors.teal : t.hairline,
                width: active ? 1.2 : 0.5,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(label,
                    textAlign: TextAlign.center,
                    // primary pill label → body (14); original w700, keep override
                    style: RunqText.body.copyWith(
                        color: active ? Colors.white : t.ink,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(sub,
                    textAlign: TextAlign.center,
                    // sub-description in pill → caption (12)
                    style: RunqText.caption.copyWith(
                        color: active ? Colors.white.withValues(alpha: 0.85) : t.muted)),
              ],
            ),
          ),
        ),
      );
    }

    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        pill('new', 'New', 'Lower slabs, no deductions'),
        const SizedBox(width: 8),
        pill('old', 'Old', 'Higher slabs, with deductions'),
      ]),
    );
  }
}

// ─── Info cards on list screen ────────────────────────────────────────────

class _HowItWorks extends StatelessWidget {
  const _HowItWorks();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget step(int n, String title, String sub) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 22, height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: HrColors.tealSubtle,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('$n',
                    // step number in small circle → caption (12); original w800 override
                    style: RunqText.caption.copyWith(
                        color: HrColors.tealDeep, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(height: 8),
              Text(title,
                  // step title (primary line) → bodyStrong (14); original w700 override
                  style: RunqText.bodyStrong.copyWith(
                      color: t.ink, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(sub,
                  // step sub text → body (14); original was 11 but sentence-case body content
                  style: RunqText.body.copyWith(color: t.muted)),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('How it works',
              // card section title → bodyStrong (14); original w800 override
              style: RunqText.bodyStrong.copyWith(
                  color: t.ink, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            step(1, 'Declare', 'Enter expected investments for the year.'),
            const SizedBox(width: 10),
            step(2, 'HR reviews', 'Submitted entries are approved on web.'),
            const SizedBox(width: 10),
            step(3, 'Lower TDS', 'Approved amounts cut monthly tax.'),
          ]),
        ],
      ),
    );
  }
}

class _DeductionsAtAGlance extends StatelessWidget {
  const _DeductionsAtAGlance();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final items = [
      ('80C', 'LIC / PPF / ELSS / tuition', '₹1.5L'),
      ('80D', 'Health insurance', '₹1L'),
      ('80CCD(1B)', 'NPS additional', '₹50K'),
      ('Home loan', 'Self-occupied interest', '₹2L'),
      ('HRA', 'Rent paid', 'Salary-based'),
      ('LTA', 'Travel bills', 'Actuals'),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text('What you can claim',
                // card section title → bodyStrong; original w800 override
                style: RunqText.bodyStrong.copyWith(
                    color: t.ink, fontWeight: FontWeight.w800)),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: HrColors.tealSubtle,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('OLD REGIME ONLY',
                  // uppercase pill badge → micro (10, w700, letterSpacing)
                  style: RunqText.micro.copyWith(
                      color: HrColors.tealDeep, fontWeight: FontWeight.w800)),
            ),
          ]),
          const SizedBox(height: 10),
          ...items.map((e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  SizedBox(
                    width: 78,
                    child: Text(e.$1,
                        // section code (80C etc.) — primary label → bodyStrong; original w800 override
                        style: RunqText.bodyStrong.copyWith(
                            color: HrColors.tealDeep, fontWeight: FontWeight.w800)),
                  ),
                  Expanded(
                    child: Text(e.$2,
                        // description text → body (14)
                        style: RunqText.body.copyWith(color: t.ink)),
                  ),
                  Text(e.$3,
                      // cap amount → caption (12) with w600 override (original was 12/w600)
                      style: RunqText.caption.copyWith(
                          color: t.muted, fontWeight: FontWeight.w600)),
                ]),
              )),
        ],
      ),
    );
  }
}

class _KeyDates extends StatelessWidget {
  const _KeyDates();
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF3F2D0B) : const Color(0xFFFEF3C7);
    final border = isDark ? const Color(0xFF78350F) : const Color(0xFFFDE68A);
    final accent = isDark ? const Color(0xFFFCD34D) : const Color(0xFF92400E);
    final body = isDark ? const Color(0xFFFDE68A) : const Color(0xFF422006);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border, width: 0.5),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.event_note_rounded, color: accent, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Key dates',
                  // card title → bodyStrong; original w800 override
                  style: RunqText.bodyStrong.copyWith(
                      color: accent, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                  '• Declare early in the FY (Apr–Jun) so monthly TDS reflects it.\n'
                  '• Final proof submission window: Jan – Feb.\n'
                  '• Withdraw and edit any time before HR approves it.',
                  // body content paragraph → body (14); preserve height
                  style: RunqText.body.copyWith(color: body, height: 1.5)),
            ],
          ),
        ),
      ]),
    );
  }
}

class _NewRegimeInfo extends StatelessWidget {
  const _NewRegimeInfo();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget bullet(IconData icon, String title, String sub) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, size: 18, color: HrColors.tealDeep),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      // bullet primary line → bodyStrong; original w700 override
                      style: RunqText.bodyStrong.copyWith(
                          color: t.ink, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(sub,
                      // bullet sub text → body (14)
                      style: RunqText.body.copyWith(color: t.muted)),
                ],
              ),
            ),
          ]),
        );
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.info_outline_rounded, color: HrColors.tealDeep, size: 18),
            const SizedBox(width: 8),
            Text('No declaration needed',
                // info card title → bodyStrong (14); original was 14/w700
                style: RunqText.bodyStrong.copyWith(
                    color: t.ink, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 12),
          bullet(Icons.check_circle_outline_rounded, 'Standard deduction ₹75,000',
              'Auto-applied to your salary — no proof required.'),
          bullet(Icons.check_circle_outline_rounded, 'Employer NPS (80CCD(2))',
              'If your employer contributes to NPS, it stays deductible.'),
          bullet(Icons.block_rounded, 'Most other deductions not allowed',
              '80C, 80D, HRA, LTA, home-loan interest etc. don\'t apply under the new regime.'),
          Padding(
            padding: const EdgeInsets.only(top: 2, bottom: 8),
            child: Text(
              'Switch to old regime above if you want to declare these.',
              // instructional body text → caption (12) with w600; original was 12/w600
              style: RunqText.caption.copyWith(
                  color: HrColors.tealDeep, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _LockedBanner extends StatelessWidget {
  const _LockedBanner();
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF3F2D0B) : const Color(0xFFFEF3C7);
    final fg = isDark ? const Color(0xFFFCD34D) : const Color(0xFF92400E);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Icon(Icons.lock_outline_rounded, size: 18, color: fg),
        const SizedBox(width: 8),
        Expanded(
          child: Text('Declaration locked — HR has reviewed this.',
              // body content sentence → body (14)
              style: RunqText.body.copyWith(color: fg)),
        ),
      ]),
    );
  }
}

class _WithdrawBanner extends StatelessWidget {
  final bool busy;
  final VoidCallback onWithdraw;
  const _WithdrawBanner({required this.busy, required this.onWithdraw});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      decoration: BoxDecoration(
        color: HrColors.tealSubtle,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: HrColors.teal.withValues(alpha: 0.3), width: 0.5),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.hourglass_top_rounded, size: 20, color: HrColors.tealDeep),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Pending HR review',
                  // banner title → bodyStrong; original w700 override
                  style: RunqText.bodyStrong.copyWith(
                      color: t.ink, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text('Spotted a mistake? Withdraw to edit and resubmit.',
                  // body content sentence → body (14)
                  style: RunqText.body.copyWith(color: t.muted)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        TextButton(
          onPressed: busy ? null : onWithdraw,
          style: TextButton.styleFrom(
            foregroundColor: HrColors.tealDeep,
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          ),
          child: Text('Withdraw',
              // button label → caption (12) with w700 override
              style: RunqText.caption.copyWith(fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}

class _TaxField extends StatefulWidget {
  final _FieldSpec spec;
  final TextEditingController ctrl;
  final bool readOnly;
  const _TaxField({required this.spec, required this.ctrl, required this.readOnly});
  @override
  State<_TaxField> createState() => _TaxFieldState();
}

class _TaxFieldState extends State<_TaxField> {
  late final FocusNode _focus = FocusNode()..addListener(() => setState(() {}));
  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  double get _value =>
      double.tryParse(widget.ctrl.text.replaceAll(',', '')) ?? 0;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final spec = widget.spec;
    final cap = spec.cap;
    final overCap = cap != null && _value > cap;
    final focused = _focus.hasFocus;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
            color: HrColors.tealSubtle,
            borderRadius: BorderRadius.circular(10),
          ),
          alignment: Alignment.center,
          child: Icon(spec.icon, color: HrColors.tealDeep, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(
                  child: Text(spec.title,
                      // field title primary line → bodyStrong; original w700 override
                      style: RunqText.bodyStrong.copyWith(
                          color: t.ink, fontWeight: FontWeight.w700)),
                ),
                if (cap != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: overCap
                          ? const Color(0xFFFEE2E2)
                          : HrColors.tealSubtle,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('Max ₹${_formatInr(cap)}',
                        // cap badge → micro (10, w700); original was 10.5/w700
                        style: RunqText.micro.copyWith(
                            color: overCap
                                ? const Color(0xFF991B1B)
                                : HrColors.tealDeep)),
                  ),
              ]),
              const SizedBox(height: 2),
              Text(spec.helper,
                  // helper/hint text → body (14); original was 11.5
                  style: RunqText.body.copyWith(color: t.muted)),
              const SizedBox(height: 8),
              TextField(
                controller: widget.ctrl,
                focusNode: _focus,
                readOnly: widget.readOnly,
                keyboardType: const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [_IndianCurrencyFormatter()],
                // currency input → tabular (16, w600)
                style: RunqText.tabular(size: 16, w: FontWeight.w600, color: t.ink),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: '0',
                  // hint → tabular (16)
                  hintStyle: RunqText.tabular(size: 16, color: t.muted2),
                  prefixText: '₹  ',
                  // prefix → tabular (15, w600)
                  prefixStyle: RunqText.tabular(size: 15, w: FontWeight.w600, color: t.muted),
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  enabledBorder: UnderlineInputBorder(
                      borderSide: BorderSide(color: t.hairline, width: 0.8)),
                  focusedBorder: const UnderlineInputBorder(
                      borderSide: BorderSide(color: HrColors.teal, width: 1.6)),
                ),
              ),
              if (cap != null && _value > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    overCap
                        ? 'Exceeds limit by ₹${_formatInr(_value - cap)}'
                        : 'Remaining headroom: ₹${_formatInr(cap - _value)}',
                    // inline validation message → caption (12)
                    style: RunqText.caption.copyWith(
                        color: overCap ? const Color(0xFF991B1B) : t.muted),
                  ),
                ),
              if (focused) const SizedBox(height: 2),
            ],
          ),
        ),
      ]),
    );
  }
}

// ─── Currency formatter ───────────────────────────────────────────────────

class _IndianCurrencyFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) {
      return const TextEditingValue(text: '');
    }
    final n = int.tryParse(digits) ?? 0;
    final formatted = _inrFmt.format(n);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
