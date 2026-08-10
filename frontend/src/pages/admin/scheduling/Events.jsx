import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, Globe, Lock, MoreHorizontalIcon } from 'lucide-react';
import { adminApi, authHeaders } from '../api';
import { confirmDialog } from '../confirm';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function NumField({ label, value, onChange, min, max, suffix, help }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="w-24" aria-label={suffix ? `${label} (${suffix})` : label} />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

const normalizeSessions = (list) => list.map((x) => ({
  id: x.id, title: (x.title || '').trim(), description: x.description || '',
  duration_minutes: Number(x.duration_minutes) || 30, portal_visible: !!x.portal_visible,
  pb_service_id: (x.pb_service_id || '').trim(),
}));

export default function Events() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  // Session edit drawer
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);      // draft session being edited
  const [editIndex, setEditIndex] = useState(null); // null = adding new
  const [savingSession, setSavingSession] = useState(false);

  useEffect(() => {
    adminApi.get('/admin/settings').then((res) => setS(res.data))
      .catch((e) => toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load settings'));
  }, []);

  if (!s) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const closures = s.clinic_closures || [];
  const setClosures = (next) => set('clinic_closures', next);
  const sessions = s.sessions || [];

  const openNew = () => {
    setEditIndex(null);
    setForm({ id: newId(), title: '', description: '', duration_minutes: 30, portal_visible: false, pb_service_id: '' });
    setOpen(true);
  };
  const openEdit = (i) => { setEditIndex(i); setForm({ ...sessions[i] }); setOpen(true); };
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Sessions persist on their own (drawer save / delete); rules + closures use the page button.
  const persistSessions = async (next, okMsg) => {
    const res = await adminApi.put('/admin/settings', { sessions: normalizeSessions(next) });
    setS(res.data);
    toast.success(okMsg);
  };

  const saveSession = async () => {
    if (!(form.title || '').trim()) { toast.error('The event needs a name'); return; }
    setSavingSession(true);
    try {
      const next = editIndex == null ? [...sessions, form] : sessions.map((x, i) => (i === editIndex ? form : x));
      await persistSessions(next, editIndex == null ? 'Event added' : 'Event saved');
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSavingSession(false); }
  };

  const deleteSession = async (i) => {
    const sess = sessions[i];
    const ok = await confirmDialog({
      title: `Delete “${sess.title || 'this event'}”?`,
      message: 'It disappears from the portal and manual booking. Existing bookings are not touched.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await persistSessions(sessions.filter((_, idx) => idx !== i), 'Event deleted');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Delete failed');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        slot_minutes: Number(s.slot_minutes), min_notice_minutes: Number(s.min_notice_minutes),
        max_advance_days: Number(s.max_advance_days), buffer_minutes: Number(s.buffer_minutes),
        availability_days: Number(s.availability_days),
        clinic_closures: closures.filter((c) => c.start_utc && c.end_utc)
          .map((c) => ({ start_utc: c.start_utc, end_utc: c.end_utc, reason: c.reason || '' })),
      };
      const res = await adminApi.put('/admin/settings', payload);
      setS(res.data);
      toast.success('Availability saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const base = process.env.REACT_APP_BACKEND_URL + '/api/booking/availability';
      const res = await axios.get(base, { params: { start_date: today, days: 14 }, headers: authHeaders() });
      setPreview(res.data);
    } catch { toast.error('Preview failed'); } finally { setPreviewing(false); }
  };

  return (
    <div className="space-y-6">
      {/* Events list */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className={EYEBROW}>Events</p>
          <Button size="sm" onClick={openNew}><Plus className="size-4" /> Add event</Button>
        </div>
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
                <TableHead className={`${HEAD} text-left`}>Name</TableHead>
                <TableHead className={HEAD}>Duration</TableHead>
                <TableHead className={HEAD}>Booking</TableHead>
                <TableHead className={HEAD}>PB service</TableHead>
                <TableHead className={HEAD}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No events yet. Add one to start taking bookings.</TableCell></TableRow>
              ) : sessions.map((sess, i) => (
                <TableRow key={sess.id || i} className="cursor-pointer" onClick={() => openEdit(i)}>
                  <TableCell className={`${CELL} max-w-[320px] text-left`}>
                    <div className="truncate font-medium text-foreground">{sess.title || <span className="text-muted-foreground">Untitled</span>}</div>
                    {sess.description && <div className="truncate text-xs text-muted-foreground">{sess.description}</div>}
                  </TableCell>
                  <TableCell className={`${CELL} whitespace-nowrap text-muted-foreground`}>{sess.duration_minutes ?? 30} min</TableCell>
                  <TableCell className={CELL}>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${sess.portal_visible ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                      {sess.portal_visible ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
                      {sess.portal_visible ? 'Portal' : 'Manual only'}
                    </span>
                  </TableCell>
                  <TableCell className={CELL}>
                    {sess.pb_service_id
                      ? <span className="mx-auto block max-w-[160px] truncate text-xs text-muted-foreground">{sess.pb_service_id}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`${CELL} text-center`} onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontalIcon />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(i)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteSession(i)}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Booking rules */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <p className={EYEBROW}>Booking rules</p>
        <p className="mt-1 text-sm text-muted-foreground">How the patient calendar offers and limits online slots.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumField label="Slot length" value={s.slot_minutes} onChange={(v) => set('slot_minutes', v)} min={5} max={240} suffix="min" help="How often a start time is offered" />
          <NumField label="Minimum notice" value={s.min_notice_minutes} onChange={(v) => set('min_notice_minutes', v)} min={0} suffix="min" help="Earliest bookable lead time" />
          <NumField label="Max advance" value={s.max_advance_days} onChange={(v) => set('max_advance_days', v)} min={1} max={365} suffix="days" />
          <NumField label="Buffer after call" value={s.buffer_minutes} onChange={(v) => set('buffer_minutes', v)} min={0} suffix="min" />
          <NumField label="Patient booking window" value={s.availability_days} onChange={(v) => set('availability_days', v)} min={1} max={90} suffix="days" help="Days shown on the patient calendar" />
        </div>
      </section>

      {/* Clinic closures */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className={EYEBROW}>Clinic closures</p>
            <p className="mt-1 text-sm text-muted-foreground">Org-wide blocks (holidays) that close every director.</p>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setClosures([...closures, { start_utc: '', end_utc: '', reason: '' }])}>
            <Plus className="size-3.5" /> Add closure
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {closures.length === 0 && <p className="text-xs text-muted-foreground">No closures.</p>}
          {closures.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input type="datetime-local" value={isoToLocalInput(c.start_utc)} className="w-[205px]"
                onChange={(e) => setClosures(closures.map((x, idx) => idx === i ? { ...x, start_utc: localInputToIso(e.target.value) } : x))} />
              <span className="text-muted-foreground">to</span>
              <Input type="datetime-local" value={isoToLocalInput(c.end_utc)} className="w-[205px]"
                onChange={(e) => setClosures(closures.map((x, idx) => idx === i ? { ...x, end_utc: localInputToIso(e.target.value) } : x))} />
              <Input value={c.reason || ''} placeholder="Reason" className="min-w-[120px] flex-1"
                onChange={(e) => setClosures(closures.map((x, idx) => idx === i ? { ...x, reason: e.target.value } : x))} />
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Remove closure" onClick={() => setClosures(closures.filter((_, idx) => idx !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save availability'}</Button>
        <Button variant="outline" onClick={runPreview} disabled={previewing}><Eye className="size-4" /> {previewing ? 'Loading...' : 'Preview next 14 days'}</Button>
      </div>

      {preview && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <p className={EYEBROW}>Preview</p>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">Reflects the currently active engine. Switch the engine to &quot;local&quot; under Settings to preview the portal&apos;s own availability.</p>
          {(preview.dates_with_availability || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No available times in the next 14 days.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-foreground">
                <span className="font-semibold">{(preview.dates_with_availability || []).length}</span> day(s) with availability ·{' '}
                <span className="font-semibold">{(preview.slots || []).length}</span> slot(s)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(preview.slots || []).slice(0, 24).map((slot, i) => (
                  <span key={i} className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    {new Date(slot.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                ))}
                {(preview.slots || []).length > 24 && <span className="self-center text-xs text-muted-foreground">+{preview.slots.length - 24} more</span>}
              </div>
            </>
          )}
        </section>
      )}

      {/* Add / edit event drawer */}
      <Drawer open={open} onOpenChange={(o) => { if (!savingSession) setOpen(o); }}>
        <DrawerContent>
          <div className="mx-auto flex w-full max-w-lg flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>{editIndex == null ? 'Add event' : 'Edit event'}</DrawerTitle>
              <DrawerDescription>Events are the session types patients (or admins) can book.</DrawerDescription>
            </DrawerHeader>
            {form && (
              <div className="space-y-4 px-4 pb-2">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ev-title">Name</Label>
                    <Input id="ev-title" value={form.title || ''} onChange={(e) => setF('title', e.target.value)} placeholder="Strategy Session" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-dur">Duration (min)</Label>
                    <Input id="ev-dur" type="number" min={5} max={240} value={form.duration_minutes ?? 30} onChange={(e) => setF('duration_minutes', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-desc">Description</Label>
                  <Textarea id="ev-desc" rows={2} value={form.description || ''} onChange={(e) => setF('description', e.target.value)} placeholder="Shown on the Google event and in patient emails" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-svc">Practice Better service ID</Label>
                  <Input id="ev-svc" value={form.pb_service_id || ''} onChange={(e) => setF('pb_service_id', e.target.value)} placeholder="Optional" />
                  <p className="text-xs text-muted-foreground">PB service this event records under.</p>
                </div>
                <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <Switch id="ev-pv" checked={!!form.portal_visible} onCheckedChange={(v) => setF('portal_visible', v)} />
                  <Label htmlFor="ev-pv" className="cursor-pointer font-normal">
                    {form.portal_visible ? 'Bookable on the patient portal' : 'Manual booking only (hidden from the portal)'}
                  </Label>
                </div>
              </div>
            )}
            <DrawerFooter className="flex-row justify-end gap-2">
              <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
              <Button onClick={saveSession} disabled={savingSession}>{savingSession ? 'Saving...' : 'Save event'}</Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
