import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Info, Lock, MoreHorizontal, Plus, Search } from 'lucide-react';
import { adminApi } from './api';
import { confirmDialog } from './confirm';
import RolesAccess from './RolesAccess';
import { ADMIN_ROLES, ROLE_LABELS, STAFF_APPS, TEAM_ROLES } from '@/lib/staffApps';
import { canManageTeamMember } from '@/lib/portalAccess';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import s from './team.module.css';

// Team app (members + roles), ported from shumard-checkout-portal/app/staff/team (Lyra).
// Rendered inside the staff workspace shell, which provides the page padding and CSS variables.

const STATUS_FILTERS = ['All', 'Active', 'Inactive'];
const ROLE_TONE = { super_admin: 'super', admin: 'admin', doa: 'director', pcc: 'coordinator', hc: 'coach' };
const initials = (name) => (name || '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
const statusOf = (m) => (m.active === false ? 'Inactive' : 'Active');

export function teamRoleChoices(actorRole, serverRoles) {
  if (!TEAM_ROLES.includes(actorRole)) return [];
  const allowed = actorRole === 'super_admin' ? ['pcc', 'doa', 'hc', 'admin'] : ['pcc', 'doa', 'hc'];
  // Older running APIs omit this field. Keep the form usable during rollout,
  // while honoring an explicit empty list and never widening the actor's rank.
  return Array.isArray(serverRoles) ? allowed.filter(role => serverRoles.includes(role)) : allowed;
}

export default function Team() {
  const [members, setMembers] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState(null);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [roleCaps, setRoleCaps] = useState({});   // { role: Set(capabilities) } for the Access column
  const [tab, setTab] = useState('members');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Add / edit sheet
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null); // { id?, name, email, role, initialRole?, password }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const roleOptions = (teamLoaded ? teamRoleChoices(me?.role, assignableRoles) : [])
    .map((role) => ({ value: role, label: ROLE_LABELS[role] }));
  // Editing someone whose role the actor can't hand out: show it, locked, so a name-only save still works.
  const currentRoleOption = form?.id && !roleOptions.some((o) => o.value === form.role)
    ? { value: form.role, label: `${ROLE_LABELS[form.role] || form.role} (current role)`, disabled: true }
    : null;
  const sheetRoles = [...(currentRoleOption ? [currentRoleOption] : []), ...roleOptions];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get('/admin/team');
      setMembers(res.data.members || []);
      setAssignableRoles(Array.isArray(res.data.assignable_roles) ? res.data.assignable_roles : null);
      setTeamLoaded(true);
    } catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
      else toast.error('Failed to load team');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    adminApi.get('/user/me').then((r) => setMe(r.data)).catch(() => {});
    adminApi.get('/admin/role-permissions').then((r) => {
      const caps = {};
      (r.data?.roles || []).forEach((role) => { caps[role.role] = new Set(role.capabilities); });
      setRoleCaps(caps);
    }).catch(() => {});
    load();
  }, [load]);

  const appAccess = useCallback((role) => (ADMIN_ROLES.includes(role)
    ? STAFF_APPS
    : STAFF_APPS.filter((app) => roleCaps[role]?.has(app.capability))), [roleCaps]);

  const counts = useMemo(() => ({
    All: members.length,
    Active: members.filter((m) => statusOf(m) === 'Active').length,
    Inactive: members.filter((m) => statusOf(m) === 'Inactive').length,
    Admins: members.filter((m) => ADMIN_ROLES.includes(m.role)).length,
  }), [members]);
  const search = query.trim().toLowerCase();
  const visible = members.filter((m) => (statusFilter === 'All' || statusOf(m) === statusFilter)
    && `${m.name || ''} ${m.email || ''}`.toLowerCase().includes(search));

  const openNew = () => {
    if (!roleOptions.length) return;
    setErrors({});
    setForm({ id: null, name: '', email: '', role: roleOptions[0].value, password: '' });
    setOpen(true);
  };
  const openEdit = (m) => {
    setErrors({});
    setForm({ id: m.id, name: m.name || '', email: m.email, role: m.role, initialRole: m.role, password: '' });
    setOpen(true);
  };
  const setF = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const save = async (event) => {
    event?.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const next = {
      name: name ? undefined : 'Enter their full name.',
      email: form.id ? undefined
        : !email ? 'Enter their work email.'
          : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Enter a full email address, like name@drshumard.com.'
            : members.some((m) => (m.email || '').toLowerCase() === email) ? 'This person is already on the team.' : undefined,
      password: form.password && form.password.length < 8 ? 'Use at least 8 characters.' : undefined,
    };
    setErrors(next);
    if (next.name || next.email || next.password) {
      document.getElementById(next.name ? 'member-name' : next.email ? 'member-email' : 'member-password')?.focus();
      return;
    }
    const roleChanged = !form.id || form.role !== form.initialRole;
    if (roleChanged && !roleOptions.some((o) => o.value === form.role)) {
      toast.error('You cannot assign that role. Reload the team and try again.'); return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await adminApi.put(`/admin/team/${form.id}`, { name, ...(roleChanged ? { role: form.role } : {}), ...(form.password ? { password: form.password } : {}) });
        toast.success('Member updated');
      } else {
        await adminApi.post('/admin/team', { name, email, role: form.role, ...(form.password ? { password: form.password } : {}) });
        toast.success(`${name} added — they can sign in with Google${form.password ? ' or the password you set' : ''}`);
      }
      setOpen(false); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const changeRole = async (m, role) => {
    if (role === m.role) return;
    try {
      await adminApi.put(`/admin/team/${m.id}`, { role });
      toast.success(`${m.name || m.email} is now a ${ROLE_LABELS[role] || role}. It applies on their next page load.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Update failed');
    }
  };

  const toggleActive = async (m) => {
    const deactivating = m.active !== false;
    if (deactivating) {
      const ok = await confirmDialog({
        title: `Deactivate ${m.name || m.email}?`,
        message: 'They lose access to the portal right away, and Learn access ends within a minute. Reactivate any time.',
        confirmLabel: 'Deactivate',
      });
      if (!ok) return;
    }
    try {
      await adminApi.put(`/admin/team/${m.id}`, { active: !deactivating });
      toast.success(deactivating ? `${m.name || m.email} can no longer sign in.` : `${m.name || m.email} can sign in again.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Update failed');
    }
  };

  if (forbidden) return <p className={s.intro}>Only admins can manage the team.</p>;

  const isSuper = me?.role === 'super_admin';

  return (
    <>
      <div className={s.heading}>
        <div>
          <span className={s.kicker}>Team</span>
          <h1>Team</h1>
          <p>Team members sign in with Google or their email and password, and land in the workspace their role allows.</p>
        </div>
        <button type="button" className={s.primary} onClick={openNew} disabled={!me || !roleOptions.length}><Plus size={16} aria-hidden="true" />Add member</button>
      </div>

      <dl className={s.stats}>
        {[['Members', counts.All], ['Active', counts.Active], ['Inactive', counts.Inactive], ['Admins', counts.Admins]].map(([label, n]) => (
          <div key={label}><dt>{label}</dt><dd>{n}</dd></div>
        ))}
      </dl>

      <Tabs value={tab} onValueChange={setTab} className={s.tabs}>
        <TabsList className={s.tabList} aria-label="Team views">
          <TabsTrigger value="members">Members<span>{members.length}</span></TabsTrigger>
          <TabsTrigger value="roles">Roles &amp; access</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className={s.panel}>
          <section className={s.card} aria-label="Team members">
            <div className={s.toolbar}>
              <label className={s.search}>
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">Search members</span>
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" />
              </label>
              <div className={s.segmented} role="group" aria-label="Filter by status">
                {STATUS_FILTERS.map((status) => (
                  <button key={status} type="button" aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{status}<span>{counts[status]}</span></button>
                ))}
              </div>
              <span className={s.count}>{visible.length} of {members.length}</span>
            </div>

            {loading && members.length === 0 ? (
              <div className={s.empty}><p>Loading…</p></div>
            ) : visible.length ? (
              <div className={s.scroll}>
                <table className={s.table}>
                  <thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Access</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {visible.map((m) => {
                      const isSelf = me && m.id === me.id;
                      const canManage = canManageTeamMember(me, m);
                      const access = appAccess(m.role);
                      const status = statusOf(m);
                      const lockedReason = isSelf ? "You can't change your own role" : !canManage ? 'Only a super admin can change this account' : null;
                      const tone = ROLE_TONE[m.role];
                      return (
                        <tr key={m.id} data-clickable={canManage || undefined} onClick={() => { if (canManage) openEdit(m); }}>
                          <td>
                            <div className={s.person}>
                              <span className={s.avatar} data-role={tone} aria-hidden="true">{initials(m.name || m.email)}</span>
                              <div><strong>{m.name || m.email}{isSelf && <span className={s.you}>You</span>}</strong><span>{m.email}</span></div>
                            </div>
                          </td>
                          <td><span className={s.role} data-role={tone}><i aria-hidden="true" />{ROLE_LABELS[m.role] || m.role}</span></td>
                          <td>
                            <span className={s.access} role="img" aria-label={`Access: ${access.map((a) => a.label).join(', ') || 'none'}`}>
                              {STAFF_APPS.map((app) => (
                                <span key={app.key} data-on={access.includes(app)} data-tone={app.tone} title={app.label}><app.icon size={13} aria-hidden="true" /></span>
                              ))}
                            </span>
                          </td>
                          <td><span className={s.status} data-status={status}>{status}</span></td>
                          <td className={s.actions} onClick={(e) => e.stopPropagation()}>
                            {lockedReason ? (
                              <span className={s.locked} title={lockedReason}><Lock size={14} aria-hidden="true" /><span className="sr-only">{lockedReason}</span></span>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button type="button" className={s.menuButton} aria-label={`Actions for ${m.name || m.email}`}><MoreHorizontal size={16} aria-hidden="true" /></button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className={s.menu}>
                                  <DropdownMenuLabel className={s.menuLabel}>{m.name || m.email}</DropdownMenuLabel>
                                  {/* Deferred: let the menu close and hand focus back before the sheet's focus trap takes over. */}
                                  <DropdownMenuItem onSelect={() => window.setTimeout(() => openEdit(m), 0)}>Edit</DropdownMenuItem>
                                  {roleOptions.length > 0 && (
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent className={s.menu}>
                                        <DropdownMenuRadioGroup value={m.role} onValueChange={(role) => changeRole(m, role)}>
                                          {roleOptions.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
                                        </DropdownMenuRadioGroup>
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                  )}
                                  <DropdownMenuSeparator />
                                  {status === 'Active'
                                    ? <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => toggleActive(m)}>Deactivate</DropdownMenuItem>
                                    : <DropdownMenuItem onSelect={() => toggleActive(m)}>Reactivate</DropdownMenuItem>}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={s.empty}>
                <p>{members.length ? 'No team members match these filters.' : 'No team members yet.'}</p>
                {members.length > 0 && <button type="button" className={s.secondary} onClick={() => { setQuery(''); setStatusFilter('All'); }}>Clear filters</button>}
              </div>
            )}
            <p className={s.note}>
              <Info size={14} aria-hidden="true" />
              {isSuper
                ? 'Super admins can manage every account, including admins.'
                : "You're an admin, so admin accounts are locked. Only a super admin can change admins or delete accounts."}
            </p>
          </section>
        </TabsContent>

        <TabsContent value="roles" className={s.panel}>
          <RolesAccess members={members} />
        </TabsContent>
      </Tabs>

      <Sheet open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <SheetContent className={s.sheet}>
          <SheetHeader className={s.sheetHeader}>
            <span className={s.sheetKicker}>{form?.id ? 'Edit member' : 'New member'}</span>
            <SheetTitle>{form?.id ? 'Edit team member' : 'Add a team member'}</SheetTitle>
            <SheetDescription>
              {form?.id
                ? 'Change their name or role. Role changes apply on their next page load.'
                : 'They can sign in with Google right away, or with a password you set here.'}
            </SheetDescription>
          </SheetHeader>
          {form && (
            <form className={s.sheetForm} onSubmit={save} noValidate>
              <label className={s.field}>
                Full name
                <input id="member-name" autoComplete="off" value={form.name} onChange={(e) => setF('name', e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'member-name-error' : undefined} />
                {errors.name && <span id="member-name-error" className={s.fieldError} role="alert">{errors.name}</span>}
              </label>
              <label className={s.field}>
                Work email
                <input id="member-email" type="email" autoComplete="off" placeholder="name@drshumard.com" value={form.email} disabled={!!form.id} onChange={(e) => setF('email', e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'member-email-error' : undefined} />
                {errors.email && <span id="member-email-error" className={s.fieldError} role="alert">{errors.email}</span>}
              </label>
              <fieldset className={s.roles}>
                <legend>Role</legend>
                {sheetRoles.map((o) => (
                  <label key={o.value} className={s.roleOption}>
                    <input type="radio" name="member-role" value={o.value} checked={form.role === o.value} disabled={o.disabled || saving} onChange={() => setF('role', o.value)} aria-label={o.label} />
                    <span><strong>{o.label}</strong><small>Opens {appAccess(o.value).map((a) => a.label).join(' · ') || 'no apps yet'}</small></span>
                  </label>
                ))}
                <p className={s.rolesNote}>Staff roles land in the staff workspace. Only a super admin can assign the Admin role.</p>
              </fieldset>
              <label className={s.field}>
                {form.id ? 'Reset password (optional)' : 'Temporary password (optional)'}
                <input id="member-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setF('password', e.target.value)} placeholder={form.id ? 'Leave blank to keep the current one' : 'At least 8 characters'} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'member-password-error' : undefined} />
                {errors.password
                  ? <span id="member-password-error" className={s.fieldError} role="alert">{errors.password}</span>
                  : <span className={s.fieldHint}>Google sign-in always works. Set this to enable the email + password alternative.</span>}
              </label>
              <div className={s.sheetActions}>
                <button type="button" className={s.secondary} onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
                <button type="submit" className={s.primary} disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save member' : 'Add member'}</button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
