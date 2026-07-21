import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, MoreHorizontalIcon } from 'lucide-react';
import { adminApi } from '../api';
import { confirmDialog } from '../confirm';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import useSortedTimezones from './useSortedTimezones';

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';

// Config per host kind. HC/VA live in the directors collection (role field); PCCs in their own.
const KINDS = {
  hc: { endpoint: '/admin/directors', listKey: 'directors', idKey: 'director_id', role: 'hc', label: 'health coach',
        blurb: 'Health Coaches — manual-book-only hosts. Never shown on the patient portal; pick them as the meeting host when booking manually.' },
  va: { endpoint: '/admin/directors', listKey: 'directors', idKey: 'director_id', role: 'va', label: 'VA',
        blurb: 'Virtual Assistants — manual-book-only hosts. Never shown on the patient portal; pick them as the meeting host when booking manually.' },
  pcc: { endpoint: '/admin/pccs', listKey: 'pccs', idKey: 'pcc_id', role: 'pcc', label: 'coordinator',
         blurb: 'Patient Care Coordinators — rota coordinators AND manual-book hosts. Give each a Google calendar to host a session; assign them to directors’ days on the Coordinators tab.' },
};

const emptyForm = () => ({ id: null, name: '', email: '', google_calendar_id: '', use_primary_calendar: false, pb_consultant_id: '', timezone: 'America/Los_Angeles', active: true });

export default function SimpleHostTab({ kind }) {
  const cfg = KINDS[kind];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const tzOptions = useSortedTimezones();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get(cfg.endpoint);
      let list = res.data[cfg.listKey] || [];
      if (kind !== 'pcc') list = list.filter((d) => d.role === cfg.role);
      setRows(list);
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [kind, cfg.endpoint, cfg.listKey, cfg.role]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(emptyForm()); setOpen(true); };
  const openEdit = (r) => {
    setForm({ id: r[cfg.idKey], name: r.name || '', email: r.email || '',
      google_calendar_id: r.google_calendar_id || '', use_primary_calendar: r.use_primary_calendar === true,
      pb_consultant_id: r.pb_consultant_id || '',
      timezone: r.timezone || 'America/Los_Angeles', active: r.active !== false });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.email.trim()) return toast.error('Email is required');
    const payload = {
      name: form.name.trim(), email: form.email.trim(),
      google_calendar_id: form.google_calendar_id.trim(), use_primary_calendar: form.use_primary_calendar,
      pb_consultant_id: form.pb_consultant_id.trim(),
      timezone: form.timezone, active: form.active,
    };
    if (kind !== 'pcc') payload.role = cfg.role;
    setSaving(true);
    try {
      if (form.id) await adminApi.put(`${cfg.endpoint}/${form.id}`, payload);
      else await adminApi.post(cfg.endpoint, payload);
      toast.success(form.id ? 'Saved' : 'Added');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (r) => {
    if (!(await confirmDialog({ title: `Deactivate ${r.name}?`, message: 'They stop appearing as a bookable host.', confirmLabel: 'Deactivate' }))) return;
    try { await adminApi.del(`${cfg.endpoint}/${r[cfg.idKey]}`); toast.success('Deactivated'); load(); }
    catch { toast.error('Deactivate failed'); }
  };
  const activate = async (r) => {
    try { await adminApi.put(`${cfg.endpoint}/${r[cfg.idKey]}`, { active: true }); toast.success('Activated'); load(); }
    catch { toast.error('Activate failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{cfg.blurb}</p>
        <Button size="sm" onClick={openNew}><Plus className="size-4" /> Add {cfg.label}</Button>
      </div>

      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
              <TableHead className={HEAD}>Name</TableHead>
              <TableHead className={HEAD}>Email</TableHead>
              <TableHead className={HEAD}>Calendar</TableHead>
              <TableHead className={HEAD}>Timezone</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={HEAD}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">None yet. Add one to pick them as a host in a manual booking.</TableCell></TableRow>
            ) : rows.map((r) => {
              const active = r.active !== false;
              return (
                <TableRow key={r[cfg.idKey]} className="cursor-pointer" onClick={() => openEdit(r)}>
                  <TableCell className={`${CELL} font-medium text-foreground`}>{r.name}</TableCell>
                  <TableCell className={`${CELL} text-muted-foreground`}>{r.email}</TableCell>
                  <TableCell className={CELL}>
                    {r.google_calendar_id
                      ? <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{r.google_calendar_id}</span>
                      : <span className="text-xs font-medium text-amber-700">Not set</span>}
                  </TableCell>
                  <TableCell className={`${CELL} text-muted-foreground`}>{r.timezone || '—'}</TableCell>
                  <TableCell className={CELL}><span className={`font-semibold ${active ? 'text-emerald-700' : 'text-red-700'}`}>{active ? 'Active' : 'Inactive'}</span></TableCell>
                  <TableCell className={CELL} onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8"><MoreHorizontalIcon /><span className="sr-only">Open menu</span></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}>Edit</DropdownMenuItem>
                        {active
                          ? <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deactivate(r)}>Deactivate</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => activate(r)}>Activate</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Drawer open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DrawerContent>
          <div className="mx-auto flex w-full max-w-lg flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>{form.id ? 'Edit' : 'Add'} {cfg.label}</DrawerTitle>
              <DrawerDescription>A host owns the Google Meet event on their own calendar. Give them a Workspace email + Google calendar so they can host a manually-booked session.</DrawerDescription>
            </DrawerHeader>
            <div className="space-y-4 px-4 pb-2">
              <div className="space-y-1.5"><Label htmlFor="h-name">Name</Label><Input id="h-name" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="h-email">Email</Label><Input id="h-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@drshumard.com" /></div>
              <div className="space-y-1.5"><Label htmlFor="h-cal">Google calendar ID</Label><Input id="h-cal" value={form.google_calendar_id} onChange={(e) => set('google_calendar_id', e.target.value)} placeholder="…@group.calendar.google.com" /></div>
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="h-primary">Use primary calendar</Label>
                  <p className="text-xs text-muted-foreground">
                    {form.google_calendar_id.trim()
                      ? 'Ignored while a shared calendar ID is set above.'
                      : 'No shared calendar? Bookings land on their own email calendar and it shows on the Team Calendar.'}
                  </p>
                </div>
                <Switch id="h-primary" checked={form.use_primary_calendar} onCheckedChange={(v) => set('use_primary_calendar', v)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-pbid">Practice Better consultant ID</Label>
                <Input id="h-pbid" value={form.pb_consultant_id} onChange={(e) => set('pb_consultant_id', e.target.value)} placeholder="asConsultantId from Practice Better" />
                <p className="text-xs text-muted-foreground">Set this and their manual bookings mirror into Practice Better under this consultant. Leave empty to skip PB for this host.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => set('timezone', v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                  <SelectContent>{tzOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DrawerFooter className="flex-row justify-end gap-2">
              <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
