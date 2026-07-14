import { fmtDateTime, fmtDate } from './format';

// 2026-06-20T20:07:00Z -> America/Los_Angeles is PDT (UTC-7) -> 01:07 PM
const ISO = '2026-06-20T20:07:00Z';

describe('fmtDateTime', () => {
  test('formats an ISO string in the clinic timezone, 2-digit time', () => {
    expect(fmtDateTime(ISO)).toBe('Jun 20, 2026, 01:07 PM');
  });

  test('accepts a Date instance', () => {
    expect(fmtDateTime(new Date(ISO))).toBe('Jun 20, 2026, 01:07 PM');
  });

  test('returns an em dash for empty / invalid input', () => {
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime('')).toBe('—');
    expect(fmtDateTime('not-a-date')).toBe('—');
  });

  test('output width is consistent (same pattern) regardless of the value', () => {
    const a = fmtDateTime('2026-01-02T17:05:00Z'); // single-digit day/hour source
    const b = fmtDateTime('2026-12-31T03:59:00Z');
    const pattern = /^[A-Z][a-z]{2} \d{2}, \d{4}, \d{2}:\d{2} (AM|PM)$/;
    expect(a).toMatch(pattern);
    expect(b).toMatch(pattern);
    expect(a.length).toBe(b.length); // aligned columns
  });
});

describe('fmtDate', () => {
  test('formats date only', () => {
    expect(fmtDate(ISO)).toBe('Jun 20, 2026');
  });
  test('em dash for invalid', () => {
    expect(fmtDate(undefined)).toBe('—');
  });
});
