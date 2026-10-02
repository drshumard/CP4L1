import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TemplatesPage from './TemplatesPage';
import { getTemplates, getSupplements, updateTemplate } from '../lib/api';
import { toast } from 'sonner';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../lib/api', () => ({
  getTemplates: jest.fn(), getSupplements: jest.fn(), updateTemplate: jest.fn(),
  createTemplate: jest.fn(), deleteTemplate: jest.fn(),
}));

const copy = value => JSON.parse(JSON.stringify(value));
const supplement = (name = 'Daily Essentials') => ({
  supplement_id: name, supplement_name: name, company: 'Example Labs', unit_type: 'caps',
  quantity_per_dose: 1, frequency_per_day: 1, times: ['AM'], dosage_display: '1 cap per day',
  instructions: 'Take with food', units_per_bottle: 60, cost_per_bottle: 20,
});
const template = () => ({
  _id: 'template-1', program_name: 'Detox 1', step_number: 1, default_months: 1,
  updated_at: '2026-09-29T10:00:00Z',
  months: [{ month_number: 1, supplements: [supplement()] }],
});
const catalogSupplement = {
  _id: 'added-supplement', supplement_name: 'Added supplement', company: 'Example Labs',
  default_quantity_per_dose: 1, default_frequency_per_day: 1, default_dosage_display: '1 cap per day',
  units_per_bottle: 30, cost_per_bottle: 10, unit_type: 'caps',
};

let container;
let root;
let savedTemplate;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  jest.clearAllMocks();
  savedTemplate = template();
  getTemplates.mockImplementation(async () => ({ templates: [copy(savedTemplate)] }));
  getSupplements.mockResolvedValue({ supplements: [catalogSupplement] });
  updateTemplate.mockImplementation(async (id, data) => {
    savedTemplate = { ...savedTemplate, ...copy(data), _id: id };
    return copy(savedTemplate);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const renderTemplates = () => act(async () => root.render(<TemplatesPage />));
const button = (text, scope = container) => [...scope.querySelectorAll('button')]
  .find(node => node.textContent.trim() === text);
const click = node => act(async () => node.click());
const panel = () => container.querySelector('[role="tabpanel"]');
const monthTab = number => [...container.querySelectorAll('[aria-label="Template months"] [role="tab"]')]
  .find(node => node.textContent.includes(`Month ${number}`));
const instructionsField = () => {
  const label = [...panel().querySelectorAll('label')].find(node => node.textContent === 'Patient instructions');
  return document.getElementById(label.htmlFor);
};
const editInstructions = async value => {
  const field = instructionsField();
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => field.blur());
};
const addCatalogSupplement = async () => {
  await click(button('Add supplement', panel()));
  const option = [...document.querySelectorAll('[role="option"]')]
    .find(node => node.textContent.includes(catalogSupplement.supplement_name));
  expect(option).toBeDefined();
  await click(option);
};
const save = () => click(container.querySelector('[data-testid="admin-templates-save-button"]'));

test('adding a month preserves earlier edits and saves new supplements through reload', async () => {
  await renderTemplates();
  await editInstructions('Take after breakfast');
  await click(panel().querySelector('[aria-label="Increase Daily Essentials quantity"]'));

  await click(button('Add month'));
  expect(monthTab(2).getAttribute('aria-selected')).toBe('true');
  expect(panel().getAttribute('aria-label')).toBe('Month 2');
  expect(panel().textContent).not.toContain('Daily Essentials');
  await addCatalogSupplement();
  await editInstructions('Take with lunch');
  await save();

  expect(updateTemplate).toHaveBeenCalledWith('template-1', expect.objectContaining({
    default_months: 2,
    months: [
      expect.objectContaining({ month_number: 1, supplements: [expect.objectContaining({
        supplement_name: 'Daily Essentials', quantity_per_dose: 2, instructions: 'Take after breakfast',
      })] }),
      expect.objectContaining({ month_number: 2, supplements: [expect.objectContaining({
        supplement_name: 'Added supplement', instructions: 'Take with lunch',
      })] }),
    ],
  }));

  await act(async () => root.unmount());
  root = createRoot(container);
  await renderTemplates();
  await click(monthTab(1));
  expect(instructionsField().value).toBe('Take after breakfast');
  expect(panel().querySelector('[aria-label="Daily Essentials quantity"]').textContent).toBe('2');
  await click(monthTab(2));
  expect(instructionsField().value).toBe('Take with lunch');
  expect(panel().textContent).toContain('Added supplement');
});

test('switching month tabs retains each months unsaved supplement edits', async () => {
  savedTemplate.default_months = 2;
  savedTemplate.months.push({ month_number: 2, supplements: [supplement('Evening Support')] });
  await renderTemplates();
  await editInstructions('First month instructions');
  await click(monthTab(2));
  expect(panel().getAttribute('aria-label')).toBe('Month 2');
  expect(panel().textContent).not.toContain('Daily Essentials');
  await editInstructions('Second month instructions');

  await click(monthTab(1));
  expect(instructionsField().value).toBe('First month instructions');
  await click(monthTab(2));
  expect(instructionsField().value).toBe('Second month instructions');
  expect(updateTemplate).not.toHaveBeenCalled();
});

test('a failed save retains the added month and supplement draft for retry', async () => {
  updateTemplate.mockRejectedValueOnce(new Error('Save unavailable'));
  await renderTemplates();
  await click(button('Add month'));
  await addCatalogSupplement();
  await editInstructions('Keep this unsaved instruction');
  await save();

  expect(toast.error).toHaveBeenCalled();
  expect(getTemplates).toHaveBeenCalledTimes(1);
  expect(monthTab(2).getAttribute('aria-selected')).toBe('true');
  expect(instructionsField().value).toBe('Keep this unsaved instruction');
  expect(panel().textContent).toContain('Added supplement');
  expect(container.textContent).toContain('Unsaved changes');

  await save();
  expect(updateTemplate).toHaveBeenCalledTimes(2);
  expect(updateTemplate.mock.calls[1][1].months[1].supplements[0].instructions)
    .toBe('Keep this unsaved instruction');
  expect(savedTemplate.months).toHaveLength(2);
});
