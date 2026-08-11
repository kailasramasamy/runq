import { describe, it, expect } from 'vitest';
import { appForSource } from './push.service';
import type { HrNotificationSource } from '../../modules/hr/hr-notifier';
import type { MpNotificationSource } from '../../modules/milk-procurement/mp-notifier';

/**
 * runQ mobile and Dhenu share one backend, one `users` row (whenever the
 * phone number matches), and one device_tokens table. Before app scoping,
 * approving a leave request buzzed the milk-procurement app too.
 *
 * The two audiences are mutually exclusive: Dhenu gets `mp_*` and nothing
 * else; runQ gets everything else and never `mp_*`.
 */
describe('appForSource', () => {
  const hrSources: HrNotificationSource[] = [
    'hr_leave',
    'hr_payroll',
    'hr_attendance',
    'hr_expense',
    'hr_reward',
    'hr_loan',
    'hr_tax',
    'hr_helpdesk',
    'hr_announcement',
    'hr_onboarding',
    'hr_lifecycle',
    'hr_performance',
  ];

  const mpSources: MpNotificationSource[] = [
    'mp_dispatch',
    'mp_receipt',
    'mp_transit',
  ];

  it.each(hrSources)('routes %s to runq only', (source) => {
    expect(appForSource(source)).toBe('runq');
  });

  it.each(mpSources)('routes %s to dhenu only', (source) => {
    expect(appForSource(source)).toBe('dhenu');
  });

  it('never routes an HR source to dhenu', () => {
    expect(hrSources.map(appForSource)).not.toContain('dhenu');
  });

  it('never routes a milk-procurement source to runq', () => {
    expect(mpSources.map(appForSource)).not.toContain('runq');
  });

  it('sends non-module notices (system, finance) to runq', () => {
    for (const s of ['system', 'bill', 'customer', 'gstin', 'manual']) {
      expect(appForSource(s)).toBe('runq');
    }
  });

  it('defaults to runq when the source is absent', () => {
    expect(appForSource(undefined)).toBe('runq');
    expect(appForSource('')).toBe('runq');
  });

  it('does not treat a source that merely contains mp_ as Dhenu', () => {
    // Only a genuine `mp_` *prefix* is the Dhenu namespace — a hypothetical
    // 'hr_mp_something' must not leak onto the milk app.
    expect(appForSource('hr_mp_something')).toBe('runq');
  });
});
