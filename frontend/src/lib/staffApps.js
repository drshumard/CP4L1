import { GraduationCap, Pill, ShieldCheck } from 'lucide-react';

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
    roles: ADMIN_ROLES,
    blurb: 'The admin portal — patients, scheduling, analytics, team.',
  },
  {
    key: 'learn',
    label: 'Learn',
    path: '/staff/learn',
    icon: GraduationCap,
    roles: TEAM_ROLES,
    blurb: 'Training, SOPs, and onboarding material for the whole team.',
  },
  {
    key: 'supplements',
    label: 'Supplements',
    path: '/staff/supplements',
    icon: Pill,
    roles: ['hc', ...ADMIN_ROLES],
    blurb: 'The supplement protocol manager for health coaches.',
  },
];

export const appsForRole = (role) => STAFF_APPS.filter((a) => a.roles.includes(role));

/** Where a signed-in user belongs after login: the whole team (staff AND admins) lands in
 *  the workspace — admins reach the admin portal via its "Portal" tab. Patients → null. */
export const homeForRole = (role) => (TEAM_ROLES.includes(role) ? '/staff' : null);
