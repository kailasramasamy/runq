#!/usr/bin/env bash
# Regression guard for the app-wide font scale.
#
# Every Flutter `Text` must render through the RunqText theme scale
# (lib/theme/runq_theme.dart) — never a hardcoded `fontSize:` literal.
# Hardcoded sizes are how the HR module drifted ~2px smaller than the rest
# of the app; this keeps the whole app on one scale. Computed sizes (e.g.
# `fontSize: size * 0.38` on a proportional avatar) don't match the literal
# pattern and are fine.
#
# Scope: all UI code under lib/screens, lib/widgets, lib/shell, lib/services.
# Excluded: the theme definitions themselves (lib/theme, outside the dirs
# below), and PDF generators (*_pdf.dart — the `pdf` package's pw.TextStyle
# is a separate render pipeline with no access to the app theme).
#
# Run from apps/mobile/:  ./scripts/check-fonts.sh

set -euo pipefail

DIRS=(lib/screens lib/widgets lib/shell lib/services)

for d in "${DIRS[@]}"; do
  if [[ ! -d "$d" ]]; then
    echo "check-fonts: run this from apps/mobile/ (no $d here)" >&2
    exit 2
  fi
done

# `fontSize:` followed by a numeric literal, excluding PDF generators.
hits=$(grep -rnE 'fontSize: ?[0-9]' "${DIRS[@]}" | grep -v '_pdf\.dart:' || true)

if [[ -n "$hits" ]]; then
  echo "check-fonts: FAIL — hardcoded fontSize literals found" >&2
  echo "Route every Text through the RunqText scale instead (see runq_theme.dart)." >&2
  echo >&2
  echo "$hits" >&2
  exit 1
fi

echo "check-fonts: OK — app UI is fully theme-routed."
