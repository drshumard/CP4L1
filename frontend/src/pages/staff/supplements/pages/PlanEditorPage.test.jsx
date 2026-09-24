import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import PlanEditorPage from './PlanEditorPage';
import { getPlan, getSupplements, getSuppliers, saveToDrive, updatePlan } from '../lib/api';

jest.mock('../auth', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../lib/api', () => ({
  getPlan: jest.fn(), getSupplements: jest.fn(), getSuppliers: jest.fn(), updatePlan: jest.fn(),
  saveToDrive: jest.fn(), exportPatientPDF: jest.fn(), exportHCPDF: jest.fn(), finalizePlan: jest.fn(),
  reopenPlan: jest.fn(), duplicatePlan: jest.fn(), getTemplates: jest.fn(), savePlanAsTemplate: jest.fn(),
}));

const fixture = id => ({ _id: id, patient_name: `Patient ${id}`, status: 'draft', program_name: 'Program', step_label: 'Step 1',
  months: [{ month_number: 1, supplements: [{ supplement_name: 'Example', quantity_per_dose: 1,
    frequency_per_day: 2, times: ['AM', 'PM'], dosage_display: '1 cap 2x/day', unit_type: 'caps',
    units_per_bottle: 60, cost_per_bottle: 10 }] }] });
const defer = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function NavigateTest() {
  const navigate = useNavigate();
  return <><button data-testid="other-plan" onClick={() => navigate('/plans/second')}>Other plan</button><PlanEditorPage /></>;
}

let container;
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  jest.clearAllMocks();
  getPlan.mockImplementation(async id => fixture(id));
  getSupplements.mockResolvedValue({ supplements: [] });
  getSuppliers.mockResolvedValue({ suppliers: [] });
  saveToDrive.mockResolvedValue({ message: 'Saved' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const renderEditor = () => act(async () => root.render(<MemoryRouter initialEntries={['/plans/first']}>
  <Routes><Route path="/plans/:planId" element={<NavigateTest />} /></Routes>
</MemoryRouter>));
const click = selector => act(async () => container.querySelector(selector).click());
// The schedule grid is a controlled <input type="number"> per slot: set the value through
// the native setter (so React's value tracker sees the change) and fire 'input'.
const setPmQuantity = value => act(async () => {
  const field = container.querySelector('[aria-label="Example PM quantity"]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
});

test('failed latest save prevents cloud export and retry retains unequal-dose edits', async () => {
  updatePlan.mockRejectedValueOnce(new Error('Save unavailable')).mockImplementation(async (id, data) => ({ ...fixture(id), ...data }));
  await renderEditor();
  await setPmQuantity('2');
  await click('[data-testid="plan-editor-save-drive-pill"]');
  expect(saveToDrive).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Example PM quantity"]').value).toBe('2');
  await click('[data-testid="plan-editor-save-drive-pill"]');
  expect(saveToDrive).toHaveBeenCalledTimes(1);
  expect(updatePlan.mock.calls[1][1].months[0].supplements[0].dose_schedule).toEqual([
    { time: 'AM', quantity: 1 }, { time: 'PM', quantity: 2 },
  ]);
});

test('an older manual-save response cannot overwrite a newer editor change', async () => {
  const oldSave = defer();
  updatePlan.mockReturnValueOnce(oldSave.promise);
  await renderEditor();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })));
  await setPmQuantity('3');
  await act(async () => oldSave.resolve(fixture('first')));
  expect(container.querySelector('[aria-label="Example PM quantity"]').value).toBe('3');
});

test('navigating while a save is pending never exports the newly opened plan', async () => {
  const pendingSave = defer();
  updatePlan.mockReturnValue(pendingSave.promise);
  await renderEditor();
  await click('[data-testid="plan-editor-save-drive-pill"]');
  await click('[data-testid="other-plan"]');
  await act(async () => pendingSave.resolve(fixture('first')));
  expect(saveToDrive).not.toHaveBeenCalled();
  expect(container.querySelector('[data-testid="plan-editor-patient-name"]').value).toBe('Patient second');
});
