/** Dosage schedules are authoritative; legacy uniform qty/frequency remain readable. */
export const DOSE_TIMES = ['AM', 'Afternoon', 'PM'];
const numberPattern = '\\d+(?:\\.\\d+)?';
const unitPattern = '(?:capsules?|caps?|tablets?|tabs?|pills?|pumps?|scoops?|packets?|drops?|servings?|teaspoons?|ml|g)';
const timeNames = { am: 'AM', morning: 'AM', afternoon: 'Afternoon', aft: 'Afternoon', pm: 'PM', evening: 'PM' };

export function timesForFrequency(freq) {
  return freq === 3 ? [...DOSE_TIMES] : freq === 2 ? ['AM', 'PM'] : ['AM'];
}

function scheduleFields(schedule) {
  const doses = schedule.map(d => ({ time: d.time, quantity: Number(d.quantity) }));
  return {
    qty: doses.every(d => d.quantity === doses[0].quantity) ? doses[0].quantity : null,
    freq: doses.length,
    dose_schedule: doses,
  };
}

function validSchedule(schedule) {
  return Array.isArray(schedule) && schedule.length > 0 && schedule.length <= 3
    && new Set(schedule.map(d => d.time)).size === schedule.length
    && schedule.every(d => DOSE_TIMES.includes(d.time) && Number.isFinite(Number(d.quantity)) && Number(d.quantity) > 0);
}

/** Only parse complete, unambiguous instructions. Never accept a matched prefix. */
export function parseDosage(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim().toLowerCase();
  if (new RegExp('^' + numberPattern + '(?:\\s*-\\s*' + numberPattern + '){1,2}$').test(s)) {
    const quantities = s.split('-').map(Number);
    if (quantities.some(q => q <= 0)) return null;
    return scheduleFields(timesForFrequency(quantities.length).map((time, i) => ({ time, quantity: quantities[i] })));
  }

  const timedParts = s.split(/\s*(?:\/|&|,|\band\b)\s*/);
  const timedPattern = new RegExp('^(' + numberPattern + ')\\s*(?:' + unitPattern + '\\s*)?(am|pm|afternoon|aft|morning|evening)$');
  const matches = timedParts.map(part => part.match(timedPattern));
  if (matches.every(Boolean)) {
    const schedule = matches.map(m => ({ time: timeNames[m[2]], quantity: Number(m[1]) }));
    if (!validSchedule(schedule)) return null;
    return scheduleFields(schedule.sort((a, b) => DOSE_TIMES.indexOf(a.time) - DOSE_TIMES.indexOf(b.time)));
  }

  const full = s.match(new RegExp('^(' + numberPattern + ')\\s*(?:' + unitPattern + ')?[\\s,/]+([1-3])\\s*x\\s*(?:/|per\\s*)?\\s*day$'));
  const daily = s.match(new RegExp('^(' + numberPattern + ')\\s*(?:' + unitPattern + '\\s*)?(?:per\\s*day|daily)$'));
  const meal = s.match(new RegExp('^(' + numberPattern + ')\\s*(?:' + unitPattern + '\\s*)?(?:before|with|after)\\s*each\\s*meal$'));
  const simple = s.match(new RegExp('^(' + numberPattern + ')(?:\\s*' + unitPattern + ')?$'));
  const match = full || daily || meal || simple;
  if (!match || Number(match[1]) <= 0) return null;
  return { qty: Number(match[1]), freq: full ? Number(full[2]) : meal ? 3 : 1, dose_schedule: null };
}

export function getDoseSchedule(entry) {
  if (validSchedule(entry.dose_schedule)) return entry.dose_schedule.map(d => ({ ...d, quantity: Number(d.quantity) }));
  // Recover supported time-specific instructions from older saved plans/templates.
  const parsed = parseDosage(entry.dosage_display);
  if (parsed?.dose_schedule) return parsed.dose_schedule;
  const qty = Number(entry.quantity_per_dose);
  const freq = Number(entry.frequency_per_day || 1);
  if (!(qty > 0) || freq < 1 || freq > 3) return [];
  const times = entry.times?.length === freq ? entry.times : timesForFrequency(freq);
  return times.map(time => ({ time, quantity: qty }));
}

export function normalizeDosageEntry(entry) {
  const parsed = !entry.dose_schedule?.length && parseDosage(entry.dosage_display);
  const schedule = entry.dose_schedule?.length ? entry.dose_schedule : parsed?.dose_schedule;
  if (!validSchedule(schedule)) return { ...entry };
  const fields = scheduleFields(schedule);
  return { ...entry, dose_schedule: fields.dose_schedule, quantity_per_dose: fields.qty,
    frequency_per_day: fields.freq, times: fields.dose_schedule.map(d => d.time) };
}

export function unitLabel(qty, unit = 'caps') {
  if (qty === 1) return unit.replace(/s$/, '');
  return unit.endsWith('s') || ['ml', 'g'].includes(unit) ? unit : unit + 's';
}

export function buildDosageText(qty, freq, unitType = 'caps', schedule = null) {
  if (validSchedule(schedule)) return schedule.map(d => d.quantity + ' ' + unitLabel(d.quantity, unitType) + ' ' + d.time).join(' / ');
  if (!(qty > 0)) return '';
  return qty + ' ' + unitLabel(qty, unitType) + ' ' + (freq > 1 ? freq + 'x/day' : 'per day');
}

/** Returns an entry with dosage_error on unsupported input; callers must block saving it. */
export function updateDosageEntry(entry, field, value, unit = entry.unit_type || 'caps') {
  const next = { ...normalizeDosageEntry(entry), [field]: value };
  if (field === 'dosage_display') {
    const parsed = parseDosage(value);
    if (!parsed) return { ...next, dosage_error: 'Enter exact doses, for example 1 cap AM / 2 caps PM, or use the quantity controls.' };
    delete next.dosage_error;
    next.quantity_per_dose = parsed.qty;
    next.frequency_per_day = parsed.freq;
    next.dose_schedule = parsed.dose_schedule;
    next.times = parsed.dose_schedule?.map(d => d.time) || (entry.times?.length === parsed.freq ? entry.times : timesForFrequency(parsed.freq));
  } else if (['quantity_per_dose', 'frequency_per_day', 'times', 'dose_schedule'].includes(field)) {
    delete next.dosage_error;
    if (field === 'quantity_per_dose') {
      if (!Number.isFinite(Number(value)) || Number(value) <= 0) return { ...next, dosage_error: 'Enter a positive quantity for each dose.' };
      next.dose_schedule = null; // Explicit uniform-quantity edit replaces a split schedule.
    } else if (field === 'frequency_per_day') {
      if (value < 1 || value > 3) return { ...next, dosage_error: 'Select one to three daily time slots.' };
      const existing = getDoseSchedule(entry);
      next.times = timesForFrequency(value);
      next.dose_schedule = existing.length ? next.times.map(time => ({ time, quantity: existing.find(d => d.time === time)?.quantity || entry.quantity_per_dose || 1 })) : null;
    } else if (field === 'times') {
      const existing = getDoseSchedule(entry);
      next.dose_schedule = value.map(time => ({ time, quantity: existing.find(d => d.time === time)?.quantity || entry.quantity_per_dose || 1 }));
    }
    if (next.dose_schedule) {
      if (!validSchedule(next.dose_schedule)) return { ...next, dosage_error: 'Each selected time needs a positive quantity.' };
      Object.assign(next, normalizeDosageEntry(next));
    }
    next.dosage_display = buildDosageText(next.quantity_per_dose, next.frequency_per_day, unit, next.dose_schedule);
  }
  return next;
}
