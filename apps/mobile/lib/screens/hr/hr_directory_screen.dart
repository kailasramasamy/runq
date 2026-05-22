// Org-wide colleague directory — full-screen search route. Pushed from
// the home-screen search pill so results stay alive when the user dives
// into a colleague's work profile and pops back. Backed by /hr/directory
// which bypasses HrAccessScope (everyone can find anyone, salary/PAN never
// leave the server).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
                        // Focused state takes a teal tint instead of the
                        // Material default so the active input reads on-brand.
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(
                            color: HrColors.teal.withValues(alpha: 0.55),
                            width: 1.5,
                          ),
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
                  // Results live in their own light panel, lifted off the
                  // warm screen background so the list reads as a distinct
                  // result set rather than flowing out of the search input.
                  return Container(
                    margin: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                    decoration: BoxDecoration(
                      color: t.surface,
                      borderRadius:
                          const BorderRadius.vertical(top: Radius.circular(16)),
                      border: Border.all(color: t.hairline, width: 0.5),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                          child: Text(
                            '${page.total} '
                            '${page.total == 1 ? 'colleague' : 'colleagues'}',
                            style: RunqText.caption.copyWith(color: t.muted),
                          ),
                        ),
                        Expanded(
                          child: ListView.separated(
                            padding: EdgeInsets.zero,
                            keyboardDismissBehavior:
                                ScrollViewKeyboardDismissBehavior.onDrag,
                            itemCount: page.data.length,
                            separatorBuilder: (_, __) => Divider(
                              height: 1,
                              thickness: 0.5,
                              color: t.hairline,
                              indent: 56,
                            ),
                            itemBuilder: (_, i) {
                              final e = page.data[i];
                              return ListTile(
                                leading: HrAvatar(
                                  name: e.displayName,
                                  photoUrl: e.photoUrl,
                                  employeeId: e.id,
                                  size: 40,
                                ),
                                title: Text(e.displayName,
                                    style: RunqText.bodyStrong
                                        .copyWith(color: t.ink)),
                                subtitle: Text(
                                  [
                                    e.employeeCode,
                                    if (e.designationName != null)
                                      e.designationName!,
                                    if (e.departmentName != null)
                                      e.departmentName!,
                                  ].join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: RunqText.caption
                                      .copyWith(color: t.muted),
                                ),
                                trailing: Icon(Icons.chevron_right_rounded,
                                    color: t.muted2, size: 18),
                                // Push the full work-profile screen. Drop
                                // focus first so the keyboard tucks away
                                // before the route slides in; the search list
                                // stays in the stack, so popping back
                                // restores the results untouched.
                                onTap: () {
                                  _focus.unfocus();
                                  context.push('/hr/directory/${e.id}');
                                },
                              );
                            },
                          ),
                        ),
                      ],
                    ),
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
