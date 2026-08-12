#!/usr/bin/env bash
# Build the iOS release and upload it to App Store Connect in one step.
#
# Replaces the manual loop of:
#   flutter build ipa --release
#   open ios/Runner.xcworkspace  →  Product ▸ Archive  →  Distribute ▸ Upload
#
# `flutter build ipa` already archives AND exports a signed .ipa; Xcode's
# Organizer was only ever the upload transport. This drives that upload from
# the CLI with an App Store Connect API key, so there is no 2FA prompt and no
# window to keep open.
#
# The key identifiers are baked in below, so the only per-machine requirement
# is the private key itself:
#     ~/.appstoreconnect/private_keys/AuthKey_YL686HH2SA.p8
# xcrun finds it there by convention. Apple lets you download that .p8 exactly
# once — a backup lives in Dropbox/Certificates/runq/.
#
# To use a different key (another account, or after a revoke), either edit the
# defaults below or override per-run:
#     ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=<uuid> ./scripts/release-ios.sh
#
# Run from apps/mobile/:
#   ./scripts/release-ios.sh                 # build + upload
#   ./scripts/release-ios.sh --build-only    # stop after the .ipa
#   ./scripts/release-ios.sh --upload-only   # upload the last build again
#   ./scripts/release-ios.sh --build-number 42
#
# Signing note: this app archives two targets (Runner + ShareExtension). If a
# provisioning profile is missing, the build fails here rather than silently
# producing an unsigned archive — fix it once in Xcode and the CLI keeps working.

set -euo pipefail

# App Store Connect API key identifiers. These two only identify the account —
# the private .p8 is what actually authenticates, and it stays out of the repo.
# Env vars win, so a different key can be used without editing this file.
ASC_KEY_ID="${ASC_KEY_ID:-YL686HH2SA}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-c537aebb-3f16-4fb3-9faa-335586aa73b6}"

IPA_DIR="build/ios/ipa"
BUILD=1
UPLOAD=1
BUILD_NUMBER=""

die() { echo "release-ios: $*" >&2; exit 1; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only)  UPLOAD=0; shift ;;
    --upload-only) BUILD=0; shift ;;
    --build-number)
      [[ $# -ge 2 ]] || die "--build-number needs a value"
      BUILD_NUMBER="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

[[ -f pubspec.yaml && -d ios ]] || die "run this from apps/mobile/"

# ── Preflight ────────────────────────────────────────────────────────────
# Everything that can be wrong is checked before the ~10 minute build, so a
# missing key is a 2-second failure rather than a wasted archive.
if [[ "$UPLOAD" == 1 ]]; then
  KEY_FILE="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
  [[ -f "$KEY_FILE" ]] || die "no API key at $KEY_FILE
  Download the .p8 from App Store Connect and save it there (Apple only
  offers the download once — if you've lost it, revoke the key and make a new one)."
fi

VERSION_LINE=$(grep -m1 '^version:' pubspec.yaml | tr -d ' ' | cut -d: -f2)
echo "release-ios: ${VERSION_LINE}${BUILD_NUMBER:+ (build number overridden to $BUILD_NUMBER)}"

# ── Build ────────────────────────────────────────────────────────────────
if [[ "$BUILD" == 1 ]]; then
  step "Building release IPA"
  rm -rf "$IPA_DIR"
  BUILD_ARGS=(--release)
  [[ -n "$BUILD_NUMBER" ]] && BUILD_ARGS+=(--build-number "$BUILD_NUMBER")
  flutter build ipa "${BUILD_ARGS[@]}"
fi

shopt -s nullglob
IPAS=("$IPA_DIR"/*.ipa)
shopt -u nullglob
(( ${#IPAS[@]} > 0 )) || die "no .ipa in $IPA_DIR — run without --upload-only to build one first"
(( ${#IPAS[@]} == 1 )) || die "more than one .ipa in $IPA_DIR; delete the stale ones and retry"
IPA="${IPAS[0]}"

# ── Validate, then upload ────────────────────────────────────────────────
# Validation catches the rejections that otherwise arrive by email twenty
# minutes later: bad Info.plist keys, missing icons, an already-used build
# number. It costs seconds and saves a round trip.
if [[ "$UPLOAD" == 1 ]]; then
  step "Validating $(basename "$IPA")"
  xcrun altool --validate-app -f "$IPA" -t ios \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" \
    || die "validation failed — fix the errors above; nothing was uploaded"

  step "Uploading to App Store Connect"
  xcrun altool --upload-app -f "$IPA" -t ios \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

  step "Done"
  echo "Uploaded ${VERSION_LINE}. App Store Connect takes 5-15 minutes to process"
  echo "it, then it shows up in TestFlight for internal testers."
  echo
  echo "Nothing is submitted or released by this script — promoting the build to"
  echo "external testers or to App Store review stays a manual step in the"
  echo "App Store Connect UI."
else
  step "Built $IPA"
  echo "Upload it with: $0 --upload-only"
fi
