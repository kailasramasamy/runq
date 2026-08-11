part of '../hr_employee_detail_screen.dart';

// Small shared widgets used across multiple tabs: empty-state card and
// the document expiry chip.

// ─── Empty state ──────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  const _EmptyState({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          Icon(icon, color: t.muted2, size: 32),
          const SizedBox(height: 10),
          Text(title, textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(subtitle, textAlign: TextAlign.center,
              style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

class _ExpiryChip extends StatelessWidget {
  final DateTime expiry;
  const _ExpiryChip({required this.expiry});

  @override
  Widget build(BuildContext context) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days = expiry.difference(today).inDays;
    final (bg, ink, text) = days < 0
        ? (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D),
            'Expired ${-days}d ago')
        : days <= 30
            ? (const Color(0xFFFEE2E2), const Color(0xFF7F1D1D),
                'Expires in $days d')
            : days <= 90
                ? (const Color(0xFFFEF3C7), const Color(0xFF78350F),
                    'Expires in $days d')
                : (const Color(0xFFF1F5F9), const Color(0xFF475569),
                    'Expires ${expiry.day} ${m[expiry.month - 1]} ${expiry.year}');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text,
          style: RunqText.micro.copyWith(color: ink)),
    );
  }
}
