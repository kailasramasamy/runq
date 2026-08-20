import { describe, it, expect } from 'vitest';
import { bandLevel, gradeFromBands, type MetricBands } from './quality-band.service';

// Cow-family effective bands (mirrors the seed): FAT 4.0/3.5, SNF 8.0/7.5.
const COW: MetricBands = {
  fat: { goodMin: 4.0, watchMin: 3.5 },
  snf: { goodMin: 8.0, watchMin: 7.5 },
  clr: { goodMin: 27, watchMin: 26 },
};
// Buffalo runs far richer — proves grading is milk-type aware, not global.
const BUFFALO: MetricBands = {
  fat: { goodMin: 6.0, watchMin: 5.5 },
  snf: { goodMin: 9.0, watchMin: 8.5 },
};

describe('bandLevel', () => {
  const b = { goodMin: 4.0, watchMin: 3.5 };
  it('is good at and above goodMin', () => {
    expect(bandLevel(4.0, b)).toBe('good');
    expect(bandLevel(5.2, b)).toBe('good');
  });
  it('is watch between watchMin (inclusive) and goodMin', () => {
    expect(bandLevel(3.5, b)).toBe('watch');
    expect(bandLevel(3.9, b)).toBe('watch');
  });
  it('is low below watchMin', () => {
    expect(bandLevel(3.49, b)).toBe('low');
    expect(bandLevel(0, b)).toBe('low');
  });
});

describe('gradeFromBands — analyzer (fat/snf)', () => {
  it('grades A only when both metrics are good', () => {
    expect(gradeFromBands(COW, { fat: 4.2, snf: 8.6 })).toBe('a');
  });
  it('takes the worse of fat/snf (watered milk: good fat, low snf → C)', () => {
    expect(gradeFromBands(COW, { fat: 4.5, snf: 7.2 })).toBe('c');
  });
  it('grades B when the worse metric is only watch', () => {
    expect(gradeFromBands(COW, { fat: 3.7, snf: 8.6 })).toBe('b');
  });
  it('is milk-type aware: buffalo fat 5.6 is watch, not good', () => {
    expect(gradeFromBands(BUFFALO, { fat: 5.6, snf: 9.1 })).toBe('b');
    // the SAME reading on cow bands would be A (fat ≥ 4.0)
    expect(gradeFromBands(COW, { fat: 5.6, snf: 9.1 })).toBe('a');
  });
});

describe('gradeFromBands — lactometer (clr)', () => {
  it('now grades CLR pours instead of leaving them ungraded', () => {
    expect(gradeFromBands(COW, { clr: 27.5 })).toBe('a');
    expect(gradeFromBands(COW, { clr: 26.2 })).toBe('b');
    expect(gradeFromBands(COW, { clr: 25 })).toBe('c');
  });
  it('prefers CLR over fat/snf when CLR is supplied', () => {
    expect(gradeFromBands(COW, { clr: 25, fat: 4.5, snf: 8.9 })).toBe('c');
  });
});

describe('gradeFromBands — no applicable band', () => {
  it('returns null when no reading has a band', () => {
    expect(gradeFromBands({}, { fat: 4.2, snf: 8.6 })).toBeNull();
    expect(gradeFromBands(COW, {})).toBeNull();
    expect(gradeFromBands(COW, { fat: null, snf: null, clr: null })).toBeNull();
  });
  it('grades on the one metric that has a band', () => {
    expect(gradeFromBands({ fat: { goodMin: 4, watchMin: 3.5 } }, { fat: 3.2, snf: 8 })).toBe('c');
  });
});
