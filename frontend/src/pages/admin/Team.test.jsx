import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Team, { teamRoleChoices } from './Team';
import { adminApi } from './api';

jest.mock('./api', () => ({ adminApi: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));
jest.mock('./RolesAccess', () => () => null);
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

test('an older API missing assignable_roles has a safe actor-specific fallback', () => {
  expect(teamRoleChoices('super_admin', undefined)).toEqual(['pcc', 'doa', 'hc', 'marketing', 'admin']);
  expect(teamRoleChoices('admin', undefined)).toEqual(['pcc', 'doa', 'hc', 'marketing']);
  expect(teamRoleChoices('hc', undefined)).toEqual(['pcc', 'doa', 'hc', 'marketing']);
  expect(teamRoleChoices(undefined, undefined)).toEqual([]);
});

test('the server can narrow roles but cannot expose Admin to a lower-ranked actor', () => {
  expect(teamRoleChoices('super_admin', [])).toEqual([]);
  expect(teamRoleChoices('super_admin', ['hc'])).toEqual(['hc']);
  expect(teamRoleChoices('admin', ['hc', 'admin', 'super_admin'])).toEqual(['hc']);
  expect(teamRoleChoices('user', ['hc', 'admin'])).toEqual([]);
});

describe('member role drawer', () => {
  let container;
  let root;
  const member = { id: 'member', name: 'Test Coach', email: 'coach@example.test', role: 'hc', active: true };
  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    HTMLElement.prototype.scrollIntoView = jest.fn();
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = jest.fn();
    HTMLElement.prototype.releasePointerCapture = jest.fn();
    jest.clearAllMocks();
    adminApi.put.mockResolvedValue({ data: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const renderTeam = async (role, roster, viaActions = false) => {
    adminApi.get.mockImplementation(async path => ({ data: path === '/user/me'
      ? { id: 'actor', role, name: 'Actor' }
      : { members: [member], ...roster } }));
    await act(async () => root.render(<Team />));
    if (viaActions) {
      await act(async () => container.querySelector('tbody button[aria-haspopup="menu"]')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      const edit = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === 'Edit');
      await act(async () => { edit.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    } else {
      await act(async () => container.querySelector('tbody tr').click());
    }
  };
  // The sheet's role picker is a radio group; each option's accessible name is the role label.
  const roleInputs = () => [...document.querySelectorAll('input[name="member-role"]')];

  test('a super-admin can open, select, and save Admin when the API omits the new role field', async () => {
    await renderTeam('super_admin', {}, true);
    const option = roleInputs().find(el => el.getAttribute('aria-label') === 'Admin');
    expect(option).toBeDefined();
    await act(async () => option.click());
    const save = [...document.querySelectorAll('button')].find(el => el.textContent === 'Save member');
    await act(async () => save.click());
    expect(adminApi.put).toHaveBeenCalledWith('/admin/team/member', { name: 'Test Coach', role: 'admin' });
  });

  test('a normal admin can change staff roles but never sees Admin in the drawer', async () => {
    await renderTeam('admin', {});
    const labels = roleInputs().map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(['Care Coordinator', 'Director of Admissions', 'Health Coach', 'Marketing']);
    expect(labels).not.toContain('Admin');
  });

  test('an explicitly empty server list keeps the current label and allows name-only saves', async () => {
    await renderTeam('super_admin', { assignable_roles: [] });
    const inputs = roleInputs();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].disabled).toBe(true);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[0].getAttribute('aria-label')).toContain('Health Coach');
    const save = [...document.querySelectorAll('button')].find(el => el.textContent === 'Save member');
    await act(async () => save.click());
    expect(adminApi.put).toHaveBeenCalledWith('/admin/team/member', { name: 'Test Coach' });
  });
});
