# Vrindavan Dairy — A1 Rate Chart & Farmer Bonus Plan

Date: 2026-07-28. Scope: **A1 cow milk only.** A2 deferred.
Basis: 372 real A1 pours, 9,667 L, 35 collection days, 7 Vrindavan farmers (demo excluded).
KMF chart from `KMF_milk_rate_chart.xlsx`. Final chart: `~/Downloads/vrindavan_A1_final_rate_chart.csv`.

**Decisions taken:** mirror KMF's structure above 3.5 rather than out-bid it · **hard cap ₹44/L
all-in, reached at 4.5 FAT** (KMF needs 4.8) · **steep −₹1.25/0.1 taper below 3.5, well clear of
KMF's −₹0.50** · pay the bonus quarterly as a lump sum · no bonus below 3.5 FAT · compete on
service, not on rate.

---

## 1. The final chart

**Base rate paid daily. Quarterly bonus staggered by FAT — ₹3.00 to ₹7.20/L.**

| FAT | CLR | Base ₹/L | **Bonus ₹/L** | **ALL-IN ₹/L** | KMF | Edge | Qtr cheque @20 L/day |
|---|---|---|---|---|---|---|---|
| 3.0 | 29.2 | 28.75 | — | 28.75 | 32.50 | −3.75 | — |
| 3.4 | 28.8 | 33.75 | — | 33.75 | 34.50 | −0.75 | — |
| **3.5** | 28.7 | 35.00 | **3.00** | 38.00 | 41.00 | −3.00 | 5,400 |
| 3.6 | 28.6 | 35.30 | 3.00 | 38.30 | 41.23 | −2.93 | 5,400 |
| **3.7** | 28.5 | 35.60 | **6.00** | **41.60** | 41.46 | +0.14 | **10,800** |
| 3.8 | 28.4 | 35.75 | 6.00 | **41.75** | 41.69 | +0.06 | 10,800 |
| 3.9 | 28.3 | 35.90 | **6.30** | **42.20** | 41.92 | +0.28 | 11,340 |
| 4.0 | 28.2 | 36.05 | **6.60** | **42.65** | 42.15 | +0.50 | 11,880 |
| 4.1 | 28.1 | 36.20 | 6.60 | **42.80** | 42.38 | +0.42 | 11,880 |
| 4.2 | 28.0 | 36.35 | **6.90** | **43.25** | 42.61 | +0.64 | 12,420 |
| 4.3 | 27.9 | 36.50 | 6.90 | **43.40** | 42.84 | +0.56 | 12,420 |
| 4.4 | 27.8 | 36.65 | **7.20** | **43.85** | 43.07 | +0.78 | 12,960 |
| **4.5** | 27.7 | 36.80 | 7.20 | **44.00** ← cap | 43.30 | **+0.70** | **12,960** |
| 4.6 – 5.0+ | — | 36.80 | 7.20 | **44.00** | 43.53 – 44.45 | +0.47 → −0.45 | 12,960 |

**Bonus tiers — read from each pour's own FAT, printed as explicit ranges:**

| FAT of the pour | Bonus ₹/L |
|---|---|
| 4.40 and above | **7.20** |
| 4.20 – 4.39 | 6.90 |
| 4.00 – 4.19 | 6.60 |
| 3.85 – 3.99 | 6.30 |
| 3.70 – 3.84 | 6.00 |
| 3.50 – 3.69 | 3.00 |
| below 3.50 | 0 |

A chart that reads "4.0 → ₹6.60" invites an argument from every farmer who measures 3.99.
Bands, always.

### Per-pour, not quarterly-average

Each pour banks its own bonus from its own FAT, fixed the moment it is recorded, and the
quarter's total is paid as one lump sum. On real pours this costs **the same** — ₹4.74/L either
way, a ₹36/year difference at 276 L/day — so it is free, and it buys three things:

- **Nothing is ever recomputed.** The daily receipt, the in-app counter and the cheque agree by
  construction. Under quarterly averaging a daily figure would have to use quarter-to-date mean
  while the payout used a different rule, so it would have been systematically wrong for 90 days.
- **No cliff, no lottery.** Nobody's cheque turns on which side of a tier line a 90-day mean
  lands, which is what the best-two-of-three rule existed to paper over. That rule is gone.
- **Stage 2 collapses.** The quarter-close job is a gated `SUM` of `mp_pours.quarterly_bonus_amount`,
  not a tier engine with monthly-average logic.

It redistributes, and volatility now costs: Bhadra Reddy's average of 3.80 clears the 3.70 tier,
but **33% of his litres individually do not**, so he moves from ₹6.00 to ₹4.90/L — about ₹1,923 a
quarter on 18% of supply. Santhosh and the low-FAT suppliers gain, because their occasional good
pours now earn instead of being averaged away. A steady farmer earns more than a volatile one at
the same mean, which is the behaviour we want — but Bhadra will feel the switch.

**Base formula:**
- FAT ≥ 3.7: ₹35.60 + (FAT − 3.7) × ₹1.50, capped at 4.5 → ₹36.80
- FAT 3.5–3.69: ₹35.00 + (FAT − 3.5) × ₹3.00
- FAT < 3.5: ₹35.00 − (3.5 − FAT) × **₹12.50**

### Why the stagger works here — and why it nearly didn't

Inside a hard ₹44 cap the room to stagger is fixed. Holding KMF parity at 3.7 (₹41.46) and the
cap at 4.5 (₹44.00) leaves exactly **₹2.54 to distribute across 0.8 FAT.** A naive upward
stagger — ₹4 at 3.7 rising to ₹6 at 4.3 — has to *start lower* in order to end at the cap, and
drops us ₹0.26–1.86 **below KMF right through 3.7–4.2**, the recruiting zone. That version was
tested and rejected.

The fix costs nothing: **move half the gradient out of the base and into the bonus.** The base
slope above 3.7 drops from ₹3.00 to ₹1.50 per 1% FAT and the bonus picks up the difference.
All-in ₹/L is unchanged at every point — but the *bonus* now visibly climbs ₹6.00 → ₹7.20, and
the quarterly cheque climbs ₹10,800 → ₹12,960.

The split between base and bonus is a **marketing choice, not an economic one.** Total cost is
identical either way; only the number the farmer quotes in the village changes.

### What the stagger buys

| | Flat ₹6 @3.7+ | **Staggered** |
|---|---|---|
| Headline bonus | ₹6.00 — ties KMF | **"up to ₹7.20"** — beats KMF |
| Best cheque @20 L/day | ₹10,800 | **₹12,960** |
| Biggest tier-to-tier drop | **₹6.00** | **₹3.00** |
| Marginal reward for 3.9 → 4.0 | ₹0.30 (base only) | **₹0.60** |
| Volume at risk vs KMF | 37% | **19%** |
| Santhosh (3.59) vs KMF | −4.68 | **−1.76** |
| Blended cost | ₹38.84 | ₹39.17 |

Under a flat bonus a farmer at 3.8 gains **nothing** from the bonus by improving — only the
₹0.30/0.1 base slope. That is a payment for crossing a line, not a quality incentive. The
stagger restores an actual gradient.

It also halves the cliff problem. Bhadra Reddy sits below 3.7 in 2 weeks of 5; under the flat
design a bad quarter cost him the entire ₹10,800, under this one he drops to the ₹3.00 tier and
keeps ₹5,400. **A bonus you can half-lose teaches effort; one you can wholly lose teaches
fatalism.**

---

## 2. What it costs

| | ₹/L |
|---|---|
| Today | 36.30 |
| **New chart all-in** | **39.17** |
| KMF all-in | 40.25 |

- **Uplift +₹2.87/L** → **₹23,760/month · ₹2.89 L/year** at 276 L/day
- ₹33,000/yr more than the flat-₹6 design — and it buys back Santhosh (18% of supply), halves
  the cliff, and gives a headline that beats KMF's ₹6
- Blended ₹39.17 against ₹56/L A1 retail

| Farmer | Litres | FAT | All-in | KMF | Edge | Cheque |
|---|---|---|---|---|---|---|
| S18 Sudhakar | 2,650 | 4.37 | 43.39 | 42.99 | +0.40 | ₹18,283 |
| S19 Nagaraj | 1,772 | 4.84 | 43.98 | 44.08 | −0.11 | ₹12,755 |
| S20 Bhadra Reddy | 1,703 | 3.79 | 41.28 | 40.74 | +0.55 | ₹10,219 |
| S16 Santhosh | 1,721 | 3.59 | 37.55 | 39.32 | −1.76 | ₹5,163 |
| S17 Kishore | 1,250 | 2.85 | 26.80 | 32.05 | −5.25 | ₹0 |

**Volume at risk falls to 19%** — Kishore and the two small suppliers, all genuinely low-fat.
Santhosh is now only ₹1.76 behind KMF instead of ₹4.68, which is inside the range that farm-gate
collection and flexible timing (§4) more than cover.

---

## 3. ⚠ Watering pays across the whole bonus zone — the SNF gate is load-bearing

This is broader than I framed it earlier. It is not just the ₹44 cap. **Everywhere the all-in
rate rises more slowly than fat does, diluting is profitable** — and with a flat ₹6 bonus sitting
on a ₹0.30/0.1 base slope, that is the entire zone above 3.7.

Water 20 L down to the 3.7 threshold and stop there:

| From | Paid | Watered to 3.7 | Paid | Gain | Same trick on KMF's chart |
|---|---|---|---|---|---|
| 4.0 FAT | ₹850 | 21.6 L | ₹899 | **+₹49** | +₹53 |
| 4.2 FAT | ₹862 | 22.7 L | ₹944 | **+₹82** | +₹89 |
| 4.5 FAT | ₹880 | 24.3 L | ₹1,012 | **+₹132** | +₹142 |

**KMF's chart is marginally worse than ours on this**, which is the point: this is inherent to
the low-base-plus-flat-bonus model both charts use. It is exactly why KMF's passbook shows
**CLR = 32.2 − FAT holding to the decimal across all 59 rows.** That is not a natural
relationship — it is an enforced standard, and they enforce it because their rate structure
gives them no choice.

If we adopt their pricing model we must adopt their policing. **Without the SNF gate this chart
loses money to dilution.**

**Required control — pay on FAT, gate on SNF/CLR:**

| Reading | Action |
|---|---|
| SNF ≥ 8.3 (CLR ≥ 27) | Normal |
| SNF 8.0 – 8.29 | Pay, flag the farmer, operator warning on the app |
| SNF < 8.0 (CLR < 26.5) | **Rate drops to the sub-3.5 scale; no quarterly bonus that quarter** |

Publish the CLR column on the printed chart (it is in the CSV) so farmers see the expected
FAT↔CLR relationship. Watering breaks it visibly, and everyone knows it does.

`mp_quality_bands` already stores per-node good/watch floors for fat/snf/clr — the gate should
read from there rather than hard-coding thresholds.

---

## 4. Where we actually win: service, not rate

The chart buys us parity. **These two buy us farmers**, and they cost us nothing extra because
we already run the route.

### We collect at the farm gate. KMF makes them carry milk to the VMCC.

A farmer walking or riding 1–3 km to a VMCC and back, **twice a day**, spends 1–2 hours daily.
Against a Karnataka rural day wage of ~₹350–450, that is **₹60–80/day of their time**, plus
fuel. For a 20 L/day farmer:

> **₹3.00 – ₹4.50 per litre of value we hand back — larger than the entire rate gap we were
> trying to close with money.**

### Our timing is flexible. KMF's window is strict.

Miss the KMF slot and the milk is simply unsold — a total loss for that shift, not a discount.
Two missed slots a month at 10 L is ₹880 gone, ~₹1.50/L. Add the daily stress of racing a clock
with a calving cow or a sick child.

**Effective offer: ₹44/L on the chart, ₹48–50/L in the farmer's real economics, against KMF's
₹44.** That is the pitch, and it is honest.

### The recruitment message

> **"Same ₹6 bonus. Better rate at every fat above 3.5. We reach ₹44 at 4.5 fat — KMF needs
> 4.8. And you never leave your farm, never race a clock, and never lose a shift's milk for
> being ten minutes late."**

---

## 5. Bonus mechanics

- **Quarterly lump sum**, paid on the 1st of the month after quarter end. Same ritual as KMF —
  the lump sum *is* the product. Forced savings a smallholder cannot manage alone, funding
  school fees, a festival, an animal. Paid monthly it dissolves into groceries and buys no
  loyalty.
- **Staggered ₹3.00–₹7.20/L**, banked per pour from that pour's own FAT at capture and summed at
  quarter close. `mp_pours.quarterly_bonus_amount` holds the accrual, deliberately outside
  `line_amount` so the fortnightly cycle never pays it.
- **Tier bands are ranges, not points** (see §1). Publish them as ranges on every printed chart.
- **Gate:** supplied ≥ 85% of collection shifts, zero rejected pours, and no SNF failure per
  §3. Miss the gate, bonus is ₹0.
- 20 L/day farmer = 1,800 L/quarter = **₹10,800 cheque** — identical to KMF's, which matters,
  because farmers compare cheques, not ₹/L. But note the flip side of a 3.8 threshold: a farmer
  in the ₹3.00 tier gets half of it. Per-pour accrual removes the failure mode entirely: a bad
  week costs only that week's litres, never the quarter.

---

## 6. Build work in runq

| # | Item | Notes |
|---|---|---|
| 1 | Load the chart | FAT-only, no SNF matrix. `mp_rate_charts` + `mp_rate_chart_cells`, or a `clr`/formula mode. Cap at FAT 4.5; base slope ₹1.50/1% above 3.7, staggered bonus tiers |
| 2 | **SNF/CLR gate** | §3. Blocks the watering exploit — **not optional**. A gated pour banks ₹0 bonus |
| 3 | **Quarter-close run** | Gated `SUM` of `mp_pours.quarterly_bonus_amount` per farmer → `mp_bonus_runs` / `mp_bonus_lines`. The tier engine is gone — accrual happens at capture, so the run only sums and gates |
| 4 | **Live bonus counter (mobile)** | "Quarter to date: 4.05 FAT → ₹6.00/L → **₹8,240** on 1 Oct." KMF farmers have no idea what is coming until it lands. Nearly free, and it makes the lump sum work on them for 90 days instead of one day |
| 5 | GL | Bonus is milk purchase cost → 5050, **accrued monthly, paid in month 4**. Do not let a quarter land as one lumpy hit. See `MpGlPoster` |
| 6 | Recruitment one-pager | Chart + the two service advantages. Kannada and English |

Items 2 and 3 are the real engineering.

---

## 7. Open items

- **Marginal cost per litre.** GL shows opex ₹27.0 L on revenue ₹48.6 L over 120 days — 55% of
  revenue before any milk is bought. That average is distorted (most revenue is resale of
  bought-in material), so what matters is the marginal cost of one more A1 litre through an
  existing route — packaging, incremental delivery, wastage. At ₹40.40 procurement and ₹56
  retail there is ~₹15.60 of room; if marginal cost runs above that, the answer is raising A1
  retail, not a bigger bonus.
- **Confirm the ₹6 is state money**, not KMF-funded. If KMF funds it themselves this plan is
  too conservative.
- **Staggered bonus settled** (2026-07-29). At-risk volume 19%; Santhosh −₹1.76 vs KMF, inside
  what farm-gate collection covers. Best-two-of-three-months tiering adopted.
- **No reward above 4.5 FAT.** Accepted trade for cost control, but Nagaraj (4.84) now has no
  economic reason to hold quality. Consider non-cash recognition — priority feed allocation,
  free vet visits — rather than reopening the rate.
- **A2** deferred. Still the larger opportunity: ₹71/L retail against a chart paying only ₹3/L
  over A1, and zero A2 currently procured despite ~166 L/day sold.

---

## 8. Caveats

- Seven farmers, 35 days, one VMCC. Directional, not a budget.
- "One quarter" is proxied by the 35-day window; real quarterly averages are smoother, which
  slightly raises bonus cost as fewer farmers drop out of eligibility on a bad week.
- KMF's ₹35 base is revised periodically. Valid for the Apr–Jul 2026 window only.
