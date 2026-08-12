import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, MoreHorizontalIcon } from 'lucide-react';
import { adminApi } from './api';
import { confirmDialog } from './confirm';
import CadSelect from './CadSelect';
import { ROLE_LABELS, ASSIGNABLE_ROLES } from '@/lib/staffApps';
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

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default function Team() {
  const [members, setMembers] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Add / edit drawer
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null); // { id?, name, email, role }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get('/admin/team');
      setMembers(res.data.members || []);
    } catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
      else toast.error('Failed to load team');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    adminApi.get('/user/me').then((r) => setMe(r.data)).catch(() => {});
    load();
  }, [load]);

  const openNew = () => { setForm({ id: null, name: '', email: '', role: 'pcc' }); setOpen(true); };
  const openEdit = (m) => { setForm({ id: m.id, name: m.name || '', email: m.email, role: m.role }); setOpen(true); };
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.id && !form.email.trim()) { toast.error('Email is required'); return; }
    setSaving(true);
    try {
      if (form.id) {
        await adminApi.put(`/admin/team/${form.id}`, { name: form.name.trim(), role: form.role });
        toast.success('Member updated');
      } else {
        await adminApi.post('/admin/team', { name: form.name.trim(), email: form.email.trim(), role: form.role });
        toast.success(`${form.name.trim()} added — they can sign in at the portal with their email (a code is sent on login)`);
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
        message: 'They immediately lose access to the portal and can no longer sign in. Reactivate any time.',
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Team members sign in with their email (they get a one-time code) and land in the workspace their role allows.
        </p>
        <Button size="sm" onClick={openNew}><Plus className="size-4" /> Add member</Button>
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
              const isSuper = m.role === 'super_admin';
              return (
                <TableRow key={m.id} className={!isSuper && !isSelf ? 'cursor-pointer' : ''}
                  onClick={() => { if (!isSuper && !isSelf) openEdit(m); }}>
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
                    {isSuper || isSelf ? <span className="text-muted-foreground">—</span> : (
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

      {/* Add / edit drawer */}
      <Drawer open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DrawerContent>
          <div className="mx-auto flex w-full max-w-lg flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>{form?.id ? 'Edit member' : 'Add team member'}</DrawerTitle>
              <DrawerDescription>
                {form?.id
                  ? 'Change their name or role. Role changes apply on their next page load.'
                  : 'Creates their portal account. They sign in with this email — a one-time code is emailed on each login.'}
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
                  <CadSelect value={form.role} onChange={(v) => setF('role', v)} ariaLabel="Role" style={{ width: 240 }}
                    options={form.role === 'staff'
                      ? [{ value: 'staff', label: 'Staff (legacy — pick a real role)', disabled: true }, ...ROLE_OPTIONS]
                      : ROLE_OPTIONS} />
                  <p className="text-xs text-muted-foreground">
                    Staff roles land in the staff workspace; Admin gets the full admin area.
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
