import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Calendar as CalendarIcon, ChevronDownIcon } from 'lucide-react';
import { adminApi } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import useSortedTimezones from './useSortedTimezones';
import { HostColorPicker } from './hostColors';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index = day_of_week (0=Mon)
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromYMD = (s) => (s ? new Date(`${s}T00:00:00`) : undefined);
const fmtDateLabel = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Time-off helpers: split an ISO instant into a date (for the calendar) + a HH:MM time, and recombine.
const isoDate = (iso) => (iso ? new Date(iso) : undefined);
const isoTimeHM = (iso) => (iso ? `${pad2(new Date(iso).getHours())}:${pad2(new Date(iso).getMinutes())}` : '');
const fmtIsoDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const combineDateTime = (dateObj, timeStr) => {
  if (!dateObj) return '';
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  const d = new Date(dateObj);
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toISOString();
};

const EMPTY = { director_id: null, name: '', email: '', timezone: 'America/Los_Angeles', google_calendar_id: '', use_primary_calendar: false, pb_consultant_id: '', active: true, color: '', weekly_rules: [], time_off: [], date_overrides: [] };

const toForm = (d) => ({
  director_id: d.director_id, name: d.name || '', email: d.email || '', timezone: d.timezone || 'America/Los_Angeles',
  google_calendar_id: d.google_calendar_id || '', use_primary_calendar: d.use_primary_calendar === true,
  pb_consultant_id: d.pb_consultant_id || '', active: d.active !== false, color: d.color || '',
  weekly_rules: (d.weekly_rules || []).map((r) => ({ ...r })),
  time_off: (d.time_off || []).map((t) => ({ ...t })),
  date_overrides: (d.date_overrides || []).map((o) => ({ date: o.date || '', windows: (o.windows || []).map((w) => ({ ...w })) })),
});

export default function DirectorEditor() {
  const { directorId } = useParams();
  const navigate = useNavigate();
  const isNew = !directorId || directorId === 'new';
  const [form, setForm] = useState(isNew ? { ...EMPTY } : null);
  const [saving, setSaving] = useState(false);
  const tzOptions = useSortedTimezones();

  const backToList = useCallback(() => navigate('/admin/scheduling/hosts'), [navigate]);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    (async () => {
      try {
        const res = await adminApi.get('/admin/directors');
        const d = (res.data.directors || []).find((x) => x.director_id === directorId);
        if (!alive) return;
        if (!d) { toast.error('Director not found'); backToList(); return; }
        setForm(toForm(d));
      } catch (e) {
        if (!alive) return;
        toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load director');
        backToList();
      }
    })();
    return () => { alive = false; };
  }, [directorId, isNew, backToList]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addRuleForDay = (dow) => setField('weekly_rules', [...form.weekly_rules, { day_of_week: dow, start: '09:00', end: '17:00' }]);
  const updateRule = (i, k, v) => setField('weekly_rules', form.weekly_rules.map((r, idx) => idx === i ? { ...r, [k]: k === 'day_of_week' ? Number(v) : v } : r));
  const removeRule = (i) => setField('weekly_rules', form.weekly_rules.filter((_, idx) => idx !== i));

  const addTimeOff = () => setField('time_off', [...form.time_off, { start_utc: '', end_utc: '', reason: '' }]);
  const updateTimeOff = (i, k, v) => setField('time_off', form.time_off.map((t, idx) => idx === i ? { ...t, [k]: v } : t));
  const removeTimeOff = (i) => setField('time_off', form.time_off.filter((_, idx) => idx !== i));

  const addOverride = () => setField('date_overrides', [...form.date_overrides, { date: '', windows: [{ start: '09:00', end: '17:00' }] }]);
  const updateOverride = (i, k, v) => setField('date_overrides', form.date_overrides.map((o, idx) => idx === i ? { ...o, [k]: v } : o));
  const removeOverride = (i) => setField('date_overrides', form.date_overrides.filter((_, idx) => idx !== i));
  const addOverrideWindow = (i) => setField('date_overrides', form.date_overrides.map((o, idx) => idx === i ? { ...o, windows: [...(o.windows || []), { start: '09:00', end: '12:00' }] } : o));
  const updateOverrideWindow = (i, wi, k, v) => setField('date_overrides', form.date_overrides.map((o, idx) => idx === i ? { ...o, windows: o.windows.map((w, j) => j === wi ? { ...w, [k]: v } : w) } : o));
  const removeOverrideWindow = (i, wi) => setField('date_overrides', form.date_overrides.map((o, idx) => idx === i ? { ...o, windows: o.windows.filter((_, j) => j !== wi) } : o));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    for (const r of form.weekly_rules) {
      if (!r.start || !r.end || r.end <= r.start) { toast.error('Each weekly rule needs start before end'); return; }
    }
    for (const o of form.date_overrides) {
      if (!o.date) { toast.error('Each date override needs a date'); return; }
      for (const w of (o.windows || [])) {
        if (!w.start || !w.end || w.end <= w.start) { toast.error('Override hours need start before end'); return; }
      }
    }
    const payload = {
      name: form.name.trim(), role: 'director', email: (form.email || '').trim(), timezone: form.timezone.trim(),
      google_calendar_id: form.google_calendar_id.trim(),
      use_primary_calendar: form.use_primary_calendar,
      pb_consultant_id: (form.pb_consultant_id || '').trim(),
      active: form.active,
      color: form.color || '',
      weekly_rules: form.weekly_rules.map((r) => ({ day_of_week: Number(r.day_of_week), start: r.start, end: r.end })),
      time_off: form.time_off.filter((t) => t.start_utc && t.end_utc).map((t) => ({ start_utc: t.start_utc, end_utc: t.end_utc, reason: t.reason || '' })),
      date_overrides: form.date_overrides.filter((o) => o.date).map((o) => ({ date: o.date, windows: (o.windows || []).map((w) => ({ start: w.start, end: w.end })) })),
    };
    setSaving(true);
    try {
      if (form.director_id) await adminApi.put(`/admin/directors/${form.director_id}`, payload);
      else await adminApi.post('/admin/directors', payload);
      toast.success(form.director_id ? 'Director updated' : 'Director created');
      backToList();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  if (!form) {
    return <div className="py-16 text-center text-muted-foreground">Loading director…</div>;
  }

  const weekdays = [0, 1, 2, 3, 4].concat([5, 6].filter((d) => form.weekly_rules.some((r) => Number(r.day_of_week) === d)));

  return (
    <div className="mx-auto w-full max-w-4xl 2xl:max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={backToList} className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" /> Directors
          </button>
          <h2 className="text-xl font-semibold text-foreground">{isNew ? 'Add director' : (form.name || 'Edit director')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Availability rules, time off, and the Google calendar bookings write to.</p>
        </div>
        <div className="flex items-center gap-3 self-center rounded-lg border bg-card px-3 py-2">
          <Label htmlFor="d-active" className="cursor-pointer text-sm font-normal">Active for new bookings</Label>
          <Switch id="d-active" checked={form.active} onCheckedChange={(v) => setField('active', v)} />
        </div>
      </div>

      <div className="mt-6 space-y-5 pb-4">
        {/* Profile */}
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <p className={EYEBROW}>Profile</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-name">Name</Label>
              <Input id="d-name" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Dr. Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-tz">Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => setField('timezone', v)}>
                <SelectTrigger id="d-tz" className="w-full"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                <SelectContent>
                  {tzOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Calendar color</Label>
              <HostColorPicker value={form.color} onChange={(v) => setField('color', v)} />
              <p className="text-xs text-muted-foreground">Their events and availability on the Team Calendar. Auto picks an unused color.</p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="d-email">Email</Label>
              <Input id="d-email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="director@drshumard.com" />
              <p className="text-xs text-muted-foreground">Their Google Workspace email — added to every booking as an attendee and made a Meet co-host, so they can run the call.</p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="d-cal">Google calendar ID</Label>
              <Input id="d-cal" value={form.google_calendar_id} onChange={(e) => setField('google_calendar_id', e.target.value)} placeholder="address@group.calendar.google.com" />
              <p className="text-xs text-muted-foreground">The dedicated calendar bookings + holidays write to. Paste it here when ready.</p>
            </div>
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3 md:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="d-primary">Use primary calendar</Label>
                <p className="text-xs text-muted-foreground">
                  {form.google_calendar_id.trim()
                    ? 'Ignored while a shared calendar ID is set above.'
                    : 'No shared calendar? Bookings land on their own email calendar and it shows on the Team Calendar.'}
                </p>
              </div>
              <Switch id="d-primary" checked={form.use_primary_calendar} onCheckedChange={(v) => setField('use_primary_calendar', v)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="d-pbid">Practice Better consultant ID</Label>
              <Input id="d-pbid" value={form.pb_consultant_id} onChange={(e) => setField('pb_consultant_id', e.target.value)} placeholder="This director's PB consultant (asConsultantId)" />
              <p className="text-xs text-muted-foreground">Used in <strong className="text-foreground">Per Director</strong> routing (Settings tab) — bookings assigned to this director are recorded under this PB consultant.</p>
            </div>
          </div>
        </section>

        {/* Weekly availability */}
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <p className={EYEBROW}>Weekly availability</p>
          <p className="mt-1 text-xs text-muted-foreground">Hours repeat every week in the director&apos;s timezone. Stack ranges for a lunch break.</p>
          <div className="mt-3 divide-y">
            {weekdays.map((dow) => {
              const dayName = DOW[dow];
              const dayRules = form.weekly_rules.map((r, idx) => ({ r, idx })).filter(({ r }) => Number(r.day_of_week) === dow);
              return (
                <div key={dow} className="flex items-start gap-3 py-2.5">
                  <div className="w-10 pt-2 text-sm font-semibold">{dayName}</div>
                  <div className="flex-1 space-y-2">
                    {dayRules.length === 0 ? (
                      <span className="inline-block pt-2 text-sm text-muted-foreground">Unavailable</span>
                    ) : dayRules.map(({ r, idx }) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input type="time" value={r.start} onChange={(e) => updateRule(idx, 'start', e.target.value)} className="w-[116px]" />
                        <span className="text-muted-foreground">to</span>
                        <Input type="time" value={r.end} onChange={(e) => updateRule(idx, 'end', e.target.value)} className="w-[116px]" />
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeRule(idx)}><Trash2 className="size-4" /></Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => addRuleForDay(dow)}><Plus className="size-3.5" /> Add hours</Button>
                </div>
              );
            })}
          </div>
          {(![5, 6].every((d) => form.weekly_rules.some((r) => Number(r.day_of_week) === d))) && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {!form.weekly_rules.some((r) => Number(r.day_of_week) === 5) && (
                <Button variant="outline" size="sm" onClick={() => addRuleForDay(5)}><Plus className="size-3.5" /> Add Saturday</Button>
              )}
              {!form.weekly_rules.some((r) => Number(r.day_of_week) === 6) && (
                <Button variant="outline" size="sm" onClick={() => addRuleForDay(6)}><Plus className="size-3.5" /> Add Sunday</Button>
              )}
            </div>
          )}
        </section>

        {/* Time off */}
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className={EYEBROW}>Time off</p>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={addTimeOff}><Plus className="size-3.5" /> Add</Button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {form.time_off.length === 0 && <p className="text-xs text-muted-foreground">No time off scheduled.</p>}
            {form.time_off.map((t, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Period {i + 1}</span>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removeTimeOff(i)}><Trash2 className="size-4" /></Button>
                </div>
                {['start_utc', 'end_utc'].map((fld) => (
                  <div key={fld} className="flex items-center gap-2">
                    <span className="w-9 text-xs text-muted-foreground">{fld === 'start_utc' ? 'From' : 'To'}</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('flex-1 justify-between font-normal', !t[fld] && 'text-muted-foreground')}>
                          {t[fld] ? fmtIsoDate(t[fld]) : 'Date'}
                          <ChevronDownIcon className="size-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                        <Calendar mode="single" captionLayout="dropdown" selected={isoDate(t[fld])} defaultMonth={isoDate(t[fld])} onSelect={(d) => d && updateTimeOff(i, fld, combineDateTime(d, isoTimeHM(t[fld]) || '09:00'))} />
                      </PopoverContent>
                    </Popover>
                    <Input type="time" value={isoTimeHM(t[fld])} onChange={(e) => updateTimeOff(i, fld, combineDateTime(isoDate(t[fld]) || new Date(), e.target.value))} className="w-28 [&::-webkit-calendar-picker-indicator]:hidden" />
                  </div>
                ))}
                <Input value={t.reason || ''} onChange={(e) => updateTimeOff(i, 'reason', e.target.value)} placeholder="Reason (optional)" />
              </div>
            ))}
          </div>
        </section>

        {/* Date overrides */}
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className={EYEBROW}>Date overrides</p>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={addOverride}><Plus className="size-3.5" /> Add</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Override the weekly hours for a specific date. No hours = off that day; it supersedes the weekly rule.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {form.date_overrides.length === 0 && <p className="text-xs text-muted-foreground">No date overrides.</p>}
            {form.date_overrides.map((o, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-[185px] justify-start text-left font-normal', !o.date && 'text-muted-foreground')}>
                        <CalendarIcon className="size-4" />
                        {o.date ? fmtDateLabel(o.date) : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={fromYMD(o.date)} onSelect={(d) => d && updateOverride(i, 'date', toYMD(d))} />
                    </PopoverContent>
                  </Popover>
                  <span className={(o.windows || []).length === 0 ? 'text-xs font-medium text-red-700' : 'text-xs font-medium text-emerald-700'}>
                    {(o.windows || []).length === 0 ? 'Off this day' : 'Custom hours'}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => addOverrideWindow(i)}><Plus className="size-3.5" /> Add hours</Button>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeOverride(i)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                {(o.windows || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Marked unavailable. Add hours to make it a partial day instead.</p>
                ) : (
                  <div className="space-y-2">
                    {o.windows.map((w, wi) => (
                      <div key={wi} className="flex items-center gap-2">
                        <Input type="time" value={w.start} onChange={(e) => updateOverrideWindow(i, wi, 'start', e.target.value)} className="w-[116px]" />
                        <span className="text-muted-foreground">to</span>
                        <Input type="time" value={w.end} onChange={(e) => updateOverrideWindow(i, wi, 'end', e.target.value)} className="w-[116px]" />
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeOverrideWindow(i, wi)}><Trash2 className="size-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sticky action bar — always reachable no matter how long the page grows */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <Button variant="outline" onClick={backToList} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save director'}</Button>
      </div>
    </div>
  );
}
