#!/usr/bin/env bash
# Regression guard for app-wide toast feedback.
#
# Every toast must go through lib/widgets/runq_snack.dart — `RunqSnack.success`
# / `.error` / `.warning` / `.info`, or `showRunqSnack` / `showRunqSnackOn`.
# A raw `ScaffoldMessenger.showSnackBar` renders a bare Material bar: wrong
# surface in both themes, no severity icon, flat 4s timeout regardless of how
# bad the news is, and nothing pushed to the accessibility live region.
#
# Scope: all UI code under lib/screens, lib/widgets, lib/shell, lib/services.
# Excluded: runq_snack.dart itself, which is the one legitimate caller.
#
# Run from apps/mobile/:  ./scripts/check-snack.sh

set -euo pipefail

DIRS=(lib/screens lib/widgets lib/shell lib/services)

for d in "${DIRS[@]}"; do
  if [[ ! -d "$d" ]]; then
    echo "check-snack: run this from apps/mobile/ (no $d here)" >&2
    exit 2
  fi
done

hits=$(grep -rn 'showSnackBar' "${DIRS[@]}" | grep -v 'widgets/runq_snack\.dart:' || true)

if [[ -n "$hits" ]]; then
  echo "check-snack: FAIL — raw showSnackBar calls found" >&2
  echo "Use RunqSnack.success/.error/.warning/.info (widgets/runq_snack.dart)." >&2
  echo "For a messenger captured across an async gap, use showRunqSnackOn." >&2
  echo >&2
  echo "$hits" >&2
  exit 1
fi

echo "check-snack: OK — all toasts route through runq_snack."
