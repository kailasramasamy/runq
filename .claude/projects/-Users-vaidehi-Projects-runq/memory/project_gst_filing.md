---
name: GST Filing Module — GSP Setup
description: Masters India GSP API access for GST filing (GSTR-1, 3B, 2B) — credentials, plan details, decisions made
type: project
---

GST filing module being built into runq as a product feature (not just internal use).

**GSP Provider:** Masters India (MasterGST) — registered as ASP/Developer
**Plan:** GST API only (no e-Invoice, no e-Way Bill for now), Rs 25,000/year, 2.5 lakh API calls
**Capacity:** ~700 tenants filing monthly at ~20-30 calls/GSTIN/month
**Sandbox OTP:** 575757, tokens expire after 6 hours
**Base URL:** https://api.mastergst.com

**Why:** Company accountant flagged monthly CA fee (Rs 2,500/mo) for GST filing. As a product feature, the API cost (Rs 3/tenant/month) is negligible and makes runq stickier for SME customers.

**Decisions made:**
- Skipped e-Invoice API — only needed for turnover > Rs 5 crore, add later
- Skipped e-Way Bill API — not relevant for finance-accounting module
- Selected "All GST APIs" tier (not just public/read-only)

**How to apply:** All GST filing implementation should use Masters India GSP APIs. Plan and tracker at `docs/gst-filing-plan.md` and `docs/gst-filing-tracker.md`.
