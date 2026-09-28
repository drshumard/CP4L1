import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Check, CircleAlert, Copy, Plus, Trash2 } from 'lucide-react';
import { adminApi } from '../api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { US_TIMEZONES } from '../usTimezones';
import useSortedTimezones from './useSortedTimezones';
import { HostColorPicker } from './hostColors';
import { AdminSelect, keepSheetOpen } from '../workspace-ui';
import s from './team.module.css';

// One editor for every host (design: prototype hosts/page.tsx). Directors get Availability + Time off tabs — the portal
// books them from their weekly rules; PCCs / HCs / VA are manual-book-only hosts, so they only have details.
// Directors, HCs and VAs are saved to /admin/directors (by role); PCCs to /admin/pccs.

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; // index = day_of_week (0=Mon)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Time off is stored as UTC instants; the editor reads and writes them as this device's wall clock, as it always has.
const localIso = (date, time) => {
  const d = new Date(`${date}T${time || '09:00'}:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};
const fmtDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtClock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtYmd = (ymd) => (ymd ? fmtDay(new Date(`${ymd}T12:00:00`)) : 'An override');
function periodLabel(t) {
  const a = new Date(t.start_utc);
  const b = new Date(t.end_utc);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'Dates not set';
  return toYMD(a) === toYMD(b)
    ? `${fmtDay(a)} · ${fmtClock(a)} – ${fmtClock(b)}`
    : `${fmtDay(a)}, ${fmtClock(a)} – ${fmtDay(b)}, ${fmtClock(b)}`;
}
// "Pacific time" for the US zones the team works in, else the zone's city.
export const zoneLabel = (tz) => {
  const us = US_TIMEZONES.find((z) => z.value === tz);
  if (us) return `${us.label.split(' — ')[0]} time`;
  return tz ? `${tz.split('/').pop().replace(/_/g, ' ')} time` : '—';
};
const deviceZone = () => {
  try { return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || ''; }
  catch { return ''; }
};
// FastAPI 422s carry a list of problems, not a string.
const errorText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return Array.isArray(d) && d.length ? d.map((x) => x?.msg || String(x)).join(' · ') : fallback;
};

const toForm = (h, role) => ({
  id: h ? (role === 'pcc' ? h.pcc_id : h.director_id) : null,
  name: h?.name || '', email: h?.email || '', timezone: h?.timezone || 'America/Los_Angeles',
  google_calendar_id: h?.google_calendar_id || '', use_primary_calendar: h?.use_primary_calendar === true,
  pb_consultant_id: h?.pb_consultant_id || '', active: h ? h.active !== false : true, color: h?.color || '',
  weekly_rules: (h?.weekly_rules || []).map((r) => ({ ...r })),
  time_off: (h?.time_off || []).map((t) => ({ ...t })),
  date_overrides: (h?.date_overrides || []).map((o) => ({ date: o.date || '', windows: (o.windows || []).map((w) => ({ ...w })) })),
});
const emptyOff = () => { const today = toYMD(new Date()); return { startDate: today, startTime: '09:00', endDate: today, endTime: '17:00', reason: '' }; };

// target: { role: 'director' | 'pcc' | 'hc' | 'va', host (null = new), tab } — null while closed.
export default function HostSheet({ target, singular, onClose, onSaved }) {
  const tzOptions = useSortedTimezones();
  const [form, setForm] = useState(null);
  const [role, setRole] = useState('director');
  const [tab, setTab] = useState('profile');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [off, setOff] = useState(emptyOff);
  const [offError, setOffError] = useState('');

  // Fresh form on every open; keep the last one while closing so the sheet slides out with its content.
  useEffect(() => {
    if (!target) return;
    setForm(toForm(target.host, target.role));
    setRole(target.role);
    setTab(target.role === 'director' ? target.tab || 'profile' : 'profile');
    setTitle(target.host ? target.host.name : `Add ${singular}`);
    setError(''); setOff(emptyOff()); setOffError('');
  }, [target, singular]);

  const isDirector = role === 'director';
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setList = (k, fn) => setForm((f) => ({ ...f, [k]: fn(f[k]) }));

  // Weekly hours: rules are flat { day_of_week, start, end } — several per day for split shifts.
  const addRule = (d) => setList('weekly_rules', (l) => [...l, { day_of_week: d, start: '09:00', end: '17:00' }]);
  const updateRule = (idx, k, v) => setList('weekly_rules', (l) => l.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  const removeRule = (idx) => setList('weekly_rules', (l) => l.filter((_, i) => i !== idx));
  const clearDay = (d) => setList('weekly_rules', (l) => l.filter((r) => Number(r.day_of_week) !== d));
  const copyMonday = () => setList('weekly_rules', (l) => {
    const monday = l.filter((r) => Number(r.day_of_week) === 0);
    const kept = l.filter((r) => ![1, 2, 3, 4].includes(Number(r.day_of_week)));
    return [...kept, ...[1, 2, 3, 4].flatMap((d) => monday.map((r) => ({ day_of_week: d, start: r.start, end: r.end })))];
  });

  const addOverride = () => setList('date_overrides', (l) => [...l, { date: '', windows: [{ start: '09:00', end: '17:00' }] }]);
  const updateOverride = (i, patch) => setList('date_overrides', (l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const removeOverride = (i) => setList('date_overrides', (l) => l.filter((_, j) => j !== i));
  const addWindow = (i) => setList('date_overrides', (l) => l.map((o, j) => (j === i ? { ...o, windows: [...(o.windows || []), { start: '09:00', end: '12:00' }] } : o)));
  const updateWindow = (i, wi, k, v) => setList('date_overrides', (l) => l.map((o, j) => (j === i ? { ...o, windows: o.windows.map((w, x) => (x === wi ? { ...w, [k]: v } : w)) } : o)));
  const removeWindow = (i, wi) => setList('date_overrides', (l) => l.map((o, j) => (j === i ? { ...o, windows: o.windows.filter((_, x) => x !== wi) } : o)));

  const addTimeOff = () => {
    const start = localIso(off.startDate, off.startTime);
    const end = localIso(off.endDate, off.endTime);
    if (!off.startDate || !off.endDate || !start || !end) { setOffError('Choose when the time off starts and ends.'); return; }
    if (end <= start) { setOffError('The end must be after the start.'); return; }
    setList('time_off', (l) => [...l, { start_utc: start, end_utc: end, reason: off.reason.trim() }]);
    setOff((o) => ({ ...o, reason: '' }));
    setOffError('');
  };
  const removeTimeOff = (idx) => setList('time_off', (l) => l.filter((_, i) => i !== idx));

  const save = async (e) => {
    e.preventDefault();
    const fail = (msg, where = 'profile') => { setError(msg); setTab(where); };
    const email = form.email.trim();
    if (!form.name.trim()) return fail('Name is required.');
    if (!isDirector && !email) return fail('Email is required.');
    if (email && !EMAIL_RE.test(email)) return fail('Enter a valid email address.');
    if (isDirector) {
      const bad = form.weekly_rules.find((r) => !r.start || !r.end || r.end <= r.start);
      if (bad) return fail(`${DAYS[Number(bad.day_of_week)] || 'A day'}: the end time must be later than the start time.`, 'availability');
      if (form.date_overrides.some((o) => !o.date)) return fail('Each date override needs a date.', 'availability');
      const badDay = form.date_overrides.find((o) => (o.windows || []).some((w) => !w.start || !w.end || w.end <= w.start));
      if (badDay) return fail(`${fmtYmd(badDay.date)}: override hours need a start before the end.`, 'availability');
    }
    const base = {
      name: form.name.trim(), email, timezone: form.timezone.trim(),
      google_calendar_id: form.google_calendar_id.trim(), use_primary_calendar: form.use_primary_calendar,
      pb_consultant_id: (form.pb_consultant_id || '').trim(), active: form.active, color: form.color || '',
    };
    const payload = isDirector ? {
      ...base, role: 'director',
      weekly_rules: form.weekly_rules.map((r) => ({ day_of_week: Number(r.day_of_week), start: r.start, end: r.end })),
      time_off: form.time_off.filter((t) => t.start_utc && t.end_utc).map((t) => ({ start_utc: t.start_utc, end_utc: t.end_utc, reason: t.reason || '' })),
      date_overrides: form.date_overrides.filter((o) => o.date).map((o) => ({ date: o.date, windows: (o.windows || []).map((w) => ({ start: w.start, end: w.end })) })),
    } : role === 'pcc' ? base : { ...base, role };
    const endpoint = role === 'pcc' ? '/admin/pccs' : '/admin/directors';
    setSaving(true);
    setError('');
    try {
      if (form.id) await adminApi.put(`${endpoint}/${form.id}`, payload);
      else await adminApi.post(endpoint, payload);
      if (isDirector) toast.success(form.id ? 'Director updated' : 'Director created');
      else toast.success(form.id ? 'Saved' : 'Added');
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const hasCalendar = !!form?.google_calendar_id.trim() || !!form?.use_primary_calendar;
  const zones = form && !tzOptions.some((o) => o.value === form.timezone) ? [{ value: form.timezone, label: form.timezone }, ...tzOptions] : tzOptions;
  const now = Date.now();
  const periods = (form?.time_off || []).map((t, idx) => ({ t, idx, start: Date.parse(t.start_utc), end: Date.parse(t.end_utc) }));
  const upcoming = periods.filter((p) => !(p.end <= now)).sort((a, b) => a.start - b.start);
  const past = periods.filter((p) => p.end <= now).sort((a, b) => b.start - a.start);
  const workingDays = new Set((form?.weekly_rules || []).map((r) => Number(r.day_of_week))).size;
  const myZone = deviceZone();

  const offRow = ({ t, idx }, isPast) => (
    <div className={s.offRow} data-past={isPast || undefined} key={idx}>
      <CalendarDays size={16} />
      <span>{periodLabel(t)}<small>{t.reason || 'No reason given'}</small></span>
      <button type="button" className={s.iconButton} aria-label={`Remove time off ${periodLabel(t)}`} onClick={() => removeTimeOff(idx)}><Trash2 size={14} /></button>
    </div>
  );

  return (
    <Sheet open={!!target} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <SheetContent className={s.sheet} onInteractOutside={keepSheetOpen} onEscapeKeyDown={keepSheetOpen}>
        <SheetHeader className={s.sheetHeader}>
          <span className={s.kicker}>HOST DETAILS</span>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isDirector
              ? 'Keep their details, calendar and working hours together.'
              : 'A host owns the Google Meet event on their own calendar. Give them a Workspace email and a Google calendar so they can host a manually booked session.'}
          </SheetDescription>
        </SheetHeader>
        {form && (
          <form className={s.form} onSubmit={save} noValidate>
            {isDirector && (
              <div className={s.drawerTabs} role="group" aria-label="Host details sections">
                {[['profile', 'Details'], ['availability', 'Availability'], ['timeoff', 'Time off']].map(([value, label]) => (
                  <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
                    {label}{value === 'timeoff' && upcoming.length > 0 && <small>{upcoming.length}</small>}
                  </button>
                ))}
              </div>
            )}

            {tab === 'profile' && (
              <>
                <div className={s.fields}>
                  <label className={`${s.field} ${s.wide}`}>Name
                    <input autoFocus maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={isDirector ? 'Dr. Jane Doe' : 'Full name'} />
                  </label>
                  <label className={`${s.field} ${s.wide}`}>Email address
                    <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={isDirector ? 'director@drshumard.com' : 'name@drshumard.com'} />
                    {isDirector && <small>Their Google Workspace email — added to every booking as an attendee and made a Meet co-host, so they can run the call.</small>}
                  </label>
                  <label className={`${s.field} ${s.wide}`}>Timezone
                    <AdminSelect value={form.timezone} onChange={(v) => set('timezone', v)} options={zones} label="Timezone" />
                  </label>
                  <label className={`${s.field} ${s.wide}`}>Google calendar ID
                    <input value={form.google_calendar_id} onChange={(e) => set('google_calendar_id', e.target.value)} placeholder="address@group.calendar.google.com" />
                    <small>{isDirector ? 'The dedicated calendar bookings and holidays write to. Paste it here when ready.' : 'The calendar their manually booked sessions are created on.'}</small>
                  </label>
                </div>
                <label className={s.statusToggle}>
                  <span>
                    <strong>Use primary calendar</strong>
                    <small>{form.google_calendar_id.trim()
                      ? 'Ignored while a shared calendar ID is set above.'
                      : 'No shared calendar? Bookings land on their own email calendar and it shows on the Team Calendar.'}</small>
                  </span>
                  <input type="checkbox" checked={form.use_primary_calendar} onChange={(e) => set('use_primary_calendar', e.target.checked)} />
                </label>
                <div className={s.fields}>
                  <label className={`${s.field} ${s.wide}`}>Practice Better consultant ID
                    <input value={form.pb_consultant_id} onChange={(e) => set('pb_consultant_id', e.target.value)} placeholder={isDirector ? 'This director’s PB consultant (asConsultantId)' : 'asConsultantId from Practice Better'} />
                    <small>{isDirector
                      ? 'Used in Per director routing (Settings) — bookings assigned to this director are recorded under this Practice Better consultant.'
                      : 'Set this and their manual bookings mirror into Practice Better under this consultant. Leave empty to skip Practice Better for this host.'}</small>
                  </label>
                  <div className={`${s.field} ${s.wide}`}>
                    <span>Calendar color</span>
                    <HostColorPicker value={form.color} onChange={(v) => set('color', v)} />
                    <small>{isDirector ? 'Their events and availability on the Team Calendar.' : 'Their events on the Team Calendar.'} Auto picks an unused color.</small>
                  </div>
                </div>
                <label className={s.statusToggle}>
                  <span>
                    <strong>Available for scheduling</strong>
                    <small>{isDirector ? 'Inactive directors keep their existing bookings but stop receiving new ones.' : 'Inactive hosts keep their existing bookings but can’t be picked for new ones.'}</small>
                  </span>
                  <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                </label>
                {!hasCalendar && (
                  <div className={s.inlineNotice}><CircleAlert size={15} /><span>Add a Google calendar ID or use their primary calendar — bookings need a calendar to create the Meet event.</span></div>
                )}
              </>
            )}

            {tab === 'availability' && (
              <>
                <div>
                  <div className={s.formHeading}>
                    <div><h3>Weekly hours</h3><p>{zoneLabel(form.timezone)} · Repeats every week</p></div>
                    <button type="button" className={s.secondary} onClick={copyMonday}><Copy size={13} />Copy Mon to weekdays</button>
                  </div>
                  <div className={s.availability}>
                    {DAYS.map((day, d) => {
                      const dayRules = form.weekly_rules.map((r, idx) => ({ r, idx })).filter(({ r }) => Number(r.day_of_week) === d);
                      if (!dayRules.length) {
                        return (
                          <div key={d}>
                            <label className={s.check}><input type="checkbox" checked={false} onChange={() => addRule(d)} />{day}</label>
                            <input type="time" value="09:00" disabled aria-label={`${day} start time`} />
                            <span>–</span>
                            <input type="time" value="17:00" disabled aria-label={`${day} end time`} />
                            <span />
                            <span />
                          </div>
                        );
                      }
                      return dayRules.map(({ r, idx }, j) => (
                        <div key={`${d}-${idx}`}>
                          {j === 0
                            ? <label className={s.check}><input type="checkbox" checked onChange={() => clearDay(d)} />{day}</label>
                            : <span />}
                          <input type="time" value={r.start} aria-label={`${day} start time${j ? ` ${j + 1}` : ''}`} onChange={(e) => updateRule(idx, 'start', e.target.value)} />
                          <span>–</span>
                          <input type="time" value={r.end} aria-label={`${day} end time${j ? ` ${j + 1}` : ''}`} onChange={(e) => updateRule(idx, 'end', e.target.value)} />
                          <button type="button" className={s.rangeButton} aria-label={`Remove ${day} ${r.start}–${r.end}`} onClick={() => removeRule(idx)}><Trash2 size={13} /></button>
                          {j === 0
                            ? <button type="button" className={s.rangeButton} aria-label={`Add hours on ${day}`} onClick={() => addRule(d)}><Plus size={14} /></button>
                            : <span />}
                        </div>
                      ));
                    })}
                  </div>
                </div>
                <div className={s.inlineNotice}>
                  <CalendarDays size={15} />
                  <span>{workingDays} working {workingDays === 1 ? 'day' : 'days'} per week. Add a second range for a break; calendar events, time off and overrides can further reduce availability.</span>
                </div>
                <div className={s.formSection}>
                  <div className={s.formHeading}>
                    <div><h3>Date overrides</h3><p>Different hours on a specific date. No hours = off that day; it supersedes the weekly hours.</p></div>
                    <button type="button" className={s.secondary} onClick={addOverride}><Plus size={13} />Add date</button>
                  </div>
                  {form.date_overrides.length === 0 ? (
                    <p className={s.micro}>No date overrides.</p>
                  ) : (
                    <div className={s.overrides}>
                      {form.date_overrides.map((o, i) => (
                        <div className={s.override} key={i}>
                          <div className={s.overrideTop}>
                            <input type="date" value={o.date} aria-label={`Override ${i + 1} date`} onChange={(e) => updateOverride(i, { date: e.target.value })} />
                            <span className={s.overrideState} data-off={!(o.windows || []).length}>{(o.windows || []).length ? 'Custom hours' : 'Off this day'}</span>
                            <button type="button" className={s.linkButton} onClick={() => addWindow(i)}><Plus size={13} />Add hours</button>
                            <button type="button" className={s.iconButton} aria-label={`Remove override ${o.date || i + 1}`} onClick={() => removeOverride(i)}><Trash2 size={14} /></button>
                          </div>
                          {(o.windows || []).length === 0 ? (
                            <p className={s.micro}>Marked unavailable. Add hours to make it a partial day instead.</p>
                          ) : (
                            <div className={s.availability}>
                              {o.windows.map((w, wi) => (
                                <div key={wi}>
                                  <span />
                                  <input type="time" value={w.start} aria-label={`Override ${o.date || i + 1} start time ${wi + 1}`} onChange={(e) => updateWindow(i, wi, 'start', e.target.value)} />
                                  <span>–</span>
                                  <input type="time" value={w.end} aria-label={`Override ${o.date || i + 1} end time ${wi + 1}`} onChange={(e) => updateWindow(i, wi, 'end', e.target.value)} />
                                  <button type="button" className={s.rangeButton} aria-label={`Remove hours ${w.start}–${w.end}`} onClick={() => removeWindow(i, wi)}><Trash2 size={13} /></button>
                                  <span />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'timeoff' && (
              <>
                <div>
                  <h3 className={s.subheading}>Planned time away</h3>
                  <p className={s.description}>Block time without changing their usual weekly hours. Times are in this device’s timezone{myZone ? ` (${myZone})` : ''}.</p>
                </div>
                <div className={s.fields}>
                  <div className={s.field}>
                    <label htmlFor="off-start">From</label>
                    <div className={s.dateTime}>
                      <input id="off-start" type="date" value={off.startDate} onChange={(e) => { const v = e.target.value; setOff((o) => ({ ...o, startDate: v, endDate: v && o.endDate < v ? v : o.endDate })); }} />
                      <input type="time" aria-label="From time" value={off.startTime} onChange={(e) => setOff((o) => ({ ...o, startTime: e.target.value }))} />
                    </div>
                  </div>
                  <div className={s.field}>
                    <label htmlFor="off-end">Until</label>
                    <div className={s.dateTime}>
                      <input id="off-end" type="date" value={off.endDate} min={off.startDate || undefined} onChange={(e) => setOff((o) => ({ ...o, endDate: e.target.value }))} />
                      <input type="time" aria-label="Until time" value={off.endTime} onChange={(e) => setOff((o) => ({ ...o, endTime: e.target.value }))} />
                    </div>
                  </div>
                  <label className={`${s.field} ${s.wide}`}>Reason
                    <input maxLength={80} placeholder="Optional — e.g. Annual leave" value={off.reason} onChange={(e) => setOff((o) => ({ ...o, reason: e.target.value }))} />
                  </label>
                </div>
                <button type="button" className={s.secondary} onClick={addTimeOff}><Plus size={14} />Add time off</button>
                {offError && <p className={s.error} role="alert">{offError}</p>}
                <div>
                  {periods.length ? (
                    <>
                      {upcoming.map((p) => offRow(p, false))}
                      {past.length > 0 && <h4 className={s.offGroup}>Past</h4>}
                      {past.map((p) => offRow(p, true))}
                    </>
                  ) : (
                    <div className={s.timeOffEmpty}><CalendarDays size={24} /><strong>No time off planned</strong><span>Time off you add will appear here.</span></div>
                  )}
                </div>
              </>
            )}

            {error && <p className={s.error} role="alert">{error}</p>}
            <div className={s.actions}>
              <button type="button" className={s.secondary} disabled={saving} onClick={onClose}>Cancel</button>
              <button type="submit" className={s.button} disabled={saving}><Check size={15} />{saving ? 'Saving…' : form.id ? 'Save host' : `Add ${singular}`}</button>
            </div>
            <p className={s.micro}>Changes take effect as soon as you save.</p>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
