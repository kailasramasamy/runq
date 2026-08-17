part of '../hr_employee_detail_screen.dart';

// The … actions bottom sheet (edit / photo / salary / manager / invite /
// status) plus its row primitives and the photo-upload / status-toggle
// helpers it triggers.

// ─── Actions bottom sheet (… menu) ────────────────────────────────────────

Future<void> _showActionsSheet(BuildContext context, HrEmployee emp) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ActionsSheet(emp: emp),
  );
}

class _ActionsSheet extends ConsumerWidget {
  final HrEmployee emp;
  const _ActionsSheet({required this.emp});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final role = ref.watch(appRoleProvider);
    final canInvite = role == AppRole.admin || role == AppRole.hr;
    final inviteAsync = canInvite
        ? ref.watch(hrEmployeeInviteStatusProvider(emp.id))
        : null;
    return Container(
      padding: EdgeInsets.fromLTRB(8, 12, 8, 12 + inset),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: t.hairline,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 14),
          // Section: edit / manage record
          _SheetGroup(rows: [
            _SheetRow(
              icon: Icons.edit_outlined,
              label: 'Edit details',
              onTap: () {
                Navigator.of(context).pop();
                // Pass the loaded employee via `extra` so the form
                // prefills synchronously — no second network round-trip.
                context.push('/hr/employees/edit', extra: emp);
              },
            ),
            _SheetRow(
              icon: Icons.photo_camera_outlined,
              label: 'Update photo',
              onTap: () async {
                // Grab the root navigator's context (alive for the app's
                // lifetime) before popping — otherwise _pickAndUploadPhoto's
                // mounted-guard sees this sheet's now-defunct context after
                // the gallery picker returns and bails before uploading.
                final rootCtx = Navigator.of(context, rootNavigator: true).context;
                Navigator.of(context).pop();
                await _pickAndUploadPhoto(rootCtx, emp);
              },
            ),
            _SheetRow(
              icon: Icons.payments_outlined,
              label: 'Assign salary',
              onTap: () {
                Navigator.of(context).pop();
                showAssignSalarySheet(context, emp);
              },
            ),
            _SheetRow(
              icon: Icons.account_tree_outlined,
              label: 'Set reporting manager',
              onTap: () {
                Navigator.of(context).pop();
                _setReportingManager(context, emp);
              },
            ),
            _SheetRow(
              icon: Icons.event_available_outlined,
              label: 'Apply leave on behalf',
              onTap: () {
                Navigator.of(context).pop();
                showRunqSnack(context, 'Coming soon', kind: SnackKind.info);
              },
            ),
            if (canInvite) _inviteRow(context, ref, inviteAsync),
          ]),
          const SizedBox(height: 8),
          // Section: copy actions (no Edit flow needed)
          _SheetGroup(rows: [
            _SheetRow(
              icon: Icons.badge_outlined,
              label: 'Copy employee code',
              trailing: emp.employeeCode,
              onTap: () => _copy(context, emp.employeeCode, 'Employee code copied'),
            ),
            if (emp.phone != null)
              _SheetRow(
                icon: Icons.phone_outlined,
                label: 'Copy phone',
                trailing: emp.phone!,
                onTap: () => _copy(context, emp.phone!, 'Phone copied'),
              ),
            if (emp.email != null)
              _SheetRow(
                icon: Icons.mail_outline_rounded,
                label: 'Copy email',
                trailing: emp.email!,
                onTap: () => _copy(context, emp.email!, 'Email copied'),
              ),
            if (emp.uan != null)
              _SheetRow(
                icon: Icons.account_balance_outlined,
                label: 'Copy UAN',
                trailing: emp.uan!,
                onTap: () => _copy(context, emp.uan!, 'UAN copied'),
              ),
          ]),
          const SizedBox(height: 8),
          // Section: status change (danger-ish)
          _SheetGroup(rows: [
            _SheetRow(
              icon: Icons.badge_outlined,
              label: 'Change employment status',
              trailing: employmentStatusLabel(emp.status),
              onTap: () async {
                // Root navigator's context outlives this sheet — the
                // status picker opens after we've popped, same reason
                // the photo action grabs it.
                final rootCtx = Navigator.of(context, rootNavigator: true).context;
                Navigator.of(context).pop();
                await showEmploymentStatusSheet(rootCtx, emp);
              },
            ),
          ]),
          const SizedBox(height: 6),
          TextButton(
            onPressed: () => Navigator.of(context).maybePop(),
            child: Text('Cancel', style: TextStyle(color: t.muted)),
          ),
        ],
      ),
    );
  }

  Future<void> _copy(BuildContext context, String value, String message) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (context.mounted) {
      Navigator.of(context).pop();
      showRunqSnack(context, message, kind: SnackKind.success);
    }
  }

  /// "Send / Resend app invite" row — relabels based on current state and
  /// disables itself when the employee already has an active app account
  /// or has no email on file. We render a placeholder row while the
  /// status loads rather than hiding it, so the sheet height doesn't
  /// jump after the network call returns.
  _SheetRow _inviteRow(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<HrInviteStatus>? inviteAsync,
  ) {
    final status = inviteAsync?.asData?.value;
    final isLoading = inviteAsync?.isLoading ?? true;

    String label = 'Send app invite';
    String? trailing;
    bool disabled = isLoading;
    IconData icon = Icons.send_outlined;
    if (status != null) {
      switch (status.status) {
        case 'pending':
          label = 'Resend app invite';
          trailing = 'Pending';
          break;
        case 'expired':
          label = 'Resend app invite';
          trailing = 'Expired';
          break;
        case 'accepted':
        case 'active':
          label = 'App access enabled';
          trailing = 'Active';
          icon = Icons.verified_user_outlined;
          disabled = true;
          break;
        case 'inactive':
          label = 'App account inactive';
          trailing = 'Inactive';
          disabled = true;
          break;
        case 'no_email':
          label = 'Add email to invite';
          disabled = true;
          break;
        case 'not_invited':
        default:
          label = 'Send app invite';
      }
    }

    return _SheetRow(
      icon: icon,
      label: label,
      trailing: trailing,
      onTap: disabled ? () {} : () async {
        // Same reason as the status row: this sheet is gone by the time the
        // invite returns, so hold the root context and the container.
        final rootCtx = Navigator.of(context, rootNavigator: true).context;
        final container = ProviderScope.containerOf(context);
        Navigator.of(context).pop();
        await _sendInvite(rootCtx, container);
      },
    );
  }

  Future<void> _sendInvite(BuildContext context, ProviderContainer container) async {
    try {
      final result = await hrRepo.inviteEmployee(emp.id);
      // Refresh status so the sheet reads "Pending" next time.
      container.invalidate(hrEmployeeInviteStatusProvider(emp.id));
      // Always stage the link to clipboard so the inviter has a fallback
      // regardless of whether SMTP delivered. Cheap and never harmful.
      await Clipboard.setData(ClipboardData(text: result.inviteUrl));
      if (!context.mounted) return;
      final emailOk = result.emailDelivery == 'sent';
      final to = result.email ?? emp.email ?? 'employee';
      final msg = emailOk
          ? (result.reused
              ? 'Invite re-sent to $to · link copied'
              : 'Invite sent to $to · link copied')
          : 'Email delivery failed — invite link copied to clipboard';
      showRunqSnack(
        context,
        msg,
        kind: emailOk ? SnackKind.success : SnackKind.error,
      );
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, 'Could not send invite: $e', kind: SnackKind.error);
    }
  }
}

class _SheetGroup extends StatelessWidget {
  final List<_SheetRow> rows;
  const _SheetGroup({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i < rows.length - 1)
              Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 46),
          ],
        ],
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? trailing;
  /// Destructive action — paints icon tile + label in red so the user
  /// sees it as different from the neutral rows. Used for Delete.
  final bool danger;
  final VoidCallback onTap;
  const _SheetRow({
    required this.icon,
    required this.label,
    this.trailing,
    this.danger = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const dangerInk = Color(0xFFDC2626);
    final dangerInkDark = const Color(0xFFFCA5A5);
    final iconInk = danger ? (isDark ? dangerInkDark : dangerInk) : HrColors.brand(context);
    final iconBg = danger
        ? (isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEE2E2))
        : HrColors.tealSubtle;
    final labelInk = danger ? (isDark ? dangerInkDark : dangerInk) : t.ink;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(8)),
              child: Icon(icon, size: 15, color: iconInk),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: RunqText.body.copyWith(color: labelInk),
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  trailing!,
                  textAlign: TextAlign.right,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Pick a single photo from gallery and POST to the photo endpoint.
/// Server resizes + stores; we invalidate the detail provider so the
/// gradient hero refreshes immediately.
Future<void> _pickAndUploadPhoto(BuildContext context, HrEmployee emp) async {
  final picked = await ImagePicker().pickImage(
    source: ImageSource.gallery,
    imageQuality: 90,
    maxWidth: 1600,
  );
  if (picked == null || !context.mounted) return;
  try {
    showRunqSnack(context, 'Uploading photo…');
    await hrRepo.uploadEmployeePhoto(emp.id, File(picked.path));
    if (context.mounted) {
      ProviderScope.containerOf(context, listen: false)
        ..invalidate(hrEmployeeProvider(emp.id))
        ..invalidate(hrEmployeesProvider)
        // The More-screen header avatar reads photoUrl from hrMeProvider
        // (GET /hr/me), a separate cache — refresh it too when this is the
        // user's own photo, else their header keeps showing initials.
        ..invalidate(hrMeProvider);
      showRunqSnack(context, 'Photo updated', kind: SnackKind.success);
    }
  } catch (e) {
    if (context.mounted) {
      showRunqSnack(context, 'Photo upload failed: $e', kind: SnackKind.error);
    }
  }
}

