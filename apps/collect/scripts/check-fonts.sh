#!/usr/bin/env bash
# Regression guard for the Dhenu font scale.
#
# Every Flutter `Text` must render through the DhenuText scale
# (lib/theme/dhenu_theme.dart) — never a hardcoded `fontSize:` literal.
# This keeps the whole app on one type scale and protects the
# low-literacy min-16 floor (see feedback_hr_mobile_typography). Computed
# sizes (e.g. `fontSize: size * 0.38` on a proportional avatar) don't match
# the literal pattern and are fine.
#
# Scope: all UI code under lib/screens, lib/widgets, lib/services.
# Excluded: the theme definitions themselves (lib/theme).
#
# Run from apps/collect/:  ./scripts/check-fonts.sh

set -euo pipefail

if [[ ! -d lib/widgets ]]; then
  echo "check-fonts: run this from apps/collect/ (no lib/widgets here)" >&2
  exit 2
fi

# Only scan UI dirs that exist (services/screens land in later waves).
DIRS=()
for d in lib/screens lib/widgets lib/services; do
  [[ -d "$d" ]] && DIRS+=("$d")
done

# `fontSize:` followed by a numeric literal.
hits=$(grep -rnE 'fontSize: ?[0-9]' "${DIRS[@]}" || true)

if [[ -n "$hits" ]]; then
  echo "check-fonts: FAIL — hardcoded fontSize literals found" >&2
  echo "Route every Text through the DhenuText scale instead (see dhenu_theme.dart)." >&2
  echo >&2
  echo "$hits" >&2
  exit 1
fi

echo "check-fonts: OK — app UI is fully theme-routed."
