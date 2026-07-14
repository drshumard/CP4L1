// Canonical admin date/time formatting.
// One format across every admin table/modal so columns align (pair with `cad-mono`).
// Fixed clinic timezone keeps an internal ops tool unambiguous about "when".

const DEFAULT_TZ = 'America/Los_Angeles';

/** "Jun 20, 2026, 01:07 PM" — 2-digit day/hour/minute for consistent width. */
export function fmtDateTime(value, { tz = DEFAULT_TZ } = {}) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    timeZone: tz,
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** "1:00 PM" — clinic-tz time only, for slot chips. */
export function fmtTime(value, { tz = DEFAULT_TZ } = {}) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** "Jun 20, 2026" — date only, same width convention. */
export function fmtDate(value, { tz = DEFAULT_TZ } = {}) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    timeZone: tz,
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}
