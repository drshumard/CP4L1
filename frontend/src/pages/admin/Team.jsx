import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, MoreHorizontalIcon } from 'lucide-react';
import { adminApi } from './api';
import { confirmDialog } from './confirm';
import RolesAccess from './RolesAccess';
import { ROLE_LABELS, TEAM_ROLES } from '@/lib/staffApps';
import { canManageTeamMember } from '@/lib/portalAccess';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

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
  const [tab, setTab] = useState('members'); // 'members' | 'roles'

  // Add / edit drawer
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null); // { id?, name, email, role }
  const [saving, setSaving] = useState(false);
  const roleOptions = (teamLoaded ? teamRoleChoices(me?.role, assignableRoles) : [])
    .map((role) => ({ value: role, label: ROLE_LABELS[role] }));
  const currentRoleOption = form && !roleOptions.some(option => option.value === form.role)
    ? { value: form.role, label: `${ROLE_LABELS[form.role] || form.role} (current role)`, disabled: true }
    : null;

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
    load();
  }, [load]);

  const openNew = () => {
    if (!roleOptions.length) return;
    setForm({ id: null, name: '', email: '', role: roleOptions[0].value, password: '' }); setOpen(true);
  };
  const openEdit = (m) => { setForm({ id: m.id, name: m.name || '', email: m.email, role: m.role, initialRole: m.role, password: '' }); setOpen(true); };
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.id && !form.email.trim()) { toast.error('Email is required'); return; }
    const roleChanged = !form.id || form.role !== form.initialRole;
    if (roleChanged && !roleOptions.some(option => option.value === form.role)) {
      toast.error('You cannot assign that role. Reload the team and try again.'); return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await adminApi.put(`/admin/team/${form.id}`, { name: form.name.trim(), ...(roleChanged ? { role: form.role } : {}), ...(form.password ? { password: form.password } : {}) });
        toast.success('Member updated');
      } else {
        await adminApi.post('/admin/team', { name: form.name.trim(), email: form.email.trim(), role: form.role, ...(form.password ? { password: form.password } : {}) });
        toast.success(`${form.name.trim()} added — they can sign in with Google${form.password ? ' or the password you set' : ''}`);
      }
      setOpen(false); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
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
      toast.success(deactivating ? 'Member deactivated' : 'Member reactivated');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Update failed');
    }
  };

  if (forbidden) {
    return <div className="p-6 py-12 text-center text-muted-foreground">Only admins can manage the team.</div>;
  }

  return (
    // Rendered inside the staff workspace shell (which provides the page padding).
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {[['members', 'Members'], ['roles', 'Roles & access']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'roles' ? <RolesAccess /> : (<>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Team members sign in with Google or their email and password, and land in the workspace their role allows.
        </p>
        <Button size="sm" onClick={openNew} disabled={!me || !roleOptions.length}><Plus className="size-4" /> Add member</Button>
      </div>

      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
              <TableHead className={HEAD}>Name</TableHead>
              <TableHead className={HEAD}>Email</TableHead>
              <TableHead className={HEAD}>Role</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={HEAD}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && members.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : members.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No team members yet.</TableCell></TableRow>
            ) : members.map((m) => {
              const active = m.active !== false;
              const isSelf = me && m.id === me.id;
              const canManage = canManageTeamMember(me, m);
              return (
                <TableRow key={m.id} className={canManage ? 'cursor-pointer' : ''}
                  onClick={() => { if (canManage) openEdit(m); }}>
                  <TableCell className={`${CELL} font-medium text-foreground`}>
                    {m.name}{isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className={`${CELL} text-muted-foreground`}>{m.email}</TableCell>
                  <TableCell className={CELL}>
                    <span className="font-medium text-foreground">{ROLE_LABELS[m.role] || m.role}</span>
                  </TableCell>
                  <TableCell className={`${CELL} text-center`}>
                    <span className={`font-semibold ${active ? 'text-emerald-700' : 'text-red-700'}`}>{active ? 'Active' : 'Inactive'}</span>
                  </TableCell>
                  <TableCell className={`${CELL} text-center`} onClick={(e) => e.stopPropagation()}>
                    {!canManage ? <span className="text-muted-foreground">—</span> : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontalIcon />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(m)}>Edit</DropdownMenuItem>
                          {active
                            ? <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => toggleActive(m)}>Deactivate</DropdownMenuItem>
                            : <DropdownMenuItem onClick={() => toggleActive(m)}>Reactivate</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      </>)}

      {/* Add / edit drawer */}
      <Drawer open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DrawerContent>
          <div className="mx-auto flex w-full max-w-lg flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>{form?.id ? 'Edit member' : 'Add team member'}</DrawerTitle>
              <DrawerDescription>
                {form?.id
                  ? 'Change their name or role. Role changes apply on their next page load.'
                  : 'Creates their portal account. They sign in with Google (or an email + password an admin sets).'}
              </DrawerDescription>
            </DrawerHeader>
            {form && (
              <div className="space-y-4 px-4 pb-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tm-name">Name</Label>
                    <Input id="tm-name" value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tm-email">Email</Label>
                    <Input id="tm-email" type="email" value={form.email} disabled={!!form.id}
                      onChange={(e) => setF('email', e.target.value)} placeholder="jane@drshumard.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(value) => setF('role', value)} disabled={saving || !roleOptions.length}>
                    <SelectTrigger aria-label="Role" className="w-60"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {[...(currentRoleOption ? [currentRoleOption] : []), ...roleOptions].map(option => (
                        <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Staff roles land in the staff workspace. Only a super-admin can assign the Admin role.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-password">{form.id ? 'Reset password (optional)' : 'Temporary password (optional)'}</Label>
                  <Input id="tm-password" type="password" value={form.password} autoComplete="new-password"
                    onChange={(e) => setF('password', e.target.value)} placeholder={form.id ? 'Leave blank to keep the current one' : 'At least 8 characters'} />
                  <p className="text-xs text-muted-foreground">
                    Google sign-in always works. Set this to enable the email + password alternative.
                  </p>
                </div>
              </div>
            )}
            <DrawerFooter className="flex-row justify-end gap-2">
              <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : form?.id ? 'Save member' : 'Add member'}</Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
