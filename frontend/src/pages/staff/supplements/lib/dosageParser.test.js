import { buildDosageText, getDoseSchedule, normalizeDosageEntry, parseDosage, updateDosageEntry } from './dosageParser';
import { recalculatePlanCosts } from './utils';

const split = [{ time: 'AM', quantity: 1 }, { time: 'PM', quantity: 2 }];

test('preserves each quantity in named and dashed schedules', () => {
  expect(parseDosage('1 capsule AM / 2 capsules PM')).toEqual({ qty: null, freq: 2, dose_schedule: split });
  expect(parseDosage('1-2-3').dose_schedule).toEqual([
    { time: 'AM', quantity: 1 }, { time: 'Afternoon', quantity: 2 }, { time: 'PM', quantity: 3 },
  ]);
  expect(parseDosage('0.5 ml AM / 1.5 ml PM').dose_schedule.map(dose => dose.quantity)).toEqual([0.5, 1.5]);
  expect(parseDosage('2 packets AM / 2 packets PM').qty).toBe(2);
});

test.each(['1 cap AM / 2 caps bedtime', '1 cap per day then 2 after a week', '1-2-3-4', '1 cap AM / 2 caps AM', '0 cap AM / 2 caps PM', '1-2 caps per day'])(
  'does not guess unsupported or ambiguous dosage: %s', text => expect(parseDosage(text)).toBeNull(),
);

test.each([
  ['2 caps 3x/day', 2, 3], ['2 pumps, 2x per day', 2, 2], ['1 cap per day', 1, 1],
  ['1 before each meal', 1, 3], ['2 caps', 2, 1], ['1', 1, 1],
])('retains uniform dosage interpretation for %s', (text, qty, freq) => {
  expect(parseDosage(text)).toMatchObject({ qty, freq });
});

test('normalizes legacy split text and keeps explicitly chosen uniform timing', () => {
  const legacy = { quantity_per_dose: 1, frequency_per_day: 2, dosage_display: '1 cap AM / 2 caps PM' };
  expect(normalizeDosageEntry(legacy)).toMatchObject({ quantity_per_dose: null, dose_schedule: split, times: ['AM', 'PM'] });
  const uniform = { quantity_per_dose: 2, frequency_per_day: 1, times: ['PM'], dosage_display: '2 caps per day' };
  expect(normalizeDosageEntry(uniform)).toEqual(uniform);
  expect(getDoseSchedule(uniform)).toEqual([{ time: 'PM', quantity: 2 }]);
});

test('quantity edits and time edits cannot retain a contradictory stale schedule', () => {
  const entry = normalizeDosageEntry({ dosage_display: '1 cap AM / 2 caps PM' });
  const uniform = updateDosageEntry(entry, 'quantity_per_dose', 3);
  expect(uniform.dose_schedule).toBeNull();
  expect(getDoseSchedule(uniform).map(d => d.quantity)).toEqual([3, 3]);
  const changed = updateDosageEntry(entry, 'dose_schedule', [{ time: 'AM', quantity: 1 }, { time: 'PM', quantity: 4 }]);
  expect(changed.dosage_display).toBe('1 cap AM / 4 caps PM');
  expect(changed.quantity_per_dose).toBeNull();
  expect(updateDosageEntry(changed, 'times', ['PM']).dose_schedule).toEqual([{ time: 'PM', quantity: 4 }]);
});

test('unsupported edits are flagged and a valid correction clears the error', () => {
  const bad = updateDosageEntry({ quantity_per_dose: 1, frequency_per_day: 2 }, 'dosage_display', '1 AM, maybe 2 PM');
  expect(bad.dosage_error).toBeTruthy();
  expect(updateDosageEntry(bad, 'dosage_display', '1 AM / 2 PM').dosage_error).toBeUndefined();
  expect(updateDosageEntry(bad, 'quantity_per_dose', 0).dosage_error).toBeTruthy();
});

test('costs sum split doses and carry surplus across months', () => {
  const supp = { supplement_id: 'test', dosage_display: '1 cap AM / 2 caps PM', quantity_per_dose: 1, frequency_per_day: 2, units_per_bottle: 60, cost_per_bottle: 10 };
  const result = recalculatePlanCosts([1, 2].map(month_number => ({ month_number, supplements: [{ ...supp }] })));
  expect(result.months.map(month => month.supplements[0].bottles_needed)).toEqual([2, 1]);
  expect(result.total_program_cost).toBe(30);
  expect(buildDosageText(null, 2, 'caps', split)).toBe('1 cap AM / 2 caps PM');
});
