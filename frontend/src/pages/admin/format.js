// Canonical admin date/time formatting.
// One format across every admin table/modal so columns align (pair with `cad-mono`).
// One display timezone keeps an internal ops tool unambiguous about "when": clinic
// Pacific by default, switched to the signed-in team member's profile timezone when
// AdminLayout loads it (setAdminDisplayTz). Callers can still pass an explicit tz
// (e.g. a booking's own zone).

import { safeTz, DEFAULT_US_TZ } from './usTimezones';

let displayTz = DEFAULT_US_TZ;

/** Set the admin-wide display timezone (validated; invalid/empty falls back to Pacific). */
export function setAdminDisplayTz(tz) { displayTz = safeTz(tz); }

export function getAdminDisplayTz() { return displayTz; }

// Ledger instants are UTC, but endpoints returning raw Mongo docs used to serialize them
// WITHOUT an offset ("...T23:30:00") — and new Date() parses offset-less datetimes as the
// viewer's LOCAL time, shifting every rendered value by the browser's UTC offset. The
// backend now stamps +00:00; this keeps any stragglers honest by reading a bare datetime
// string as the UTC it really is. (Date-only strings already parse as UTC per spec.)
const NAIVE_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
function parseInstant(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && NAIVE_DT.test(value)) return new Date(`${value}Z`);
  return new Date(value);
}

/** "Jun 20, 2026, 01:07 PM" — 2-digit day/hour/minute for consistent width. */
export function fmtDateTime(value, { tz = displayTz } = {}) {
  if (!value) return '—';
  const d = parseInstant(value);
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

/** "1:00 PM" — display-tz time only, for slot chips. */
export function fmtTime(value, { tz = displayTz } = {}) {
  if (!value) return '—';
  const d = parseInstant(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** "Jun 20, 2026" — date only, same width convention. */
export function fmtDate(value, { tz = displayTz } = {}) {
  if (!value) return '—';
  const d = parseInstant(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    timeZone: tz,
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}
