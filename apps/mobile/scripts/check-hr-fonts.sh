#!/usr/bin/env bash
# Regression guard for the HR module font migration.
#
# Every Text in lib/screens/hr/ must render through the RunqText theme
# scale (RunqText.body / caption / label / h2 / tabular(...) etc.) — never
# a hardcoded `fontSize:` literal. Hardcoded sizes are how the module
# drifted ~2px smaller than the rest of the app in the first place.
#
# This fails CI if any `fontSize: <number>` literal reappears. Computed
# sizes (e.g. `fontSize: size * 0.38` on a proportional avatar) are fine
# and do not match the literal pattern.
#
# Run from apps/mobile/:  ./scripts/check-hr-fonts.sh

set -euo pipefail

HR_DIR="lib/screens/hr"

if [[ ! -d "$HR_DIR" ]]; then
  echo "check-hr-fonts: run this from apps/mobile/ (no $HR_DIR here)" >&2
  exit 2
fi

# Match `fontSize:` followed by a numeric literal (optional leading space).
hits=$(grep -rnE 'fontSize: ?[0-9]' "$HR_DIR" || true)

if [[ -n "$hits" ]]; then
  echo "check-hr-fonts: FAIL — hardcoded fontSize literals found in $HR_DIR" >&2
  echo "Route every Text through the RunqText scale instead (see runq_theme.dart)." >&2
  echo >&2
  echo "$hits" >&2
  exit 1
fi

echo "check-hr-fonts: OK — $HR_DIR is fully theme-routed."
