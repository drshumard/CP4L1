import { canAccessPortalPath, canManageTeamMember, portalHomeForCapabilities, schedulingPagesForCapabilities } from './portalAccess';

test.each([
  [['portal', 'patients.view', 'scheduling.view'], '/admin'],
  [['portal', 'scheduling.view'], '/admin/scheduling/bookings'],
  [['portal', 'scheduling.manage'], '/admin/scheduling/hosts'],
  [['portal', 'settings.manage'], '/admin/scheduling/events'],
  [['portal', 'analytics.view'], '/admin/analytics'],
  [['portal', 'automations.manage'], '/admin/automations'],
  [['portal'], null],
  [['patients.view'], null],
])('lands capabilities %j at %s', (caps, expected) => {
  expect(portalHomeForCapabilities(caps)).toBe(expected);
  if (expected) expect(canAccessPortalPath(expected, caps)).toBe(true);
});

test('viewer navigation and direct routes never enter scheduling management or settings', () => {
  const caps = ['portal', 'scheduling.view'];
  expect(schedulingPagesForCapabilities(caps).map(p => p.label)).toEqual(['Bookings', 'Calendar']);
  for (const path of ['/admin', '/admin/scheduling/hosts', '/admin/scheduling/hosts/new', '/admin/scheduling/directors', '/admin/scheduling/events', '/admin/scheduling/settings']) {
    expect(canAccessPortalPath(path, caps)).toBe(false);
  }
  expect(canAccessPortalPath('/admin/scheduling/', caps)).toBe(true);
});

test('settings-only access has usable scheduling navigation', () => {
  const caps = ['portal', 'settings.manage'];
  expect(schedulingPagesForCapabilities(caps).map(p => p.label)).toEqual(['Events', 'Settings']);
  expect(canAccessPortalPath('/admin/scheduling/settings', caps)).toBe(true);
  expect(canAccessPortalPath('/admin/scheduling/bookings', caps)).toBe(false);
});

test('team actions follow strict server hierarchy', () => {
  const superAdmin = { id: 'super', role: 'super_admin' };
  const admin = { id: 'admin', role: 'admin' };
  const hc = { id: 'hc', role: 'hc' };
  expect(canManageTeamMember(superAdmin, admin)).toBe(true);
  expect(canManageTeamMember(admin, hc)).toBe(true);
  expect(canManageTeamMember(hc, admin)).toBe(false);
  expect(canManageTeamMember(admin, { id: 'other-admin', role: 'admin' })).toBe(false);
  expect(canManageTeamMember(hc, { id: 'pcc', role: 'pcc' })).toBe(false);
  expect(canManageTeamMember(superAdmin, superAdmin)).toBe(false);
});

test('pages main added (Purchases, New booking) are gated like their sections', () => {
  const viewer = ['portal', 'patients.view', 'scheduling.view', 'purchases.view'];
  expect(canAccessPortalPath('/admin/purchases', viewer)).toBe(true);
  expect(canAccessPortalPath('/admin/purchases', ['portal', 'patients.view'])).toBe(false);
  expect(canAccessPortalPath('/admin/scheduling/new', viewer)).toBe(false);
  expect(canAccessPortalPath('/admin/scheduling/new', [...viewer, 'scheduling.manage'])).toBe(true);
  expect(canAccessPortalPath('/admin/purchases', ['portal', 'analytics.view'])).toBe(false);
});
