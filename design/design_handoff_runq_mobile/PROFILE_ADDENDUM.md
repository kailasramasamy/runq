# Addendum: Profile screen

> Drop this file into the existing `design_handoff_runq_mobile/` folder — alongside the original `README.md`. It documents **only** what was added after the first handoff: the new Profile screen, the icons it depends on, and the dashboard entry-point change.

## What's new since the first handoff

1. **Profile screen** added — reached by tapping a new **AR** initials avatar in the top-right of the Dashboard header.
2. **Dashboard header** lost its search icon (it was a dead end) and gained the avatar entry point in its place. The bell icon stays.
3. **Tab bar** is hidden on the Profile route — same modal pattern as `invoiceDetail`, `billScan`, `approvals`, `agent`.
4. **Icon set** in `ui.jsx` was extended with: `gear`, `building`, `users`, `shield`, `help`, `logout`, `moon`, `globe`, `mail`, `phone`, `star`, `qr`. Profile uses all of these except `mail` and `phone` (kept for future detail screens).

## Information architecture (updated)

```
RootShell (bottom nav, FAB)
├── Home (Dashboard)             ← header now has [bell] [AR avatar] (no search)
│   └── Profile (modal)          ← NEW
├── Invoices (AR)
│   └── Invoice Detail
├── …
```

`HIDE_TABS` in `app.jsx` now: `{invoiceDetail, billScan, agent, approvals, profile}`.

## Routing change

In `app.jsx` two lines changed:

```jsx
case 'agent':         return <S.Agent {...props}/>;
case 'profile':       return <S.Profile {...props}/>;     // ← added
default:              return <S.Dashboard {...props}/>;
```

```jsx
const HIDE_TABS = new Set([
  'invoiceDetail', 'billScan', 'agent', 'approvals', 'profile' // ← added
]);
```

In Flutter (`go_router`):
```dart
GoRoute(
  path: '/profile',
  pageBuilder: (c, s) => CupertinoPage(child: ProfileScreen(), fullscreenDialog: true),
)
```
Present it modally so the back chevron makes sense.

## Dashboard header — entry point

The avatar lives where the search button used to:

```
[Tuesday, 28 April                       ]   [bell]  [ AR ]
[Good morning, Arjun                     ]
```

**AR avatar button**: 36×36, 12px radius, no border, `linear-gradient(135deg, #4F46E5, #7C3AED)`, white initials 12/700 `letterSpacing: 0.02em`, drop shadow `0 2px 6px rgba(79,70,229,0.3)`, padding 0. On tap: push `/profile`.

The initials are derived from the user's name (`"AR"` for Arjun Ramaswamy). Same derivation rule as the customer/vendor avatars elsewhere in the app — first letter of first word + first letter of last word, uppercased.

## Profile screen — spec

**Purpose.** One screen for: identity, active workspace, account/security/team, finance preferences specific to runQ, and app preferences. Also the only place to sign out and switch workspaces.

**Pattern.** iOS-style **grouped list** — section labels in muted small-caps above each card; rows live inside a white rounded card with hairline dividers between them. Same family as iOS Settings.

### Header bar

3-column flex, 14px V × 16px H padding:

| Slot | Treatment |
| ---- | --------- |
| Left | Back chevron in 36×36 transparent square button → `nav.back()` |
| Centre | "Profile", 15/600 |
| Right | Gear icon in 36×36 transparent square button → app settings (out of scope of this design) |

### Identity hero

Full-bleed (16px gutters), 14px radius, no border, gradient `linear-gradient(160deg, #F4F0E6 0%, #ECE9E2 100%)`. Two horizontal sections separated by 0.5px hairline:

**Top — identity row** (20px top, 16px bottom, 18px H padding, 14px gap):
- **Avatar 64×64**, rounded-square 18px radius, gradient `linear-gradient(135deg, #4F46E5, #7C3AED)`, initials 22/700 white centred, drop shadow `0 6px 18px rgba(79,70,229,0.35)`. Bottom-right has an **18px green online dot** `#16A34A` with a 2.5px border in the hero gradient stop colour `#F4F0E6` (creates a cut-out feel). In Flutter: stack a `Container` with that border on top of the avatar.
- **Identity stack** beside it:
  - Name 18/700, `letter-spacing: -0.01em` ("Arjun Ramaswamy")
  - Role caption 12/normal muted `#7B7468` ("Founder · Owner")
  - Two chips on a 6px-gap row, 8px top margin:
    - **Owner pill** — bg `rgba(79,70,229,0.1)`, ink `#4F46E5`, 10/700 uppercase, 0.04em letter-spacing, 3×8px padding, 999px radius
    - **Email chip** — bg `rgba(20,18,16,0.05)`, ink `#605A52`, 11/500, 3×8px padding, 999px radius. Truncate with ellipsis.

**Bottom — quick stats strip** (3 cells, equal flex, 12px V × 8px H padding, 0.5px column dividers, bg `rgba(255,255,255,0.5)` over the gradient). Each cell:
- Number 16/700 tabular ("142", "38", "21d")
- Label 11/normal muted, 2px top margin ("Approvals", "Bills scanned", "On runQ")

These three stats are **loose** — replace with whatever the backend exposes that signals usage + tenure.

### Settings groups

Every group is the same shell:

```
margin: 16px 16px 0
title:  11/600 muted #9C9489 uppercase 0.06em letter-spacing,
        4px L padding, 8px bottom padding
card:   white #fff, 14px radius,
        0.5px solid rgba(20,18,16,0.08) border,
        0 1px 3px rgba(20,18,16,0.04) shadow,
        overflow: hidden
```

Each row inside is a `Row3` button (full-width, 14px V × 14px H padding, 12px gap, 0.5px bottom divider except on the last row):

- **Icon tile** 32×32, 9px radius. Default tile bg `#F3F1EC`, icon ink `#605A52`. Override per row when the icon needs to carry meaning (indigo workspace, green security, purple AI).
- **Label** 14/500 `#1A1714`, single line, ellipsis on overflow.
- **Right-aligned value** 13/500 muted `#7B7468`, **max-width 130px**, no-wrap, ellipsis, **`flex-shrink: 0`** (critical — without this the value pushes the label into wrap).
- Optional **badge** pill (e.g. red mini-pill).
- Trailing **chevron** 15px ink `#C4BBAE`, stroke 2.

Tap row → push the related detail route (out of scope of this design — implement empty stubs initially).

#### Group 1 — Workspace

| Icon (tile / ink) | Label | Value |
| --- | --- | --- |
| building (`rgba(79,70,229,0.1)` / `#4F46E5`) | Nimbus Tech Services | GSTIN ··· 4567T1Z4 |
| refresh (default) | Switch workspace | 2 others |

> ⚠️ **Show only the last 8 chars of the GSTIN** ("··· 4567T1Z4"). The full 15-char GSTIN forces the company name to wrap to 3 lines on a 402px screen — verifier-flagged issue from the prototype. Same masking pattern the bank account rows use elsewhere in the app.

#### Group 2 — Account

| Icon | Label | Value |
| --- | --- | --- |
| user | Personal info | Edit |
| shield (`rgba(4,120,87,0.1)` / `#047857`) | Security | 2FA on |
| users | Team & roles | 6 members |
| bell | Notifications | WhatsApp · Email |
| qr | Linked devices | 3 |

#### Group 3 — Finance preferences (the runQ-specific block — give it the most product weight)

| Icon | Label | Value |
| --- | --- | --- |
| bank | Connected banks | 3 linked |
| paper | GST settings | Quarterly · QRMP |
| receipt | Invoice templates | 3 |
| sparkle (`rgba(124,58,237,0.1)` / `#7C3AED`) | Agent automations | 4 active |

> "QRMP" is the real GST Quarterly Return Monthly Payment scheme. Don't reword.

#### Group 4 — App

| Icon | Label | Value |
| --- | --- | --- |
| moon | Appearance | _current density_ |
| globe | Language & region | English · India |
| help | Help & support | — |
| star | Rate runQ | — |

### Sign out

Standalone, isolated below the groups (20px top margin). Full-width white button, 14px padding, 14px radius, red-tinted border `0.5px solid rgba(185,28,28,0.2)`, red ink `#B91C1C`, 14/600 label, default card shadow. Layout: `logout` glyph (size 17, stroke 2) + "Sign out", centred, 8px gap.

**Add a confirm dialog in Flutter** (`showCupertinoDialog` / `AlertDialog`) — the design doesn't include one because that's a platform pattern.

### Footer

Centred, 20px top × 16px H × 8px bottom padding, 11/normal muted `#9C9489`:
- runQ wordmark in League Spartan 800 (14px), neutral `#605A52` with the Q in indigo `#4F46E5`.
- Below: "Version 1.4.2 (build 2042)" — pull real values from package metadata.

## State

| Field | Source |
| --- | --- |
| Avatar initials | derived from `user.name` |
| Name, role, email | session/user object |
| Online dot | always shown in v1 — no presence backend yet |
| Three hero stats | usage telemetry (replace with real signals) |
| "Connected banks · 3 linked" | count of connected bank integrations |
| "Agent automations · 4 active" | count of enabled automations |
| Appearance value | reflects active theme/density preference (not the prototype's design-time `tweaks.density` knob) |

All right-side values are read-only on this screen; tap pushes the detail route.

## Empty / new-user states

- **Single workspace** — hide the "Switch workspace · 2 others" row entirely. Don't show "0 others".
- **2FA off** — the Security value should read "Set up 2FA" in indigo `#4F46E5` instead of "2FA on" in green `#047857`. Soft prompt, no separate row.
- **No agent automations** — value reads "—" (em-dash) muted, no count.

## Icons added to `ui.jsx`

Added 12 new lucide-flavoured icons (stroke 1.75, viewBox 24):

`gear`, `building`, `users`, `shield`, `help`, `logout`, `moon`, `globe`, `mail`, `phone`, `star`, `qr`

In Flutter, swap to Material/Cupertino icons or a coherent pack — keep the metaphors:

| Prototype | Suggested Flutter (Material) |
| --- | --- |
| gear | `Icons.settings_outlined` |
| building | `Icons.business_outlined` |
| users | `Icons.group_outlined` |
| shield | `Icons.shield_outlined` |
| help | `Icons.help_outline` |
| logout | `Icons.logout` |
| moon | `Icons.dark_mode_outlined` |
| globe | `Icons.language` |
| star | `Icons.star_border` |
| qr | `Icons.qr_code_2` |

## Accessibility

- Full row is the tap target — current design is **60px tall** including padding (≥44 logical px ✓).
- **Online dot** is decorative — exclude from semantics.
- **Owner pill** is meaningful — expose as `Semantics(label: 'Role: Owner')`.
- **Avatar** should read as profile photo: `Semantics(label: 'Profile photo, Arjun Ramaswamy')`.
- All right-side values are part of the row's accessibility label, e.g. `"Security, 2FA on"` — implement with a single `Semantics(label: …)` per row, not separate ones for label and value.

## Files changed in the prototype bundle

| File | Change |
| --- | --- |
| `prototype/screens.jsx` | Added `Profile` component before the `return { … }`. Added `'profile'` to the exported map. Modified Dashboard header — replaced search button with AR avatar that does `nav.go('profile')`. |
| `prototype/app.jsx` | Added `case 'profile'` to the screen switch. Added `'profile'` to `HIDE_TABS`. |
| `prototype/ui.jsx` | Added 12 icons to the `I` map. |

If you've already pulled the original zip, replace those three files with the versions in the updated bundle (or just look up the new `Profile` component — search for `// PROFILE` in `screens.jsx`).
