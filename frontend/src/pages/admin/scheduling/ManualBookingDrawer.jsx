import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDownIcon, ChevronsUpDown } from 'lucide-react';
import { adminApi } from '../api';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import useSortedTimezones, { zonedWallTimeToUtcIso } from './useSortedTimezones';

const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDateLabel = (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '');
const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const emptyForm = () => ({ session_id: '', director_id: '', date: '', time: '09:00', timezone: BROWSER_TZ, user_id: '', first_name: '', last_name: '', email: '', phone: '', notes: '', send_email: true });

// Searchable patient picker backed by the Practice Better client cache (server-side search).
function PatientCombobox({ email, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    const t = setTimeout(() => {
      adminApi.get('/admin/pb-clients', { search: q, limit: 20 })
        .then((r) => { if (active) setClients(r.data.clients || []); })
        .catch(() => { if (active) setClients([]); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [q, open]);

  return (
    // modal: takes over vaul's scroll lock so the list is wheel/touch scrollable; fixed
    // side + no collision flip so the dropdown always opens downward.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-full justify-between font-normal', !email && 'text-muted-foreground')}>
          {email || 'Search patient by name or email'}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" avoidCollisions={false} className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search Practice Better clients..." value={q} onValueChange={setQ} />
          <CommandList className="max-h-60 overscroll-contain">
            {loading && <div className="py-4 text-center text-sm text-muted-foreground">Searching...</div>}
            {!loading && clients.length === 0 && <CommandEmpty>No clients found.</CommandEmpty>}
            {clients.map((c) => (
              <CommandItem key={c.record_id} value={c.record_id} onSelect={() => { onSelect(c); setOpen(false); }}>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'}</span>
                  <span className="text-xs text-muted-foreground">{c.email}</span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ManualBookingDrawer({ open, onOpenChange, onCreated }) {
  const [sessions, setSessions] = useState([]);
  const [directors, setDirectors] = useState([]);
  const [pccs, setPccs] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const tzOptions = useSortedTimezones();

  useEffect(() => {
    if (!open) return;
    adminApi.get('/admin/settings').then((r) => setSessions(r.data.sessions || [])).catch(() => {});
    adminApi.get('/admin/directors').then((r) => setDirectors((r.data.directors || []).filter((d) => d.active !== false))).catch(() => {});
    adminApi.get('/admin/pccs').then((r) => setPccs((r.data.pccs || []).filter((p) => p.active !== false))).catch(() => {});
  }, [open]);

  // Any host with a Google calendar can host a manual session; grouped by role. Only "Directors"
  // are shown to patients on the portal — the others are manual-book-only. The chosen id is sent as
  // director_id; the backend resolves it from either the directors or pccs collection.
  const hostGroups = (() => {
    const hasCal = (h) => (h.google_calendar_id || '').trim();
    const dirs = directors.filter(hasCal);
    const groups = [
      { key: 'director', label: 'Directors', items: dirs.filter((d) => (d.role || 'director') === 'director').map((d) => ({ id: d.director_id, name: d.name })) },
      { key: 'pcc', label: 'PCCs', items: pccs.filter(hasCal).map((p) => ({ id: p.pcc_id, name: p.name })) },
      { key: 'hc', label: 'Health Coaches', items: dirs.filter((d) => d.role === 'hc').map((d) => ({ id: d.director_id, name: d.name })) },
      { key: 'va', label: 'VAs', items: dirs.filter((d) => d.role === 'va').map((d) => ({ id: d.director_id, name: d.name })) },
    ];
    return groups.filter((g) => g.items.length);
  })();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickPatient = (c) => {
    setForm((f) => ({
      ...f, email: c.email || '', user_id: '',
      first_name: c.first_name || '', last_name: c.last_name || '',
      phone: c.phone || '',
    }));
  };

  const submit = async () => {
    if (!form.session_id) return toast.error('Choose a session');
    if (!form.director_id) return toast.error('Choose a host');
    if (!form.date) return toast.error('Pick a date');
    if (!form.email) return toast.error('Select a patient');
    const slotIso = zonedWallTimeToUtcIso(form.date, form.time || '09:00', form.timezone);
    if (!slotIso) return toast.error('Invalid date or time');
    setSaving(true);
    try {
      await adminApi.post('/admin/bookings', {
        session_id: form.session_id, director_id: form.director_id, slot_start_utc: slotIso,
        patient: {
          first_name: (form.first_name || '').trim(), last_name: (form.last_name || '').trim(),
          email: form.email.trim(), phone: (form.phone || '').trim() || null,
        },
        patient_timezone: form.timezone, notes: form.notes.trim() || null, send_email: form.send_email,
      });
      toast.success('Booking created');
      onCreated?.();
      onOpenChange(false);
      setForm(emptyForm());
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not create booking');
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          <DrawerHeader className="text-left">
            <DrawerTitle>New booking</DrawerTitle>
            <DrawerDescription>Manually book a patient into a session with any host. Creates the host&apos;s calendar event + Meet link, mirrors directors to Practice Better, and (if enabled) emails the patient.</DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[66vh] space-y-4 overflow-y-auto px-4 pb-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Session</Label>
                <Select value={form.session_id || undefined} onValueChange={(v) => set('session_id', v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose session" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title} · {s.duration_minutes}m</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Host</Label>
                <Select value={form.director_id || undefined} onValueChange={(v) => set('director_id', v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose host" /></SelectTrigger>
                  <SelectContent>
                    {hostGroups.map((g) => (
                      <SelectGroup key={g.key}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.items.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => set('timezone', v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                <SelectContent>
                  {tzOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Defaults to your timezone — change it to the patient&apos;s. The date and time below are in this zone.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-between font-normal', !form.date && 'text-muted-foreground')}>
                      {form.date ? fmtDateLabel(form.date) : 'Pick a date'}
                      <ChevronDownIcon className="size-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                    <Calendar mode="single" selected={form.date ? new Date(`${form.date}T12:00:00`) : undefined} defaultMonth={form.date ? new Date(`${form.date}T12:00:00`) : undefined} onSelect={(d) => d && set('date', toYMD(d))} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-time">Time</Label>
                <Input id="mb-time" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className="[&::-webkit-calendar-picker-indicator]:hidden" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Patient</Label>
              <PatientCombobox email={form.email} onSelect={pickPatient} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="mb-fn">First name</Label><Input id="mb-fn" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="mb-ln">Last name</Label><Input id="mb-ln" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="mb-ph">Phone</Label><Input id="mb-ph" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Optional" /></div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mb-notes">Notes</Label>
              <Textarea id="mb-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional agenda or internal notes" />
            </div>

            <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <Switch id="mb-send" checked={form.send_email} onCheckedChange={(v) => set('send_email', v)} />
              <Label htmlFor="mb-send" className="cursor-pointer font-normal">Email the patient a confirmation with the Meet link</Label>
            </div>
          </div>

          <DrawerFooter className="flex-row justify-end gap-2">
            <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
            <Button onClick={submit} disabled={saving}>{saving ? 'Booking...' : 'Create booking'}</Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
