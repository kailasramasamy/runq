import { describe, expect, it } from 'vitest';
import { matchLines } from './invoice.service';

type Row = { id: string; itemId: string | null; description: string };
const rows = (...r: Row[]) => new Map(r.map((x) => [x.id, x]));

describe('matchLines', () => {
  it('binds by id when the client sends one', () => {
    const m = rows({ id: 'a', itemId: 'i1', description: 'Milk' });
    expect(matchLines([{ id: 'a', itemId: 'i1', description: 'Milk' }], m)).toEqual(['a']);
  });

  it('treats an id for a vanished row as a new line, not someone else’s row', () => {
    const m = rows({ id: 'a', itemId: 'i1', description: 'Milk' });
    expect(matchLines([{ id: 'gone', itemId: 'i1', description: 'Milk' }], m)).toEqual([null]);
    expect(m.has('a')).toBe(true);
  });

  it('falls back to the catalogue item', () => {
    const m = rows({ id: 'a', itemId: 'i1', description: 'renamed' });
    expect(matchLines([{ itemId: 'i1', description: 'Milk' }], m)).toEqual(['a']);
  });

  it('matches on wording when the client dropped itemId (mobile amend)', () => {
    const m = rows({ id: 'a', itemId: 'i1', description: 'Milk' });
    expect(matchLines([{ description: 'Milk' }], m)).toEqual(['a']);
  });

  it('does not let a wording match steal a row an id match needed', () => {
    const m = rows(
      { id: 'a', itemId: null, description: 'Milk' },
      { id: 'b', itemId: null, description: 'Milk' },
    );
    // The second input names row 'a' explicitly; the first must take 'b'.
    const out = matchLines([{ description: 'Milk' }, { id: 'a', description: 'Milk' }], m);
    expect(out).toEqual(['b', 'a']);
  });

  it('claims each row once, leaving genuinely new lines unmatched', () => {
    const m = rows({ id: 'a', itemId: 'i1', description: 'Milk' });
    expect(matchLines(
      [{ itemId: 'i1', description: 'Milk' }, { itemId: 'i1', description: 'Milk' }], m,
    )).toEqual(['a', null]);
  });

  it('reports rows nobody claimed, which is what gets deleted', () => {
    const m = rows(
      { id: 'a', itemId: 'i1', description: 'Milk' },
      { id: 'b', itemId: 'i2', description: 'Ghee' },
    );
    matchLines([{ itemId: 'i1', description: 'Milk' }], m);
    expect([...m.keys()]).toEqual(['b']);
  });
});
