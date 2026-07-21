// Short US timezone list for ADMIN booking flows — patients are ~all US-based and admins
// look for the familiar abbreviations, not a 400-entry IANA list. Values stay IANA ids
// (the only correct thing to store and convert with). The full sorted list remains on the
// host editors and the patient-facing booking page.

export const US_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific — PST/PDT' },
  { value: 'America/Denver', label: 'Mountain — MST/MDT' },
  { value: 'America/Phoenix', label: 'Arizona — MST, no DST' },
  { value: 'America/Chicago', label: 'Central — CST/CDT' },
  { value: 'America/New_York', label: 'Eastern — EST/EDT' },
  { value: 'America/Anchorage', label: 'Alaska — AKST/AKDT' },
  { value: 'Pacific/Honolulu', label: 'Hawaii — HST' },
];

export const DEFAULT_US_TZ = 'America/Los_Angeles';

/** tz if Intl accepts it, else the fallback — guards legacy/garbage stored values. */
export function safeTz(tz, fallback = DEFAULT_US_TZ) {
  if (!tz) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return fallback;
  }
}

/** UTC instant (Date | ISO string) → { date: 'YYYY-MM-DD', time: 'HH:MM' } wall clock in tz. */
export function utcToZonedWallTime(value, tz) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = {};
  for (const p of dtf.formatToParts(d)) parts[p.type] = p.value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Short zone label for an instant in tz — "PDT", "EST", …; empty string if unknown. */
export function tzAbbrev(value, tz) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: safeTz(tz), timeZoneName: 'short' });
    return dtf.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}
