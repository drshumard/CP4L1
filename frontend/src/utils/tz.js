// Safe wrappers around Intl timezone formatting. Stored appointment timezones come from
// user input and external systems (Practice Better, GHL, admin edits) and can be invalid —
// and an invalid `timeZone` makes toLocaleString THROW (RangeError), which used to unmount
// the whole app to a blank white page. Never format with an unvalidated zone.

export function safeTimezone(tz) {
  if (!tz || typeof tz !== 'string') return null;
  try {
    // Throws RangeError on anything Intl doesn't recognize.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export function formatInTz(date, tz, opts) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const zone = safeTimezone(tz);
  try {
    return date.toLocaleString('en-US', zone ? { ...opts, timeZone: zone } : opts);
  } catch {
    return date.toLocaleString('en-US', opts);
  }
}
