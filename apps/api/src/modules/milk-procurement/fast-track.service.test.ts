import { describe, it, expect } from 'vitest';
import type { MpNodeRow } from '@runq/db';
import { resolveChains, cycleMismatch } from './fast-track.service';

/** Minimal node row — only the columns the chain rules read. */
function node(over: Partial<MpNodeRow> & Pick<MpNodeRow, 'id' | 'nodeType'>): MpNodeRow {
  return {
    name: over.id, code: over.id, parentNodeId: null,
    singleSiteChain: false, dispatchMode: 'per_shift',
    ...over,
  } as MpNodeRow;
}

const plant = (over: Partial<MpNodeRow> = {}) =>
  node({ id: 'pp', nodeType: 'pp', singleSiteChain: true, ...over });
const cc = (over: Partial<MpNodeRow> = {}) =>
  node({ id: 'cc', nodeType: 'cc', parentNodeId: 'pp', ...over });
const vmcc = (over: Partial<MpNodeRow> = {}) =>
  node({ id: 'vmcc', nodeType: 'vmcc', parentNodeId: 'cc', ...over });

describe('resolveChains', () => {
  it('resolves a VMCC → CC → flagged plant chain', () => {
    const chains = resolveChains([vmcc(), cc(), plant()]);
    expect(chains).toHaveLength(1);
    expect(chains[0]!.vmcc.id).toBe('vmcc');
    expect(chains[0]!.cc.id).toBe('cc');
    expect(chains[0]!.pp.id).toBe('pp');
  });

  it('excludes the chain when the plant is not flagged single-site', () => {
    expect(resolveChains([vmcc(), cc(), plant({ singleSiteChain: false })])).toEqual([]);
  });

  it('excludes a VMCC whose CC is outside the caller\'s scope', () => {
    // The CC is simply absent from the node set the caller may operate.
    expect(resolveChains([vmcc(), plant()])).toEqual([]);
  });

  it('excludes a VMCC whose plant is outside the caller\'s scope', () => {
    expect(resolveChains([vmcc(), cc()])).toEqual([]);
  });

  it('excludes an orphan VMCC with no parent CC', () => {
    expect(resolveChains([vmcc({ parentNodeId: null }), cc(), plant()])).toEqual([]);
  });

  it('ignores a VMCC parented straight to the plant — no CC leg to run', () => {
    expect(resolveChains([vmcc({ parentNodeId: 'pp' }), plant()])).toEqual([]);
  });

  it('narrows to the named VMCCs when asked', () => {
    const nodes = [
      vmcc({ id: 'v1', name: 'Alpha' }), vmcc({ id: 'v2', name: 'Bravo' }), cc(), plant(),
    ];
    expect(resolveChains(nodes).map((c) => c.vmcc.id)).toEqual(['v1', 'v2']);
    expect(resolveChains(nodes, ['v2']).map((c) => c.vmcc.id)).toEqual(['v2']);
  });

  it('orders by VMCC name so the preview and the run agree', () => {
    const nodes = [
      vmcc({ id: 'v1', name: 'Zulu' }), vmcc({ id: 'v2', name: 'Alpha' }), cc(), plant(),
    ];
    expect(resolveChains(nodes).map((c) => c.vmcc.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('handles several CCs under one flagged plant', () => {
    const nodes = [
      vmcc({ id: 'v1', name: 'Alpha', parentNodeId: 'cc1' }),
      vmcc({ id: 'v2', name: 'Bravo', parentNodeId: 'cc2' }),
      cc({ id: 'cc1' }), cc({ id: 'cc2' }), plant(),
    ];
    expect(resolveChains(nodes).map((c) => `${c.vmcc.id}/${c.cc.id}`)).toEqual(['v1/cc1', 'v2/cc2']);
  });
});

describe('cycleMismatch', () => {
  it('passes when both sides close per shift', () => {
    expect(cycleMismatch(vmcc(), cc())).toBeNull();
  });

  it('passes when both sides pool, even on different pooled modes', () => {
    // Both send one untagged tanker, so the receipt lands in the pool either way.
    expect(cycleMismatch(vmcc({ dispatchMode: 'day' }), cc({ dispatchMode: 'overnight' }))).toBeNull();
  });

  it('rejects a pooled VMCC feeding a per-shift CC', () => {
    // The untagged receipt would silently file under the CC's AM slot.
    expect(cycleMismatch(vmcc({ dispatchMode: 'day' }), cc())).toBeTruthy();
  });

  it('rejects a per-shift VMCC feeding a pooled CC', () => {
    expect(cycleMismatch(vmcc(), cc({ dispatchMode: 'overnight' }))).toBeTruthy();
  });
});
