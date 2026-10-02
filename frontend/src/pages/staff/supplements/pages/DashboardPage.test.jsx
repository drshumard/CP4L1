import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { getPlans, getPlanCreators } from '../lib/api';

jest.mock('../auth', () => ({ useAuth: () => ({ user: { _id: 'coach-current', role: 'admin' } }) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../lib/api', () => ({ getPlans: jest.fn(), getPlanCreators: jest.fn(), deletePlan: jest.fn(), duplicatePlan: jest.fn() }));

const plan = (id, patientName = `Patient ${id}`) => ({
  _id: String(id), patient_name: patientName, program_name: 'Detox 1', status: 'draft', step_number: 1,
  months: [{ month_number: 1 }], total_program_cost: 50, updated_at: '2026-09-29T10:00:00Z',
});
const plans = Array.from({ length: 31 }, (_, index) => plan(index + 1));
const summary = status => ({ plans: status === 'draft' ? [plan('recent', 'Recent draft')] : [], total: status === 'draft' ? 9 : status === 'finalized' ? 139 : 148 });
const defer = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const registerCalls = () => getPlans.mock.calls.filter(call => call[4]?.limit === 12);
const summaryCalls = () => getPlans.mock.calls.filter(call => call[4]?.limit === 1);

let container;
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  jest.useFakeTimers();
  jest.clearAllMocks();
  getPlanCreators.mockResolvedValue({ creators: [{ user_id: 'coach-current', name: 'Current coach' }, { user_id: 'coach-other', name: 'Other coach' }] });
  getPlans.mockImplementation(async (search, program, status, owner, options) => options.limit === 1
    ? summary(status)
    : { plans: plans.slice(options.skip, options.skip + options.limit), total: plans.length });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const renderDashboard = async () => {
  await act(async () => root.render(<MemoryRouter><DashboardPage /></MemoryRouter>));
  await act(async () => jest.advanceTimersByTime(250));
};
const button = text => [...container.querySelectorAll('button')].find(node => node.textContent === text);
const click = node => act(async () => node.click());
const enterSearch = value => act(async () => {
  const field = container.querySelector('[aria-label="Search plans"]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
});
const chooseSelect = async (label, option) => {
  await act(async () => container.querySelector(`[aria-label="${label}"]`).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
  const item = [...document.querySelectorAll('[role="option"]')].find(node => node.textContent === option);
  expect(item).toBeDefined();
  await click(item);
};

test('loads paginated register rows independently from full workspace summary counts', async () => {
  await renderDashboard();

  expect(registerCalls()).toEqual([['', '', '', 'coach-current', { skip: 0, limit: 12 }]]);
  expect(summaryCalls()).toEqual([
    ['', '', '', 'coach-current', { limit: 1 }],
    ['', '', 'draft', 'coach-current', { limit: 1 }],
    ['', '', 'finalized', 'coach-current', { limit: 1 }],
  ]);
  expect([...container.querySelectorAll('[aria-label="Plan overview"] strong')].map(node => node.textContent)).toEqual(['148', '09', '139']);
  expect(container.querySelectorAll('tbody tr')).toHaveLength(12);
  expect(container.querySelector('.po-table-footer').textContent).toContain('1–12 of 31 plans');
  expect(container.querySelector('.po-continue').textContent).toContain('Recent draft');
});

test('next and previous request server pages and stop at the last partial page', async () => {
  await renderDashboard();
  expect(button('Previous').disabled).toBe(true);

  await click(button('Next'));
  expect(registerCalls().at(-1)).toEqual(['', '', '', 'coach-current', { skip: 12, limit: 12 }]);
  expect(container.querySelector('.po-table-footer').textContent).toContain('13–24 of 31 plans');

  await click(button('Next'));
  expect(registerCalls().at(-1)[4]).toEqual({ skip: 24, limit: 12 });
  expect(container.querySelectorAll('tbody tr')).toHaveLength(7);
  expect(container.querySelector('.po-table-footer').textContent).toContain('25–31 of 31 plans');
  expect(button('Next').disabled).toBe(true);

  await click(button('Previous'));
  expect(registerCalls().at(-1)[4]).toEqual({ skip: 12, limit: 12 });
  expect(container.querySelector('.po-table-footer').textContent).toContain('13–24 of 31 plans');
  expect(summaryCalls()).toHaveLength(3);
});

test('status, owner, program and debounced search are sent together and reset pagination', async () => {
  await renderDashboard();
  await click(button('Next'));
  const draftFilter = [...container.querySelectorAll('[aria-label="Filter plans by status"] button')].find(node => node.textContent.startsWith('In progress'));
  await click(draftFilter);
  expect(registerCalls().at(-1)).toEqual(['', '', 'draft', 'coach-current', { skip: 0, limit: 12 }]);

  await chooseSelect('Plan owner', 'Other coach');
  expect(registerCalls().at(-1)).toEqual(['', '', 'draft', 'coach-other', { skip: 0, limit: 12 }]);
  expect(summaryCalls().slice(-3).every(call => call[3] === 'coach-other')).toBe(true);
  await chooseSelect('Filter by program', 'Detox 2');
  await click(button('Next'));

  const callsBeforeTyping = registerCalls().length;
  await enterSearch('  Jane  ');
  await act(async () => jest.advanceTimersByTime(249));
  expect(registerCalls()).toHaveLength(callsBeforeTyping);
  await act(async () => jest.advanceTimersByTime(1));
  expect(registerCalls().at(-1)).toEqual(['Jane', 'Detox 2', 'draft', 'coach-other', { skip: 0, limit: 12 }]);
  expect(summaryCalls()).toHaveLength(6);
  expect(button('Previous').disabled).toBe(true);
});

test('a slower earlier register response cannot replace the newest search results', async () => {
  const oldRequest = defer();
  getPlans.mockImplementation((search, program, status, owner, options) => {
    if (options.limit === 1) return Promise.resolve(summary(status));
    if (!search) return oldRequest.promise;
    return Promise.resolve({ plans: [plan('new', 'Jane matching search')], total: 1 });
  });
  await renderDashboard();
  await enterSearch('Jane');
  await act(async () => jest.advanceTimersByTime(250));
  expect(container.querySelector('tbody').textContent).toContain('Jane matching search');

  await act(async () => oldRequest.resolve({ plans: [plan('old', 'Outdated result')], total: 87 }));
  expect(container.querySelector('tbody').textContent).toContain('Jane matching search');
  expect(container.querySelector('tbody').textContent).not.toContain('Outdated result');
  expect(container.querySelector('.po-table-footer').textContent).toContain('1–1 of 1 plans');
});

test('summary counts from a previously selected owner cannot overwrite the current workspace', async () => {
  const oldOverview = defer();
  getPlans.mockImplementation((search, program, status, owner, options) => {
    if (options.limit === 1 && owner === 'coach-current') return oldOverview.promise;
    if (options.limit === 1) return Promise.resolve({ plans: [], total: status === 'draft' ? 7 : status === 'finalized' ? 13 : 20 });
    return Promise.resolve({ plans: [plan(owner)], total: 1 });
  });
  await renderDashboard();
  await chooseSelect('Plan owner', 'Other coach');
  const counts = () => [...container.querySelectorAll('[aria-label="Plan overview"] strong')].map(node => node.textContent);
  expect(counts()).toEqual(['20', '07', '13']);

  await act(async () => oldOverview.resolve({ plans: [plan('old')], total: 999 }));
  expect(counts()).toEqual(['20', '07', '13']);
  expect(container.querySelector('tbody').textContent).toContain('Patient coach-other');
});
