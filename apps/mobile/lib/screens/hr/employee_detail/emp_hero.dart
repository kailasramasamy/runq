part of '../hr_employee_detail_screen.dart';

// Collapsing hero header: gradient hero, avatar, full-screen photo viewer,
// hero chips, and the quick-contact action rail.

// ─── Hero (collapsing header) ─────────────────────────────────────────────

class _Hero extends StatelessWidget {
  final HrEmployee emp;
  const _Hero({required this.emp});

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(gradient: HrColors.profileGradient),
      padding: EdgeInsets.fromLTRB(8, topPad, 8, 18),
      child: Column(
        mainAxisSize: MainAxisSize.max,
        children: [
          // Clearance for the SliverAppBar's own toolbar row (back button,
          // collapsed name/code, … menu), which is painted over this
          // gradient. The hero only owns what sits below it — a
          // FlexibleSpaceBar background is clipped from the top as it
          // collapses, so nothing that must survive can live up here.
          const SizedBox(height: kToolbarHeight),
          // Avatar — centered, with a translucent white ring so the photo
          // pops against the gradient even when it's a similar hue.
          _HeroAvatar(
            name: emp.displayName,
            photoUrl: emp.photoUrl,
            employeeId: emp.id,
          ),
          const SizedBox(height: 12),
          Text(
            emp.displayName,
            textAlign: TextAlign.center,
            style: RunqText.h2.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
            maxLines: 1, overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (emp.designationName != null) emp.designationName!,
              if (emp.departmentName != null) emp.departmentName!,
            ].join(' · '),
            textAlign: TextAlign.center,
            style: RunqText.body.copyWith(
              color: Colors.white.withValues(alpha: 0.78),
            ),
            maxLines: 1, overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: [
              _HeroChip(label: _statusLabel(emp.status), dotColor: _statusDot(emp.status)),
              _HeroChip(label: _empType(emp.employmentType)),
              _HeroChip(label: emp.employeeCode),
            ],
          ),
          // Breathing room between chips and the pinned tab strip below,
          // so the hero doesn't feel compressed against the tabs.
          const SizedBox(height: 18),
        ],
      ),
    );
  }

  static String _statusLabel(String s) => switch (s) {
        'active' => 'Active',
        'on_leave' => 'On leave',
        'inactive' => 'Inactive',
        'terminated' => 'Left',
        _ => s,
      };
  static String _empType(String s) => switch (s) {
        'permanent' => 'Permanent',
        'contract' => 'Contract',
        'intern' => 'Intern',
        'consultant' => 'Consultant',
        'wage' => 'Wage worker',
        _ => s,
      };
  static Color _statusDot(String s) => switch (s) {
        'active' => const Color(0xFF34D399),
        'on_leave' => const Color(0xFFFBBF24),
        'inactive' || 'terminated' => const Color(0xFFF87171),
        _ => Colors.white70,
      };
}

class _HeroAvatar extends StatelessWidget {
  final String name;
  final String? photoUrl;
  final String? employeeId;
  const _HeroAvatar({required this.name, this.photoUrl, this.employeeId});

  @override
  Widget build(BuildContext context) {
    final hasPhoto = (photoUrl ?? '').isNotEmpty;
    final avatar = DecoratedBox(
      decoration: BoxDecoration(
        // Soft drop shadow grounds the tile against the gradient — replaces
        // the bordered "ring" which felt heavy around a photo.
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.22),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: HrAvatar(
        name: name,
        photoUrl: photoUrl,
        employeeId: employeeId,
        size: 108,
      ),
    );
    if (!hasPhoto) return avatar;
    // Tap to view full-size — only meaningful when there's an actual photo
    // behind the initials fallback. The viewer reuses the same photo URL as
    // this on-screen avatar, so its decoded image is already in the cache —
    // we open immediately (no await) and let the Hero fly with the cached
    // bytes. HrAvatar's initials fallback + fade-in covers the rare case
    // where the avatar hasn't finished downloading yet.
    return GestureDetector(
      onTap: () {
        Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
          opaque: false,
          barrierColor: Colors.black.withValues(alpha: 0.92),
          pageBuilder: (_, __, ___) => _PhotoViewer(
            name: name,
            photoUrl: photoUrl,
            employeeId: employeeId,
          ),
          transitionsBuilder: (_, anim, __, child) => FadeTransition(opacity: anim, child: child),
          transitionDuration: const Duration(milliseconds: 200),
        ));
      },
      child: Hero(tag: 'emp-photo-$employeeId', child: avatar),
    );
  }
}

/// Full-screen photo viewer. Dismisses on tap or swipe-down. Reuses
/// HrAvatar so auth headers and fallback logic stay in one place.
class _PhotoViewer extends StatelessWidget {
  final String name;
  final String? photoUrl;
  final String? employeeId;
  const _PhotoViewer({required this.name, this.photoUrl, this.employeeId});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size.shortestSide - 32;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: GestureDetector(
        onTap: () => Navigator.of(context).maybePop(),
        onVerticalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0).abs() > 200) Navigator.of(context).maybePop();
        },
        child: SafeArea(
          child: Stack(
            children: [
              Center(
                child: Hero(
                  tag: 'emp-photo-$employeeId',
                  // During the flight, paint ONLY the cached photo — not the
                  // full HrAvatar, whose initials-fallback layer would flash
                  // through for the frame or two before the destination
                  // image stream resolves in the overlay.
                  flightShuttleBuilder: (_, __, dir, fromCtx, toCtx) {
                    final provider = HrAvatar(
                      name: name,
                      photoUrl: photoUrl,
                      employeeId: employeeId,
                      size: 1,
                    ).imageProvider;
                    if (provider == null) {
                      return (dir == HeroFlightDirection.push ? toCtx : fromCtx).widget;
                    }
                    return ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image(image: provider, fit: BoxFit.cover, gaplessPlayback: true),
                    );
                  },
                  child: HrAvatar(
                    name: name,
                    photoUrl: photoUrl,
                    employeeId: employeeId,
                    size: size,
                  ),
                ),
              ),
              Positioned(
                top: 8, right: 8,
                child: IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
                ),
              ),
              Positioned(
                left: 0, right: 0, bottom: 24,
                child: Center(
                  child: Text(
                    name,
                    style: RunqText.bodyStrong.copyWith(color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  final String label;
  final Color? dotColor;
  const _HeroChip({required this.label, this.dotColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dotColor != null) ...[
            Container(
              width: 6, height: 6,
              decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: RunqText.label.copyWith(color: Colors.white),
          ),
        ],
      ),
    );
  }
}

// ─── Quick contact action rail ────────────────────────────────────────────

class _ContactRail extends StatelessWidget {
  final HrEmployee emp;
  const _ContactRail({required this.emp});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _ActionTile(
            icon: Icons.phone_outlined,
            label: 'Call',
            enabled: emp.phone != null,
            onTap: emp.phone == null ? null : () => _launch(context, 'tel:${emp.phone}'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionTile(
            icon: Icons.mail_outline_rounded,
            label: 'Email',
            enabled: emp.email != null,
            onTap: emp.email == null ? null : () => _launch(context, 'mailto:${emp.email}'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ActionTile(
            icon: Icons.chat_bubble_outline_rounded,
            label: 'Message',
            enabled: emp.phone != null,
            onTap: emp.phone == null ? null : () => _launch(context, 'sms:${emp.phone}'),
          ),
        ),
      ],
    );
  }

  Future<void> _launch(BuildContext context, String uri) async {
    final u = Uri.parse(uri);
    if (await canLaunchUrl(u)) {
      await launchUrl(u);
    } else if (context.mounted) {
      showRunqSnack(context, 'Could not open $uri', kind: SnackKind.error);
    }
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback? onTap;
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = enabled ? HrColors.brand(context) : t.muted2;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: t.hairline, width: 0.5),
          boxShadow: RunqShadows.card,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: ink, size: 20),
            const SizedBox(height: 6),
            Text(label,
                style: RunqText.label.copyWith(color: ink)),
          ],
        ),
      ),
    );
  }
}
