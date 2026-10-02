import { formatPlanDuration } from './utils';

test('two-week protocols do not display as one month', () => {
  expect(formatPlanDuration([{ month_number: 0.5 }])).toBe('2 weeks');
});

test('extensions show their actual duration, rather than the phase count', () => {
  expect(formatPlanDuration([{ month_number: 1 }, { month_number: 1.5 }])).toBe('1 month + 2 weeks');
  expect(formatPlanDuration([{ month_number: 1 }, { month_number: 2 }])).toBe('2 months');
});
