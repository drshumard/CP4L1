import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import PatientsPage from './PatientsPage';
import PatientDetailPage from './PatientDetailPage';
import { getPatients, getPatient } from '../lib/api';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../lib/api', () => ({
  getPatients: jest.fn(), getPatient: jest.fn(), createPatient: jest.fn(), deletePatient: jest.fn(),
  searchPbClients: jest.fn(), updatePatient: jest.fn(), deletePlan: jest.fn(), duplicatePlan: jest.fn(),
  saveAllPlansToDrive: jest.fn(),
}));

const patient = (id, name) => ({ _id: id, name, email: `${id}@example.test`, plans: [] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function DetailTest() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button data-testid="other-patient" onClick={() => navigate('/patients/second')}>Other patient</button><span data-testid="location">{location.pathname}</span><PatientDetailPage /></>;
}

let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.resetAllMocks();
  getPatients.mockResolvedValue({ patients: [], total: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});
const advance = ms => act(async () => { jest.advanceTimersByTime(ms); });
const renderDirectory = async () => {
  await act(async () => root.render(<MemoryRouter><PatientsPage /></MemoryRouter>));
  await advance(0);
};
const renderDetail = () => act(async () => root.render(<MemoryRouter initialEntries={['/patients/first']}><Routes><Route path="/patients/:patientId" element={<DetailTest />} /></Routes></MemoryRouter>));
const setSearch = value => act(async () => {
  const input = container.querySelector('[data-testid="patients-search"]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const retry = () => act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Try again').click());

test('directory debounces typing and ignores results from the previous search', async () => {
  const original = deferred();
  getPatients.mockReturnValueOnce(original.promise).mockResolvedValueOnce({ patients: [patient('alex', 'Alex Morgan')], total: 1 });
  await renderDirectory();
  await setSearch('Alex');
  await advance(100);
  await setSearch('Alex M');
  await advance(249);
  expect(getPatients).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(getPatients).toHaveBeenLastCalledWith('Alex M');
  expect(container.textContent).toContain('Alex Morgan');
  await act(async () => original.resolve({ patients: [patient('old', 'Previous result')], total: 1 }));
  expect(container.textContent).toContain('Alex Morgan');
  expect(container.textContent).not.toContain('Previous result');
});

test('directory failure hides stale records, keeps the query, and retries it', async () => {
  getPatients.mockResolvedValueOnce({ patients: [patient('old', 'Previous result')], total: 1 })
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce({ patients: [patient('alex', 'Alex Morgan')], total: 1 });
  await renderDirectory();
  await setSearch('Alex');
  await advance(250);
  expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to load patients');
  expect(container.textContent).not.toContain('Previous result');
  expect(container.textContent).not.toContain('No matching patients');
  expect(container.querySelector('[data-testid="patients-search"]').value).toBe('Alex');
  await retry();
  expect(getPatients).toHaveBeenLastCalledWith('Alex');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain('Alex Morgan');
});

test('patient detail keeps the route on load failure and offers a working retry', async () => {
  getPatient.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(patient('first', 'Alex Morgan'));
  await renderDetail();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to load this patient');
  expect(container.querySelector('[data-testid="location"]').textContent).toBe('/patients/first');
  await retry();
  expect(getPatient).toHaveBeenLastCalledWith('first');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain('Alex Morgan');
});

test.each(['success', 'failure'])('an old patient request %s cannot replace the newly opened record', async outcome => {
  const original = deferred();
  getPatient.mockReturnValueOnce(original.promise).mockResolvedValueOnce(patient('second', 'Casey Brooks'));
  await renderDetail();
  await act(async () => container.querySelector('[data-testid="other-patient"]').click());
  expect(container.textContent).toContain('Casey Brooks');
  await act(async () => {
    if (outcome === 'success') original.resolve(patient('first', 'Previous patient'));
    else original.reject(new Error('Late network failure'));
  });
  expect(container.textContent).toContain('Casey Brooks');
  expect(container.textContent).not.toContain('Previous patient');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[data-testid="location"]').textContent).toBe('/patients/second');
});
