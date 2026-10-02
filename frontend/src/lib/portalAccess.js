// Keep route guards, navigation and the workspace entry point on the same policy.
export const SCHEDULING_PAGES = [
  { to: '/admin/scheduling/bookings', label: 'Bookings', cap: 'scheduling.view' },
  { to: '/admin/scheduling/calendar', label: 'Calendar', cap: 'scheduling.view' },
  { to: '/admin/scheduling/hosts', label: 'Hosts', cap: 'scheduling.manage' },
  { to: '/admin/scheduling/coordinators', label: 'Coordinators', cap: 'scheduling.manage' },
  { to: '/admin/scheduling/events', label: 'Events', cap: 'settings.manage' },
  { to: '/admin/scheduling/settings', label: 'Settings', cap: 'settings.manage' },
];

const PORTAL_PAGES = [
  { to: '/admin', cap: 'patients.view' },
  { to: '/admin/purchases', cap: 'purchases.view' },
  ...SCHEDULING_PAGES,
  { to: '/admin/scheduling/new', cap: 'scheduling.manage' },   // New booking (not a tab)
  { to: '/admin/analytics', cap: 'analytics.view' },
  { to: '/admin/logs', cap: 'analytics.view' },
  { to: '/admin/automations', cap: 'automations.manage' },
];

export const schedulingPagesForCapabilities = (caps = []) => SCHEDULING_PAGES.filter((page) => caps.includes(page.cap));
export const portalHomeForCapabilities = (caps = []) => caps.includes('portal')
  ? PORTAL_PAGES.find((page) => caps.includes(page.cap))?.to || null
  : null;

export function canAccessPortalPath(pathname, caps = []) {
  if (!caps.includes('portal')) return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin/scheduling') return schedulingPagesForCapabilities(caps).length > 0;
  if (path === '/admin/scheduling/directors') return caps.includes('scheduling.manage');
  const page = PORTAL_PAGES.find((item) => path === item.to || (item.to !== '/admin' && path.startsWith(`${item.to}/`)));
  return !!page && caps.includes(page.cap);
}

const ROLE_RANK = { super_admin: 3, admin: 2, pcc: 1, doa: 1, hc: 1, staff: 1 };
export const canManageTeamMember = (actor, target) => !!actor && actor.id !== target.id
  && (ROLE_RANK[actor.role] || 0) > (ROLE_RANK[target.role] || 0);
