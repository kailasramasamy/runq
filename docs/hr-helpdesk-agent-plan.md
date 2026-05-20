# HR Helpdesk AI Agent — Replacing the Human Operator

Plan to convert the current ticket-based HR helpdesk into a fully autonomous AI agent that handles the vast majority of employee HR queries end-to-end, leaving a human only for sensitive escalations.

---

## Current State

The HR helpdesk already has the bones for an agent — just not the runtime.

- **Schema** (`hr_tickets`, `hr_ticket_comments`): 8 categories — payroll, leave, attendance, reimbursement, asset, it, document, general. Migration `0099_helpdesk_agent.sql` already added `is_agent_draft`, `agent_confidence`, `agent_citations`, `agent_metadata` columns on comments.
- **Settings UI** (`/hr/helpdesk`): per-category tier picker (0 = off, 1 = draft, 2 = auto-send), operator-user picker, FAQ blob — stored in `tenants.settings.agentSupport`. Already shipped, just not wired to a runtime.
- **Support agent template** (`apps/api/src/modules/support/`): Haiku 4.5 + tool loop + RAG + streaming + escalation + per-conversation WebSocket. Exactly the pattern to clone for HR.
- **Gap**: no worker reads new tickets, no HR-specific tools, settings UI doesn't drive behaviour.

---

## Phased Path

### Phase 1 — Reactive draft replies (1 week)

Goal: HR reviews 100%, agent does the typing.

- Background worker subscribes to `hr_tickets` inserts → calls agent → writes `hr_ticket_comments` row with `is_agent_draft = true`.
- Read-only tools (all scoped by `tenantId` + `employeeId`):
  - `get_employee_self` (profile, manager, department, designation, doj)
  - `get_leave_balance` (per leave type, current cycle)
  - `list_leave_requests` (status, dates, approver)
  - `get_payslip` (latest / by month)
  - `get_attendance_summary` (current month — present/absent/late/OT)
  - `list_expense_claims` (status, amounts)
  - `get_holidays` (upcoming, by location)
  - `search_policy` (RAG over FAQ blob + uploaded HR policy PDFs)
  - `escalate_to_human` (low confidence, sensitive category, policy gap)
- UI: draft card above HR composer with **Send / Edit / Discard**. The `isAgentDraft` flag is already in the schema — just wire the renderer.
- Hard skip: `general` category stays manual until a corpus exists.

### Phase 2 — Auto-send for low-risk categories (1 week)

Goal: 60–70% of tickets resolved without HR touching them.

- For categories at tier 2 + confidence ≥ 0.85 + no policy gap → post comment as agent (not draft) and auto-resolve the ticket.
- Hard guardrails — never auto-resolve if grievance keywords detected, amount mentioned > ₹10K, legal terms, or manager-escalation requested.
- Per-category resolution rate visible to HR on settings page.

### Phase 3 — Conversational entry (1 week)

Goal: kill the ticket form; employees just chat.

- Helpdesk lands on chat-first UX (mobile + web). New chat → agent answers in-line. A ticket is only created if the agent escalates or 24h passes without resolution.
- Reuse the `support_conversations` pattern, namespaced under `hr_helpdesk_conversations`.
- Streaming SSE responses, same as the support agent.

### Phase 4 — Write actions with confirmation (2 weeks)

Goal: agent *does* the thing, not just explains it. Each write tool requires explicit yes/no from the employee in chat.

- `submit_leave_request` — validates balance + leave policy, routes to manager
- `submit_regularization` — reason + clock-in correction
- `file_expense_claim` — camera upload triggers the existing bill-intake flow
- `update_tax_declaration` — Section 80C/80D etc., editable till declaration cutoff
- `request_document` — Form 16, salary cert, experience letter; queues into a docs job
- `update_personal_info` — address, emergency contact (owner config gates this)

**Pattern:** tool returns a *preview*; agent shows "I'll do X — confirm?"; confirmation flips it to commit. Full audit log via `hr_agent_actions` (clone of `support_agent_actions`).

### Phase 4.5 — Auto-generated letter requests (1 week)

Goal: employee asks "I need a salary certificate for my home loan" → PDF lands in their inbox in under 30 seconds, no HR touch.

**Why this is a sweet spot:** the `letter_templates` + `employee_letters` schema already supports Handlebars tokens (`{{employee.firstName}}`, `{{salary.ctcAnnual}}`, `{{date.today}}`), draft → issued → revoked lifecycle, frozen `renderedBody` snapshot, and `pdfUrl`. The agent just needs to pick the right template, fill tokens from existing tools, render, and issue.

**Supported kinds out of the box** (already in `letterKindEnum`):
- `experience` — for employees post-relieving
- `salary_certificate` — for loans / visas
- `address_proof` — for KYC / rentals
- `appointment` / `confirmation` / `increment` — internal milestones
- `relieving` — exit

**New tools (Phase 4 family):**
- `list_letter_templates` — returns available kinds for the tenant + which need approval
- `preview_letter` — picks template by kind, fills tokens from `get_employee_self` + payroll data, returns rendered body for in-chat preview
- `issue_letter` — commits the draft to `employee_letters` with `status = 'issued'`, generates PDF via existing renderer, emails to employee, stores `pdfUrl`

**Autonomy tiers per kind** (extend `agentSupport.perLetterKind` config):

| Letter kind | Default tier | Why |
|---|---|---|
| `salary_certificate` | Auto-issue | Pure data lookup, no judgement |
| `address_proof` | Auto-issue | Pure data lookup |
| `experience` | Auto-issue (only if `status = relieved` + FnF done) | Otherwise draft for HR |
| `appointment` / `confirmation` / `increment` | Draft only | HR-initiated, not employee-requested |
| `relieving` | Draft only | Tied to exit workflow |
| `other` | Draft only | Unknown intent |

**Guardrails:**
- Rate limit: max 3 auto-issued letters per employee per 30 days (prevents abuse).
- Salary fields only filled if employee role can see own salary (controlled by `payslipVisibility` setting).
- `requestedReason` populated from the chat — auditable.
- Every auto-issue creates a row in `hr_agent_actions` and pings the configured HR operator (silent notification, no approval needed).
- One-click revoke from HR dashboard sets `status = 'revoked'` and emails the employee.

**Template gap handling:** if no template exists for the requested kind, agent falls back to draft mode and pings HR to create the template. The tenant settings page should surface "0 of 4 recommended templates configured" so owners notice during onboarding.

**UX in chat:**
```
Employee: I need a salary certificate for my bank
Agent:    I'll generate a salary certificate showing your current CTC of
          ₹8,40,000 and joining date 12 Mar 2024, addressed to "To Whom
          It May Concern". Confirm?
Employee: yes
Agent:    Done — sent to priya@acme.com. Reference: LTR-000142. [PDF]
```

### Phase 5 — Multi-channel + multi-lingual (1 week)

- **WhatsApp** via existing Gupshup integration — same agent, same tools, different transport.
- **Hindi / Tamil / Telugu / Marathi** system prompt variants. Factory workers don't type English well.
- **Voice notes** → Whisper → agent (mobile only).

### Phase 6 — Learning + replace the human (ongoing)

- HR edits to agent drafts feed a per-tenant correction log → few-shot examples in the next prompt.
- Weekly insights to HR: "32% of tickets this week were leave-balance — add it to dashboard widget?"
- Once auto-resolve rate > 90% sustained over 30 days **and** CSAT ≥ 4.5 → settings page nudges owner to disable the human operator entirely.
- Human escalation queue (`waiting_human` status) is the only inbox HR sees — typically grievances, salary revisions, exits.

---

## What NOT to Automate

The agent must refuse and route to a human for:

- Grievances / harassment / POSH complaints
- Performance review disputes
- Resignation, exit, FnF
- Salary revision requests
- Anything with legal exposure

The system prompt should *refuse* these and route with a soft handoff message.

---

## Cost & Guardrails

- **Cost:** Haiku 4.5 + prompt caching → ~₹15–25/tenant/month at 50 tickets/month. Negligible.
- **Rate limit:** 50 turns/employee/day per tenant to prevent runaway loops.
- **Tenant isolation:** every tool read scoped by `tenantId` + `employeeId`. Employees see only their own data unless `role = hr`.
- **Audit trail:** `hr_agent_actions` logs every write call — input, output, confidence, citations.
- **Kill switch:** `tenants.settings.agentSupport.enabled = false` halts the worker; HR returns to fully manual.

---

## Categories — What's Automatable

| Category | Phase 1 (draft) | Phase 2 (auto) | Phase 4 (write) |
|---|---|---|---|
| Leave | Yes | Yes (balance, status) | submit_leave_request |
| Attendance | Yes | Yes (summary, late count) | submit_regularization |
| Payroll | Yes | Yes (payslip lookup) | — (read-only) |
| Reimbursement | Yes | Yes (claim status) | file_expense_claim |
| Document | Yes | Yes (salary cert, address proof) | issue_letter (Phase 4.5) |
| IT / Asset | Yes | No (needs procurement) | — |
| General | Manual until corpus | — | — |
| Grievance | Never | Never | Never |

---

## Success Metrics

- **Auto-resolve rate** — % of tickets closed by agent without HR touching them. Target 70% by end of Phase 2, 90% by end of Phase 6.
- **First-response time** — median seconds from ticket creation to agent reply. Target < 10s.
- **CSAT** — thumbs-up/down on agent reply. Target ≥ 4.5/5.
- **Escalation precision** — of tickets agent escalated, % that actually needed a human. Target ≥ 80% (low false-escalations).
- **HR time saved** — hours/week HR spends on helpdesk before vs. after. Reported on settings page.

---

## Competitive Differentiator

No Indian HR/payroll SaaS (Keka, GreytHR, Zoho People, Darwinbox) ships a fully autonomous helpdesk agent. Most still route tickets to a human HR queue. This positions runq's HR module as the first **self-service HR for Indian SMEs** — no HR team needed for routine queries, owner gets weekly insights instead of inbox noise.
