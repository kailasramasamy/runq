# Dhenu — Google Play Store Listing Runbook

App: **Dhenu** (`com.quartex.dhenu`), `apps/collect/`. First listing + every future release.

---

## 0. One-time: developer account

1. Google Play Console account at https://play.google.com/console — $25 one-time.
2. Use an **organization** account (Quartex), not personal. Two reasons:
   - Personal accounts created after Nov 2023 must run a closed test with **12 testers for 14 days** before production access. Org accounts skip this.
   - Org accounts need a D-U-N-S number + identity verification — start early, verification takes days.

## 1. Create the app

Play Console → **Create app**:
- Name: `Dhenu`, default language `English (India)`
- App (not game), **Free**
- Accept declarations.

## 2. App content declarations (Policy → App content)

Complete every item — production is blocked until all are done:

| Item | Answer for Dhenu |
|---|---|
| Privacy policy | URL required. Must cover: phone number, name, precise location (farmer GPS), photos, milk/payout data. Host on the runq/dhenu site. |
| App access | **All or some functionality is restricted** → provide reviewer credentials: a demo phone number whose OTP is fixed/known (same idea as the Apple `runq-demo` login). Add step-by-step login instructions. |
| Ads | No |
| Content rating | IARC questionnaire → utility/productivity, no objectionable content → rates Everyone/3+ |
| Target audience | 18+ only (keeps you out of Families policy) |
| News app | No |
| COVID-19 app | No |
| Data safety | See §3 |
| Government app | No |
| Financial features | "My app doesn't provide any financial features" — payout *tracking* is not lending/banking |
| Account deletion | Point to in-app deletion (Profile → Delete account, already built) **and** a web URL for deletion requests — Google requires the URL even with in-app deletion. |

## 3. Data safety form

Declare as **collected** (all encrypted in transit, deletable via account deletion):
- **Personal info**: name, phone number (app functionality, account management)
- **Location**: precise location — farmer profile GPS (app functionality, optional)
- **Photos**: farmer profile photo (app functionality, optional)
- **Financial info**: "other financial info" — milk payout amounts (app functionality)
- **App activity / identifiers**: FCM push token (app functionality)

Not shared with third parties. No data "sold". MSG91 (OTP) and Firebase (push) are processors, not sharing in Play's sense.

Manifest permissions that must line up: `ACCESS_FINE_LOCATION`, `CAMERA`, `RECORD_AUDIO` (voice onboarding), `POST_NOTIFICATIONS`. No background location → no sensitive-permission video declaration needed.

## 4. Main store listing (Store presence → Main store listing)

Assets required:
- **App name** ≤30 chars: e.g. `Dhenu – Milk Collection`
- **Short description** ≤80 chars: e.g. `Daily milk pours, quality, rates and payouts for farmers and collection centres`
- **Full description** ≤4000 chars — cover the 4 personas (farmer, VMCC, CC, PP), shift-wise pours, FAT/SNF/CLR quality, rate charts, cycle payouts, Kannada/Tamil support
- **App icon**: 512×512 PNG, ≤1 MB (export from the emerald icon set)
- **Feature graphic**: 1024×500 PNG — required
- **Phone screenshots**: 2–8, portrait 9:16 (1080×2400 works). Suggest: farmer home w/ earnings, pour entry, quality result, payout cycle, VMCC dispatch. Take in **release/profile mode without the debug banner**, light mode; a Kannada/Tamil shot is a nice differentiator.
- Category: **Business**; contact email required.

## 5. Countries

Production → Countries/regions → add **India** only (expand later if needed).

## 6. First upload + Play App Signing

1. Bump version in `apps/collect/pubspec.yaml` (`1.0.2+6` → the `+N` is `versionCode`, **must increase on every upload**).
2. `cd apps/collect && flutter build appbundle --release`
   → `build/app/outputs/bundle/release/app-release.aab` (signed by `android/key.properties` keystore — that becomes the **upload key**; back it up).
3. On first upload, accept **Play App Signing** (default — Google holds the release key).
4. After enrolling: copy the **Play App Signing SHA-256** (Setup → App integrity) into the Firebase project's Android app settings and re-download `google-services.json` if it changes. (Not strictly needed for plain FCM, but keeps Google APIs working later.)

## 7. Release path

1. **Internal testing** track first: upload the AAB, add tester emails, install via opt-in link. Verify OTP login, push notification, camera/photo, and force-update gate against prod API.
2. Then promote the same build: Release → Production → **Create release** → add release notes (en-IN) → review → **Start rollout** (staged % optional; 100% is fine at this scale).

## 8. Review + after

- First-time app review: typically 1–7 days. Fix-and-resubmit restarts the clock.
- Check the **pre-launch report** (Play runs the app on real devices) for crashes/warnings.
- App goes live automatically on approval unless you chose managed publishing.

## Future releases (the whole loop)

```bash
# 1. bump  apps/collect/pubspec.yaml  →  version: X.Y.Z+N   (N strictly increasing)
# 2. build
cd apps/collect && flutter build appbundle --release
# 3. Play Console → Production → Create release → upload app-release.aab
#    → release notes → rollout
```
