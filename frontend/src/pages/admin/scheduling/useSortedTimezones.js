import { useMemo } from 'react';

// Timezone options for the scheduling/booking selects — built from native Intl, NOT
// react-timezone-select. That library (via `spacetime`) calls Intl.DateTimeFormat with the
// system timezone AT IMPORT, and in some browsers / privacy extensions that resolve the
// system timezone to `null` it throws "Invalid time zone specified: null" and white-screens
// the whole app. Everything below passes EXPLICIT zones to Intl and is fully guarded, so a
// broken/spoofed system timezone can never take the app down.

// Used only if Intl.supportedValuesOf is unavailable (older engines).
const FALLBACK_ZONES = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Phoenix',
  'America/Denver', 'America/Chicago', 'America/New_York', 'America/Toronto',
  'America/Halifax', 'America/Mexico_City', 'America/Bogota', 'America/Lima',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Santiago',
  'UTC', 'Europe/London', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Athens', 'Africa/Lagos',
  'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata',
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland',
];

function listZones() {
  try {
    const supported = Intl.supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length) return supported;
  } catch { /* fall through to fallback */ }
  return FALLBACK_ZONES;
}

// Current UTC offset (minutes) for a zone via an explicit-zone Intl call (DST-correct).
function offsetMinutes(zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(new Date());
    const name = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
  } catch {
    return 0;
  }
}

function buildLabel(zone, offMin) {
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const place = zone.split('/').slice(1).join(' / ').replace(/_/g, ' ') || zone;
  return `(GMT${sign}${hh}:${mm}) ${place}`;
}

// Shared timezone options, deduped by IANA value and sorted ascending by GMT offset.
export default function useSortedTimezones() {
  return useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const zone of listZones()) {
      if (!zone || seen.has(zone)) continue;
      seen.add(zone);
      const offset = offsetMinutes(zone);
      list.push({ value: zone, label: buildLabel(zone, offset), offset });
    }
    list.sort((a, b) => a.offset - b.offset);
    return list;
  }, []);
}

// Convert a wall-clock date + time in an IANA timezone to a UTC ISO string (DST-aware).
export function zonedWallTimeToUtcIso(dateStr, timeStr, timeZone) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
  const wallUtcMs = Date.UTC(y, (m || 1) - 1, d, hh || 0, mm || 0);
  const offsetAt = (instant) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = {};
    for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - instant.getTime(); // ms the zone is ahead of UTC at that instant
  };
  let utcMs = wallUtcMs - offsetAt(new Date(wallUtcMs));
  utcMs = wallUtcMs - offsetAt(new Date(utcMs)); // refine once for the DST boundary
  return new Date(utcMs).toISOString();
}
