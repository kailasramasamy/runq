/**
 * Which business day a manufacturing timestamp belongs to.
 *
 * runq's plants are Indian, so a run belongs to the IST day it happened on.
 * Bucketing with a bare `::date` inherits the DB session timezone, which is
 * Asia/Kolkata locally but UTC on Railway — there, everything a night shift
 * finished between 00:00 and 05:30 IST would be filed under the previous day
 * and vanish from "today". Pinned explicitly so the answer is the same
 * wherever the query runs.
 */

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export const IST = 'Asia/Kolkata';

/** A `timestamptz` column as its IST calendar date. */
export function istDate(column: SQL | unknown): SQL {
  return sql`(${column} AT TIME ZONE ${IST})::date`;
}

/** Today's date in IST — the equivalent of CURRENT_DATE for a plant. */
export function istToday(): SQL {
  return sql`(now() AT TIME ZONE ${IST})::date`;
}
