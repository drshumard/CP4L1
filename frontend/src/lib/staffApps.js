import { GraduationCap, Pill, ShieldCheck, UserCog } from 'lucide-react';
import { portalHomeForCapabilities } from './portalAccess';

// Central registry of the team role model and the staff apps. The staff sidebar, the
// staff-home tiles, and the per-app route guards are ALL derived from this file — to
// integrate a future app into the portal, add one entry here and one <Route>.

export const STAFF_ROLES = ['pcc', 'doa', 'hc', 'staff']; // 'staff' = legacy umbrella role
export const ADMIN_ROLES = ['admin', 'super_admin'];
export const TEAM_ROLES = [...STAFF_ROLES, ...ADMIN_ROLES];

export const ROLE_LABELS = {
  pcc: 'Care Coordinator',
  doa: 'Director of Admissions',
  hc: 'Health Coach',
  staff: 'Staff',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

// Roles a super admin can hand out from the Team page (super_admin itself is bootstrap-only).
export const ASSIGNABLE_ROLES = ['pcc', 'doa', 'hc', 'admin'];

export const STAFF_APPS = [
  {
    key: 'portal',
    label: 'Portal',
    path: '/admin',
    icon: ShieldCheck,
    capability: 'portal',
    blurb: 'The admin portal — patients, scheduling, analytics, team.',
  },
  {
    key: 'learn',
    label: 'Learn',
    path: '/staff/learn',
    icon: GraduationCap,
    capability: 'learn',
    blurb: 'Training, SOPs, and onboarding material for the whole team.',
  },
  {
    key: 'supplements',
    label: 'Supplements',
    path: '/staff/supplements',
    icon: Pill,
    capability: 'supplements',
    blurb: 'The supplement protocol manager for health coaches.',
  },
  {
    key: 'team',
    label: 'Team',
    path: '/staff/team',
    icon: UserCog,
    capability: 'team',
    blurb: 'Create team members and assign their roles.',
  },
];

// Access is driven by the RBAC matrix (Team → Roles & access), delivered as
// profile.capabilities from /user/me — never by the role name.
export const appsForCapabilities = (caps) => STAFF_APPS
  .filter((a) => (caps || []).includes(a.capability))
  .map((a) => a.key === 'portal' ? { ...a, path: portalHomeForCapabilities(caps) || '/admin' } : a);

/** Where a signed-in user belongs after login: the whole team (staff AND admins) lands in
 *  the workspace — admins reach the admin portal via its "Portal" tab. Patients → null. */
export const homeForRole = (role) => (TEAM_ROLES.includes(role) ? '/staff' : null);

/** On staff.drshumard.com — or anywhere inside the staff/admin areas on any host —
 *  the sign-in surface is the staff login (Google / email+password), not the patient page.
 *  Both issue the same portal session. */
export const isStaffHost = () =>
  typeof window !== 'undefined' && window.location.hostname.startsWith('staff.');
export const loginPath = () => {
  if (isStaffHost()) return '/staff-login';
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  return path.startsWith('/staff') || path.startsWith('/admin') ? '/staff-login' : '/login';
};
