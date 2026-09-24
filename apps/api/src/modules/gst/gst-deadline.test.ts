import { describe, it, expect } from 'vitest';
import { selectDeadlineAlert, type GstReturnRow } from './gst-deadline.service';
import type { TenantSettings } from '@runq/types';

// Sep 2026: the period being filed is Aug 2026 (GSTR-1 due 11 Sep, 3B 20 Sep).
const PERIOD = '082026';
const SEP_24 = new Date(2026, 8, 24);
const settings = { gstin: '29AALFV5152D1ZZ' } as TenantSettings;

function row(returnType: string, period: string, status: string): GstReturnRow {
  return { id: `${returnType}-${period}`, returnType, period, status };
}

describe('selectDeadlineAlert', () => {
  it('stays silent once both returns for the period are filed', () => {
    // Vrindavan on 24 Sep 2026: GSTR-1 filed 13 Sep, 3B filed 19 Sep. Filed
    // rows are excluded from the candidate list but must still mark the
    // return as existing — otherwise the synthesised `pending` branch
    // resurrects it as 13 days overdue.
    const rows = [
      row('gstr1', PERIOD, 'filed'),
      row('gstr3b', PERIOD, 'filed'),
      row('gstr1', '072026', 'filed'),
      row('gstr3b', '072026', 'filed'),
    ];
    expect(selectDeadlineAlert(rows, PERIOD, settings, SEP_24)).toBeNull();
  });

  it('still alerts on the return that is NOT filed', () => {
    const rows = [row('gstr1', PERIOD, 'filed'), row('gstr3b', PERIOD, 'draft')];
    const alert = selectDeadlineAlert(rows, PERIOD, settings, SEP_24);
    expect(alert?.returnType).toBe('gstr3b');
    expect(alert?.daysLeft).toBe(-4);
  });

  it('synthesises a pending candidate when no row exists at all', () => {
    // Draft generation failed on the 1st — the deadline is still real.
    const alert = selectDeadlineAlert([], PERIOD, settings, SEP_24);
    expect(alert?.returnType).toBe('gstr1');
    expect(alert?.status).toBe('pending');
    expect(alert?.returnId).toBeNull();
    expect(alert?.daysLeft).toBe(-13);
  });

  it('ranks an older overdue return above a nearer deadline', () => {
    const rows = [row('gstr1', '072026', 'draft'), row('gstr3b', PERIOD, 'draft')];
    const alert = selectDeadlineAlert(rows, PERIOD, settings, SEP_24);
    expect(alert?.period).toBe('072026');
    expect(alert?.daysLeft).toBe(-44);
  });

  it('ignores periods the tenant filed before runQ took over', () => {
    const withStart = { ...settings, gstFilingStartPeriod: '082026' } as TenantSettings;
    const rows = [row('gstr1', '072026', 'draft'), row('gstr1', PERIOD, 'filed'), row('gstr3b', PERIOD, 'filed')];
    expect(selectDeadlineAlert(rows, PERIOD, withStart, SEP_24)).toBeNull();
  });

  it('says nothing while the deadline is still more than five days out', () => {
    const sep_4 = new Date(2026, 8, 4); // GSTR-1 due 11 Sep → 7 days out
    const rows = [row('gstr1', PERIOD, 'draft'), row('gstr3b', PERIOD, 'draft')];
    expect(selectDeadlineAlert(rows, PERIOD, settings, sep_4)).toBeNull();
  });
});
