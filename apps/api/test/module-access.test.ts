import { describe, it, expect } from 'vitest';
import { computeEffectiveModules } from '../src/plugins/tenant-context';
import type { ModuleCode } from '@runq/types';

// HR self-service is a floor, not a grant: every employee holds it whatever
// their role or per-user grant says, because they are an employee before they
// are an operator or a technician. The assertions below protect that floor and
// its two edges — the tenant ceiling still wins, and farmers (suppliers, not
// staff) never pick it up.

const ALL_ENABLED: ModuleCode[] = [
  'finance', 'hr', 'inventory', 'purchase', 'manufacturing', 'milk_procurement',
];

const effective = (
  role: string, userModules: string[] | null, enabled: ModuleCode[] = ALL_ENABLED,
) => computeEffectiveModules({
  tenantId: 't', role: role as never, userModules, enabledModules: enabled,
});

describe('module access: the HR floor', () => {
  it('gives an operator HR even when the stored grant omits it', () => {
    // The shape of every operator row written before the floor existed —
    // this is what makes the change work without a data backfill.
    const mods = effective('field_operator', ['inventory', 'manufacturing', 'milk_procurement']);
    expect(mods).toContain('hr');
    expect(mods).toContain('milk_procurement');
  });

  it('gives every employee role HR by default', () => {
    for (const role of ['viewer', 'field_operator', 'technician', 'accountant']) {
      expect(effective(role, null)).toContain('hr');
    }
  });

  it('keeps each role its own modules alongside HR', () => {
    expect(effective('accountant', null)).toEqual(['finance', 'hr']);
    expect(effective('field_operator', null)).toEqual(['hr', 'milk_procurement']);
    expect(effective('technician', null)).toEqual(['hr', 'inventory', 'manufacturing']);
  });

  it('does not widen anything but HR', () => {
    // An operator granted nothing extra still cannot reach finance/purchase.
    const mods = effective('field_operator', ['milk_procurement']);
    expect(mods).not.toContain('finance');
    expect(mods).not.toContain('purchase');
  });
});

describe('module access: the floor has limits', () => {
  it('yields to the tenant ceiling', () => {
    // A tenant that has not bought HR grants nobody HR.
    const enabled: ModuleCode[] = ['finance', 'milk_procurement'];
    expect(effective('field_operator', null, enabled)).not.toContain('hr');
    expect(effective('viewer', null, enabled)).not.toContain('hr');
  });

  it('never reaches farmers, who are suppliers rather than staff', () => {
    expect(effective('farmer', null)).toEqual(['milk_procurement']);
    // Even an explicit grant cannot hand a farmer the HR module.
    expect(effective('farmer', ['milk_procurement', 'hr'])).toEqual(['milk_procurement']);
  });

  it('leaves the owner short-circuit alone', () => {
    expect(effective('owner', null)).toEqual(ALL_ENABLED);
  });
});
