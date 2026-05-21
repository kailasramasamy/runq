// Org-wide colleague directory — full-screen search route. Pushed from
// the home-screen search pill so results stay alive when the user dives
// into a contact card and pops back. Backed by /hr/directory which
// bypasses HrAccessScope (everyone can find anyone, salary/PAN never
// leave the server).

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_widgets.dart';

class HrDirectoryScreen extends ConsumerStatefulWidget {
  const HrDirectoryScreen({super.key});

  @override
  ConsumerState<HrDirectoryScreen> createState() => _HrDirectoryScreenState();
}

class _HrDirectoryScreenState extends ConsumerState<HrDirectoryScreen> {
  String _q = '';
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    // After the first frame: autofocus so the keyboard pops without an
    // extra tap, and refresh data so a notification tap shows current
    // rows, not a prior visit's cache. Both deferred — requestFocus and
    // ref.invalidate touch inherited widgets, illegal during initState.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _focus.requestFocus();
      ref.invalidate(hrDirectoryProvider);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final results = ref.watch(hrDirectoryProvider(_q.trim()));

    return Scaffold(
      backgroundColor: t.bgWarmer,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // Header row — back arrow + inline search input. No big title;
            // the input itself is the headline of this screen.
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      focusNode: _focus,
                      textCapitalization: TextCapitalization.none,
                      onChanged: (v) => setState(() => _q = v),
                      decoration: InputDecoration(
                        hintText: 'Search by name, code, phone, email',
                        hintStyle: RunqText.body.copyWith(color: t.muted2),
                        prefixIcon: Icon(Icons.search_rounded, size: 18, color: t.muted),
                        suffixIcon: _q.isEmpty
                            ? null
                            : IconButton(
                                icon: Icon(Icons.close_rounded, size: 18, color: t.muted),
                                onPressed: () {
                                  _controller.clear();
                                  setState(() => _q = '');
                                  _focus.requestFocus();
                                },
                              ),
                        isDense: true,
                        filled: true,
                        fillColor: t.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: t.hairline, width: 0.5),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: results.when(
                loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('$e', style: RunqText.body.copyWith(color: t.muted)),
                  ),
                ),
                data: (page) {
                  if (page.data.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          _q.isEmpty ? 'Start typing to search colleagues' : 'No matches',
                          style: RunqText.body.copyWith(color: t.muted),
                        ),
                      ),
                    );
                  }
                  return ListView.separated(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    itemCount: page.data.length,
                    separatorBuilder: (_, __) =>
                        Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 56),
                    itemBuilder: (_, i) {
                      final e = page.data[i];
                      return ListTile(
                        leading: HrAvatar(
                          name: e.displayName, photoUrl: e.photoUrl, employeeId: e.id, size: 40,
                        ),
                        title: Text(e.displayName,
                            style: RunqText.bodyStrong.copyWith(color: t.ink)),
                        subtitle: Text(
                          [
                            e.employeeCode,
                            if (e.designationName != null) e.designationName!,
                            if (e.departmentName != null) e.departmentName!,
                          ].join(' · '),
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                        trailing: Icon(Icons.chevron_right_rounded, color: t.muted2, size: 18),
                        // Contact card stays a bottom sheet — search list
                        // stays on screen behind it, results preserved.
                        // Drop focus first so the keyboard tucks away
                        // before the sheet animates up (otherwise the
                        // sheet snaps to half-height behind the keypad).
                        onTap: () {
                          _focus.unfocus();
                          openDirectoryContact(context, e);
                        },
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Directory contact card (bottom sheet) ────────────────────────────────
// Shown when a directory row is tapped. Surfaces only the safe fields
// /hr/directory returned + one-tap dial / SMS / email actions. Pushing
// the full /hr/people/:id route is intentionally avoided here because
// that endpoint applies HrAccessScope and 404s for out-of-team colleagues.

Future<void> openDirectoryContact(BuildContext context, HrEmployee e) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    useSafeArea: true,
    builder: (_) => _DirectoryContactCard(employee: e),
  );
}

class _DirectoryContactCard extends StatelessWidget {
  final HrEmployee employee;
  const _DirectoryContactCard({required this.employee});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final mq = MediaQuery.of(context);
    final e = employee;
    final subtitle = [
      e.employeeCode,
      if (e.designationName != null && e.designationName!.isNotEmpty) e.designationName!,
      if (e.departmentName != null && e.departmentName!.isNotEmpty) e.departmentName!,
    ].join(' · ');

    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + mq.padding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          const SizedBox(height: 18),
          Center(
            child: HrAvatar(
              name: e.displayName, photoUrl: e.photoUrl, employeeId: e.id,
              size: 72, useGradient: true,
            ),
          ),
          const SizedBox(height: 12),
          Text(e.displayName, textAlign: TextAlign.center,
              style: RunqText.h2.copyWith(color: t.ink)),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(subtitle, textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
          const SizedBox(height: 20),
          if (e.phone != null && e.phone!.isNotEmpty) ...[
            _ContactRow(
              icon: Icons.phone_outlined,
              label: 'Phone',
              value: e.phone!,
              onTap: () => _launchUri('tel:${e.phone}'),
              onLongPress: () => _copy(context, e.phone!, 'Phone'),
            ),
            const SizedBox(height: 8),
            _ContactRow(
              icon: Icons.sms_outlined,
              label: 'Message',
              value: e.phone!,
              onTap: () => _launchUri('sms:${e.phone}'),
            ),
          ],
          if (e.email != null && e.email!.isNotEmpty) ...[
            const SizedBox(height: 8),
            _ContactRow(
              icon: Icons.mail_outline_rounded,
              label: 'Email',
              value: e.email!,
              onTap: () => _launchUri('mailto:${e.email}'),
              onLongPress: () => _copy(context, e.email!, 'Email'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _launchUri(String uri) async {
    final u = Uri.parse(uri);
    if (await canLaunchUrl(u)) await launchUrl(u);
  }

  Future<void> _copy(BuildContext context, String value, String label) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$label copied'), duration: const Duration(seconds: 2)),
      );
    }
  }
}

class _ContactRow extends StatelessWidget {
  final IconData icon;
  final String label, value;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  const _ContactRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(icon, size: 20, color: HrColors.teal),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: RunqText.caption.copyWith(color: t.muted)),
                    const SizedBox(height: 2),
                    Text(value,
                        style: RunqText.body.copyWith(color: t.ink)),
                  ],
                ),
              ),
              Icon(Icons.arrow_outward_rounded, size: 16, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}
