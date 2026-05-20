/**
 * (Deferred) HR helpdesk translator. Originally planned to translate agent /
 * HR replies into the employee's preferred language using Claude Haiku and
 * cache results in `hr_ticket_comments.translation_text`.
 *
 * Implementation paused — schema fields (`users.preferred_language`,
 * `hr_ticket_comments.translation_text`) remain in place so we can resume
 * without another migration.
 *
 * When resuming, see:
 *   - apps/api/src/modules/hr/agent/agent.ts — fire after every employee-
 *     visible insert
 *   - apps/api/src/modules/hr/phase-next/helpdesk-performance.routes.ts —
 *     fire after HR-sent comments + draft acceptance
 */
export {};
