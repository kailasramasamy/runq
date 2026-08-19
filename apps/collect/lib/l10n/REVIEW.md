# Dhenu translation review status

`app_en.arb` is the source of truth (human-written English). The Indic locale
files (`app_kn.arb` Kannada, `app_ta.arb` Tamil) are a **machine first-pass and
MUST be reviewed by a native speaker before any pilot.**

Scope: VMCC operator screens (operator-facing chrome). Data values
(farmer/village names, numbers, ₹ amounts, dates) are never translated; technical
acronyms (FAT, SNF, CLR, IFSC, UPI, GPS, KYC, BMC) and unit symbols (L, %, ₹, kg)
are intentionally left in Latin.

423 translatable keys, all with kn + ta values. Review each group, then tick.

| Key group (prefix) | Screens | kn reviewed | ta reviewed |
|--------------------|---------|:-----------:|:-----------:|
| nav*               | shell bottom-nav | ☐ | ☐ |
| common*, milkType*, shift* | shared vocabulary | ☐ | ☐ |
| collect*           | record_collection (milk entry) | ☐ | ☐ |
| home*              | vmcc_home | ☐ | ☐ |
| dispatch*          | vmcc_dispatch_tab | ☐ | ☐ |
| payments*          | vmcc_payments_tab | ☐ | ☐ |
| farmers*           | vmcc_farmers_tab | ☐ | ☐ |
| history*           | vmcc_collection_history | ☐ | ☐ |
| pourDetail*        | pour_detail_sheet | ☐ | ☐ |
| profile*           | profile_tab | ☐ | ☐ |
| farmerDetail*, farmerPours*, farmerPayments* | farmer_detail + tabs | ☐ | ☐ |
| addFarmer*, herd*  | add_farmer screens | ☐ | ☐ |
| reports*, qcReport* | vmcc_qc_report (Reports) | ☐ | ☐ |
| cycle*             | cycle_detail_screen | ☐ | ☐ |
| farmerHistory*     | vmcc_farmer_history | ☐ | ☐ |
| ledger*, statement*, picker* | ledger / statement / farmer picker | ☐ | ☐ |
| farmerHome*        | farmer_home (greeting, hero, nudge, streak, quick links) | ☐ | ☐ |
| farmerCollections* | farmer_collections_tab + farmer_collection_detail | ☐ | ☐ |
| farmerPayments*    | farmer_payments_tab (net payable, breakdown, history) | ☐ | ☐ |
| farmerRate*        | farmer_rate_chart (matrix, coaching, flat rate, rules) | ☐ | ☐ |
| farmerRewards*     | farmer_rewards (streak, badges, referral) | ☐ | ☐ |
| farmerServices*    | farmer_services_stub (service cards, notify CTA) | ☐ | ☐ |
| navCollections, navServices | farmer_shell bottom-nav tabs | ☐ | ☐ |

Note: Hindi/Telugu/etc. appear in the language picker but have no .arb yet — they
fall back to English until translated (no crash; see main.dart supportedLocales).
