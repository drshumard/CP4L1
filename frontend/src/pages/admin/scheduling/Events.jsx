import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  CalendarDays, Check, ChevronRight, Clock3, Eye, Globe2, Info, LockKeyhole, Pencil, Plus, Search, Trash2, Video,
} from 'lucide-react';
import { adminApi, authHeaders } from '../api';
import { confirmDialog } from '../confirm';
import { fmtTime, getAdminDisplayTz, todayYmd } from '../format';
import { tzAbbrev, utcToZonedWallTime } from '../usTimezones';
import { zonedWallTimeToUtcIso } from './useSortedTimezones';
import { AdminSelect, keepSheetOpen } from '../workspace-ui';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import s from './events.module.css';

// Design: shumard-checkout-portal/app/admin/scheduling/events. Event types save on their own (sheet save /
// delete); the booking rules and clinic closures are drafts saved together from the save bar.

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
const DURATIONS = [15, 30, 45, 60, 90, 120];
const SAMPLE_PATIENT = 'Alex Morgan';

// Minimum notice is edited in hours (stored as minutes); the rest are stored as shown.
const RULE_FIELDS = [
  { key: 'slot_minutes', label: 'Start-time interval', unit: 'minutes', helper: 'How often a new appointment can start.', min: 5, max: 240 },
  { key: 'min_notice_hours', label: 'Minimum notice', unit: 'hours', helper: 'Time needed before the earliest booking.', min: 0, max: 720, step: 0.5, decimal: true },
  { key: 'max_advance_days', label: 'Advance booking limit', unit: 'days', helper: 'How far ahead a patient can book.', min: 1, max: 365 },
  { key: 'buffer_minutes', label: 'Buffer after each call', unit: 'minutes', helper: 'A little space between appointments.', min: 0, max: 240 },
  { key: 'availability_days', label: 'Patient calendar window', unit: 'days', helper: 'Number of days shown in the patient calendar.', min: 1, max: 90 },
];
const SAVED_RULE_KEYS = ['slot_minutes', 'min_notice_minutes', 'max_advance_days', 'buffer_minutes', 'availability_days'];

const num = (v) => (v === '' || v == null ? NaN : Number(v));
// Two decimals always round-trip back to the same whole minute (max error 0.3 min).
const toHours = (minutes) => String(Math.round(((Number(minutes) || 0) / 60) * 100) / 100);
const rulesFrom = (d) => ({
  slot_minutes: String(d.slot_minutes ?? ''),
  min_notice_hours: toHours(d.min_notice_minutes),
  max_advance_days: String(d.max_advance_days ?? ''),
  buffer_minutes: String(d.buffer_minutes ?? ''),
  availability_days: String(d.availability_days ?? ''),
});
const rulesPayload = (r) => ({
  slot_minutes: num(r.slot_minutes),
  min_notice_minutes: Math.round(num(r.min_notice_hours) * 60),
  max_advance_days: num(r.max_advance_days),
  buffer_minutes: num(r.buffer_minutes),
  availability_days: num(r.availability_days),
});
const rulesChanged = (r, d) => { const p = rulesPayload(r); return SAVED_RULE_KEYS.some((k) => p[k] !== Number(d[k])); };

function validateRules(r) {
  for (const f of RULE_FIELDS) {
    const v = num(r[f.key]);
    if (!Number.isFinite(v) || v < f.min || v > f.max || (!f.decimal && !Number.isInteger(v))) {
      return `${f.label} must be ${f.min}–${f.max} ${f.unit}${f.decimal ? '' : ', in whole numbers'}.`;
    }
  }
  if (num(r.availability_days) > num(r.max_advance_days)) return 'The patient calendar window cannot exceed the advance booking limit.';
  if (num(r.min_notice_hours) >= num(r.max_advance_days) * 24) return 'Minimum notice must leave some time within the advance booking limit.';
  return '';
}

// Closure drafts carry a local key (list order and removal); it never reaches the API.
const closuresFrom = (d) => (d.clinic_closures || []).map((c) => ({ ...c, _key: newId() }));
const closureSig = (list) => list.map((c) => `${Date.parse(c.start_utc)}|${Date.parse(c.end_utc)}|${(c.reason || '').trim()}`).sort().join('~');

const normalizeSessions = (list) => list.map((x) => ({
  id: x.id, title: (x.title || '').trim(), description: x.description || '',
  duration_minutes: Number(x.duration_minutes) || 30, portal_visible: !!x.portal_visible,
  pb_service_id: (x.pb_service_id || '').trim(),
}));

const pad2 = (n) => String(n).padStart(2, '0');
const addDaysYmd = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const fmtYmd = (ymd, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const fmtHm = (hm) => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'}`; };
const serviceLabel = (id) => (!id ? 'Not linked' : id.length > 12 ? `${id.slice(0, 12)}…` : id);
const durationOptions = (current) => [...new Set([...DURATIONS, Number(current) || 30])].sort((a, b) => a - b);

// A closure as it reads in the display timezone: all-day when it runs midnight → midnight.
function describeClosure(c, tz) {
  const a = utcToZonedWallTime(c.start_utc, tz);
  const b = utcToZonedWallTime(c.end_utc, tz);
  if (!a.date || !b.date) return { when: 'Invalid dates', detail: '' };
  if (a.time === '00:00' && b.time === '00:00' && b.date > a.date) {
    const last = addDaysYmd(b.date, -1);
    return { when: last === a.date ? fmtYmd(a.date) : `${fmtYmd(a.date)} – ${fmtYmd(last)}`, detail: 'All directors · All day' };
  }
  const zone = tzAbbrev(c.start_utc, tz);
  if (a.date === b.date) return { when: fmtYmd(a.date), detail: `All directors · ${fmtHm(a.time)} – ${fmtHm(b.time)} ${zone}` };
  return { when: `${fmtYmd(a.date)} – ${fmtYmd(b.date)}`, detail: `All directors · Starts ${fmtHm(a.time)}, ends ${fmtHm(b.time)} ${zone}` };
}

// The next 14 days in the display timezone, each with its open start times. On the portal engine a day that a saved
// closure touches says so instead of "No availability".
function previewDays(payload, tz, closures) {
  const byDay = {};
  for (const slot of [...(payload?.slots || [])].sort((x, y) => Date.parse(x.start_time) - Date.parse(y.start_time))) {
    const day = utcToZonedWallTime(slot.start_time, tz).date;
    (byDay[day] = byDay[day] || []).push(fmtTime(slot.start_time, { tz }));
  }
  const today = utcToZonedWallTime(new Date(), tz).date;
  return Array.from({ length: 14 }, (_, i) => {
    const key = addDaysYmd(today, i);
    const from = Date.parse(zonedWallTimeToUtcIso(key, '00:00', tz));
    const to = Date.parse(zonedWallTimeToUtcIso(addDaysYmd(key, 1), '00:00', tz));
    const closure = closures.find((c) => Date.parse(c.start_utc) < to && Date.parse(c.end_utc) > from);
    return { key, label: fmtYmd(key, { weekday: 'short', month: 'short', day: 'numeric' }), times: byDay[key] || [], closure };
  });
}

function Access({ portal }) {
  return (
    <span className={s.access} data-portal={!!portal}>
      {portal ? <Globe2 size={12} /> : <LockKeyhole size={12} />}{portal ? 'Patient portal' : 'Manual only'}
    </span>
  );
}

export default function Events() {
  // AdminLayout re-keys the page when the display timezone changes, so reading it once per mount is safe.
  const tz = useMemo(() => getAdminDisplayTz(), []);
  const [data, setData] = useState(null);         // settings as last loaded / saved
  const [loadError, setLoadError] = useState(false);
  const [rules, setRules] = useState(null);       // booking-rule drafts (the fields' strings)
  const [closures, setClosures] = useState([]);   // clinic-closure drafts
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  // Event sheet (the draft outlives `open` so the form stays put while the sheet animates out)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [edit, setEdit] = useState(null);           // draft event
  const [editIndex, setEditIndex] = useState(null); // null = adding new
  const [eventError, setEventError] = useState('');
  const [savingSession, setSavingSession] = useState(false);

  // Closure dialog
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureDraft, setClosureDraft] = useState(null);
  const [closureError, setClosureError] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(null);   // { loading } | { data } | { error }
  const previewReq = useRef(0);                   // only the latest request may fill the dialog

  const adopt = useCallback((d) => { setData(d); setRules(rulesFrom(d)); setClosures(closuresFrom(d)); setError(''); }, []);

  useEffect(() => {
    adminApi.get('/admin/settings').then((res) => adopt(res.data))
      .catch((e) => { setLoadError(true); toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load settings'); });
  }, [adopt]);

  if (!data || !rules) {
    return <div className={s.loading}>{loadError ? 'Couldn’t load the event settings. Refresh the page to try again.' : 'Loading…'}</div>;
  }

  const sessions = data.sessions || [];
  const portalCount = sessions.filter((x) => x.portal_visible).length;
  const q = query.trim().toLowerCase();
  const visible = sessions.map((sess, i) => ({ sess, i })).filter(({ sess }) =>
    (!q || `${sess.title || ''} ${sess.description || ''}`.toLowerCase().includes(q))
    && (filter === 'all' || (filter === 'portal') === !!sess.portal_visible));
  const dirty = rulesChanged(rules, data) || closureSig(closures) !== closureSig(data.clinic_closures || []);
  const shownClosures = [...closures].sort((a, b) => Date.parse(a.start_utc) - Date.parse(b.start_utc));
  const zone = tzAbbrev(new Date(), tz) || tz;
  const isLocal = data.booking_engine === 'local';

  // ---- events (save on their own)
  const openNew = () => {
    setEditIndex(null);
    setEdit({ id: newId(), title: '', description: '', duration_minutes: 30, portal_visible: false, pb_service_id: '' });
    setEventError('');
    setSheetOpen(true);
  };
  const openEdit = (i) => { setEditIndex(i); setEdit({ ...sessions[i] }); setEventError(''); setSheetOpen(true); };
  const setE = (k, v) => { setEdit((f) => ({ ...f, [k]: v })); setEventError(''); };

  // The response carries the saved rules/closures too — unchanged, so the drafts above stay valid.
  const persistSessions = async (next, okMsg) => {
    const res = await adminApi.put('/admin/settings', { sessions: normalizeSessions(next) });
    setData(res.data);
    toast.success(okMsg);
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    if (!(edit.title || '').trim()) { setEventError('Give this event a name.'); return; }
    setSavingSession(true);
    try {
      const next = editIndex == null ? [...sessions, edit] : sessions.map((x, i) => (i === editIndex ? edit : x));
      await persistSessions(next, editIndex == null ? 'Event added' : 'Event saved');
      setSheetOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally { setSavingSession(false); }
  };

  const deleteEvent = async () => {
    const sess = sessions[editIndex];
    const ok = await confirmDialog({
      title: `Delete “${sess.title || 'this event'}”?`,
      message: 'It disappears from the portal and manual booking. Existing bookings are not touched.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setSavingSession(true);
    try {
      await persistSessions(sessions.filter((_, i) => i !== editIndex), 'Event deleted');
      setSheetOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Delete failed');
    } finally { setSavingSession(false); }
  };

  // ---- booking rules + closures (drafts → save bar)
  const setRule = (k, v) => { setRules((r) => ({ ...r, [k]: v })); setError(''); };

  const saveAvailability = async () => {
    const issue = validateRules(rules);
    setError(issue);
    if (issue) return;
    setSaving(true);
    try {
      const res = await adminApi.put('/admin/settings', {
        ...rulesPayload(rules),
        clinic_closures: closures.filter((c) => c.start_utc && c.end_utc)
          .map((c) => ({ start_utc: c.start_utc, end_utc: c.end_utc, reason: c.reason || '' })),
      });
      adopt(res.data);
      toast.success('Availability saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const discard = () => { adopt(data); toast('Unsaved availability changes discarded'); };

  const openClosure = () => {
    const today = utcToZonedWallTime(new Date(), tz).date;
    setClosureDraft({ reason: '', start: today, end: today, allDay: true, startTime: '09:00', endTime: '17:00' });
    setClosureError('');
    setClosureOpen(true);
  };
  const setCD = (patch) => { setClosureDraft((d) => ({ ...d, ...patch })); setClosureError(''); };

  // Dates (and times) are the display timezone's wall clock; all day = start date 00:00 → the day after the end date.
  const addClosure = (e) => {
    e.preventDefault();
    const d = closureDraft;
    if (!d.start || !d.end) { setClosureError('Choose the start and end dates.'); return; }
    if (d.end < d.start) { setClosureError('The end date must be on or after the start date.'); return; }
    let start_utc;
    let end_utc;
    if (d.allDay) {
      start_utc = zonedWallTimeToUtcIso(d.start, '00:00', tz);
      end_utc = zonedWallTimeToUtcIso(addDaysYmd(d.end, 1), '00:00', tz);
    } else {
      if (!d.startTime || !d.endTime) { setClosureError('Choose a start and end time.'); return; }
      start_utc = zonedWallTimeToUtcIso(d.start, d.startTime, tz);
      end_utc = zonedWallTimeToUtcIso(d.end, d.endTime, tz);
      if (Date.parse(end_utc) <= Date.parse(start_utc)) { setClosureError('The closure must end after it starts.'); return; }
    }
    setClosures((list) => [...list, { start_utc, end_utc, reason: d.reason.trim(), _key: newId() }]);
    setClosureOpen(false);
    toast.success('Closure added. Save availability to keep it.');
  };
  const removeClosure = (key) => setClosures((list) => list.filter((c) => c._key !== key));

  // ---- preview: the real availability endpoint (saved settings, active engine)
  const openPreview = async () => {
    const req = ++previewReq.current;
    setPreview({ loading: true });
    setPreviewOpen(true);
    try {
      const today = todayYmd();
      const base = process.env.REACT_APP_BACKEND_URL + '/api/booking/availability';
      const res = await axios.get(base, { params: { start_date: today, days: 14 }, headers: authHeaders() });
      if (req === previewReq.current) setPreview({ data: res.data });
    } catch {
      toast.error('Preview failed');
      if (req === previewReq.current) setPreview({ error: true });
    }
  };
  const days = preview?.data ? previewDays(preview.data, tz, isLocal ? data.clinic_closures || [] : []) : [];
  const slotCount = (preview?.data?.slots || []).length;
  const previewMeta = isLocal
    ? `${toHours(data.min_notice_minutes)}h notice · ${data.buffer_minutes}m buffer · ${data.availability_days}-day patient window · Times in ${zone}`
    : `Practice Better availability · Times in ${zone}`;

  return (
    <div className={s.page}>
      <section className={s.card} aria-labelledby="events-heading">
        <div className={s.cardHeader}>
          <div>
            <span className={s.kicker}>SESSION LIBRARY</span>
            <h2 id="events-heading">Event types</h2>
            <p>Define your sessions and how patients can book them.</p>
          </div>
          <button type="button" className={s.primary} onClick={openNew}><Plus size={16} />Add event</button>
        </div>
        <div className={s.toolbar}>
          <div className={s.search}>
            <Search size={16} />
            <input type="search" placeholder="Search event types" aria-label="Search event types" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className={s.segmented} aria-label="Filter events">
            {[['all', 'All events', sessions.length], ['portal', 'Portal', portalCount], ['manual', 'Manual', sessions.length - portalCount]].map(([value, label, count]) => (
              <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{count}</span></button>
            ))}
          </div>
        </div>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr><th>Event name</th><th>Duration</th><th>Booking access</th><th>Practice Better</th><th><span className="sr-only">Edit</span></th></tr>
            </thead>
            <tbody>
              {visible.map(({ sess, i }) => (
                <tr key={sess.id || i}>
                  <td>
                    <button type="button" className={s.eventName} onClick={() => openEdit(i)}>
                      <span className={s.eventIcon}><Video size={16} /></span>
                      <span><strong>{sess.title || 'Untitled'}</strong><small>{sess.description || 'Online · Video session'}</small></span>
                    </button>
                  </td>
                  <td><span className={s.duration}><Clock3 size={13} />{sess.duration_minutes ?? 30} min</span></td>
                  <td><Access portal={sess.portal_visible} /></td>
                  <td><span className={s.service} title={sess.pb_service_id || 'No service linked'}>{serviceLabel(sess.pb_service_id)}</span></td>
                  <td>
                    <button type="button" className={s.iconButton} aria-label={`Edit ${sess.title || 'event'}, ${sess.duration_minutes ?? 30} minutes`} onClick={() => openEdit(i)}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={s.mobileEvents}>
          {visible.map(({ sess, i }) => (
            <button type="button" className={s.mobileEvent} key={sess.id || i} onClick={() => openEdit(i)}>
              <span className={s.mobileEventTitle}><Video size={15} /><strong>{sess.title || 'Untitled'}</strong><ChevronRight size={16} /></span>
              <span className={s.mobileEventMeta}><span><Clock3 size={12} />{sess.duration_minutes ?? 30} min</span><Access portal={sess.portal_visible} /></span>
            </button>
          ))}
        </div>
        {!visible.length && (sessions.length ? (
          <div className={s.empty}>
            <Search size={23} /><h3>No matching events</h3><p>Try another name or view all your event types.</p>
            <button type="button" className={s.secondary} onClick={() => { setQuery(''); setFilter('all'); }}>Reset filters</button>
          </div>
        ) : (
          <div className={s.empty}><Video size={23} /><h3>No events yet</h3><p>Add one to start taking bookings.</p></div>
        ))}
        <div className={s.tableFoot}>
          <span>{visible.length} event type{visible.length === 1 ? '' : 's'}</span>
          <span><Globe2 size={12} />{portalCount} available in the patient portal</span>
        </div>
      </section>

      <section className={s.card} aria-labelledby="rules-heading">
        <div className={s.settingsSection}>
          <div className={s.sectionIntro}>
            <span className={s.kicker}>01 / AVAILABILITY</span>
            <h2 id="rules-heading">Booking rules</h2>
            <p>Keep your calendar manageable, with time for patients and your team.</p>
            <div className={s.hint}><Clock3 size={15} /><span>Minimum notice is shown in hours for easier planning.</span></div>
          </div>
          <div className={s.rulesFields}>
            {RULE_FIELDS.map((f) => (
              <label className={s.field} key={f.key}>
                <span>{f.label}</span>
                <div className={s.unitInput}>
                  <input type="number" inputMode={f.decimal ? 'decimal' : 'numeric'} min={f.min} max={f.max} step={f.step || 1}
                    value={rules[f.key]} onChange={(e) => setRule(f.key, e.target.value)} />
                  <span>{f.unit}</span>
                </div>
                <small>{f.helper}</small>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className={s.card} aria-labelledby="closures-heading">
        <div className={s.settingsSection}>
          <div className={s.sectionIntro}>
            <span className={s.kicker}>02 / TIME AWAY</span>
            <h2 id="closures-heading">Clinic closures</h2>
            <p>Block holidays and team days across every director’s calendar.</p>
            <button type="button" className={s.secondary} onClick={openClosure}><Plus size={15} />Add closure</button>
          </div>
          <div>
            {shownClosures.length ? (
              <div className={s.closureList}>
                {shownClosures.map((c) => {
                  const { when, detail } = describeClosure(c, tz);
                  return (
                    <div className={s.closure} key={c._key}>
                      <span className={s.closureIcon}><CalendarDays size={17} /></span>
                      <div><strong>{c.reason || 'Clinic closure'}</strong><span>{when}</span><small>{detail}</small></div>
                      <button type="button" className={s.iconButton} aria-label={`Remove closure ${c.reason || when}`} onClick={() => removeClosure(c._key)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={s.noClosures}><CalendarDays size={24} /><strong>Your calendar is open</strong><p>No clinic-wide closures have been added.</p></div>
            )}
          </div>
        </div>
      </section>

      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.saveBar}>
        <span className={s.saveState} data-dirty={dirty}><i />{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <div>
          <button type="button" className={s.secondary} onClick={openPreview}><Eye size={16} />Preview 14 days</button>
          {dirty && <button type="button" className={s.textButton} onClick={discard} disabled={saving}>Discard</button>}
          <button type="button" className={s.primary} disabled={!dirty || saving} onClick={saveAvailability}>
            {saving ? 'Saving…' : 'Save availability'}<Check size={15} />
          </button>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o && !savingSession) setSheetOpen(false); }}>
        <SheetContent className={s.sheet} onInteractOutside={keepSheetOpen} onEscapeKeyDown={keepSheetOpen}>
          <div className={s.sheetHeader}>
            <span className={s.kicker}>SESSION LIBRARY</span>
            <SheetTitle>{editIndex == null ? 'New event' : 'Edit event'}</SheetTitle>
            <SheetDescription>A clear session name helps your team book the right appointment.</SheetDescription>
          </div>
          {edit && (
            <form className={s.eventForm} onSubmit={saveEvent} noValidate>
              <label className={s.field}>
                <span>Event name</span>
                <input autoFocus maxLength={100} value={edit.title || ''} onChange={(e) => setE('title', e.target.value)}
                  placeholder="e.g. Follow-up consultation" aria-invalid={!!eventError && !(edit.title || '').trim()} />
                <small>{'{{user}}'} becomes the patient’s name on the calendar event.</small>
              </label>
              <label className={s.field}>
                <span>Duration</span>
                <AdminSelect value={String(edit.duration_minutes ?? 30)} onChange={(v) => setE('duration_minutes', Number(v))} label="Duration"
                  options={durationOptions(edit.duration_minutes).map((d) => ({ value: String(d), label: `${d} minutes` }))} />
              </label>
              <label className={s.field}>
                <span>Description <em>Optional</em></span>
                <textarea rows={3} value={edit.description || ''} onChange={(e) => setE('description', e.target.value)} />
                <small>Shown on the Google event and in patient emails.</small>
              </label>
              <fieldset className={s.bookingChoice}>
                <legend>Who can book this event?</legend>
                {[true, false].map((portal) => (
                  <label key={String(portal)} data-selected={!!edit.portal_visible === portal}>
                    <input type="radio" name="booking-access" checked={!!edit.portal_visible === portal} onChange={() => setE('portal_visible', portal)} />
                    {portal ? <Globe2 size={19} /> : <LockKeyhole size={19} />}
                    <span>
                      <strong>{portal ? 'Patient portal' : 'Manual booking'}</strong>
                      <small>{portal ? 'Patients can choose this session online.' : 'Only your team can book this session.'}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className={s.field}>
                <span>Practice Better service ID <em>Optional</em></span>
                <input className={s.mono} value={edit.pb_service_id || ''} onChange={(e) => setE('pb_service_id', e.target.value)} placeholder="Enter the linked service ID" />
                <small>Matches this event to its service in Practice Better.</small>
              </label>
              <div className={s.eventPreview}>
                <span className={s.kicker}>BOOKING PREVIEW</span>
                <strong>{(edit.title || '').trim() ? edit.title.trim().replaceAll('{{user}}', SAMPLE_PATIENT) : 'Your session name'}</strong>
                <span><Video size={14} />Online video session · {edit.duration_minutes ?? 30} minutes</span>
              </div>
              {eventError && <p className={s.error} role="alert">{eventError}</p>}
              <div className={s.formFooter}>
                <p>Saving updates the patient portal and manual booking straight away.</p>
                <div>
                  {editIndex != null && (
                    <button type="button" className={`${s.textButton} ${s.dangerButton}`} onClick={deleteEvent} disabled={savingSession}><Trash2 size={14} />Delete event</button>
                  )}
                  <button type="button" className={s.secondary} onClick={() => setSheetOpen(false)} disabled={savingSession}>Cancel</button>
                  <button type="submit" className={s.primary} disabled={savingSession}>
                    {savingSession ? 'Saving…' : editIndex == null ? 'Create event' : 'Save event'}<Check size={15} />
                  </button>
                </div>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={closureOpen} onOpenChange={setClosureOpen}>
        <DialogContent className={s.dialog}>
          <div className={s.dialogHeader}>
            <span className={s.kicker}>CLINIC CALENDAR</span>
            <DialogTitle>Add a closure</DialogTitle>
            <DialogDescription className={s.dialogDescription}>All directors will be unavailable on these dates.</DialogDescription>
          </div>
          {closureDraft && (
            <form className={s.closureForm} onSubmit={addClosure} noValidate>
              <label className={s.field}>
                <span>Reason <em>Optional</em></span>
                <input autoFocus maxLength={80} placeholder="e.g. Thanksgiving holiday" value={closureDraft.reason} onChange={(e) => setCD({ reason: e.target.value })} />
              </label>
              <div className={s.twoFields}>
                <label className={s.field}>
                  <span>Start date</span>
                  <input type="date" value={closureDraft.start}
                    onChange={(e) => setCD({ start: e.target.value, end: e.target.value > closureDraft.end ? e.target.value : closureDraft.end })} />
                </label>
                <label className={s.field}>
                  <span>End date</span>
                  <input type="date" min={closureDraft.start} value={closureDraft.end} onChange={(e) => setCD({ end: e.target.value })} />
                </label>
              </div>
              <label className={s.checkRow}>
                <input type="checkbox" checked={closureDraft.allDay} onChange={(e) => setCD({ allDay: e.target.checked })} />All day
              </label>
              {!closureDraft.allDay && (
                <div className={s.twoFields}>
                  <label className={s.field}><span>Start time</span><input type="time" value={closureDraft.startTime} onChange={(e) => setCD({ startTime: e.target.value })} /></label>
                  <label className={s.field}><span>End time</span><input type="time" value={closureDraft.endTime} onChange={(e) => setCD({ endTime: e.target.value })} /></label>
                </div>
              )}
              <p className={s.helper}>For a single day, use the same start and end date. {closureDraft.allDay ? 'Dates are' : 'Dates and times are'} in {zone}.</p>
              {closureError && <p className={s.error} role="alert">{closureError}</p>}
              <div className={s.dialogActions}>
                <button type="button" className={s.secondary} onClick={() => setClosureOpen(false)}>Cancel</button>
                <button type="submit" className={s.primary}><Plus size={15} />Add closure</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={s.previewDialog}>
          <div className={s.dialogHeader}>
            <span className={s.kicker}>AVAILABILITY PREVIEW</span>
            <DialogTitle>The next 14 days</DialogTitle>
            <DialogDescription className={s.dialogDescription}>
              Open start times patients can book now, from your saved rules and the active booking engine ({isLocal ? 'Portal scheduling' : 'Practice Better'}).
            </DialogDescription>
          </div>
          {dirty && <p className={s.previewNotice}><Info size={14} />Save to preview your latest changes.</p>}
          <p className={s.previewMeta}>{previewMeta}</p>
          {preview?.loading ? (
            <p className={s.previewLoading}>Loading availability…</p>
          ) : preview?.error ? (
            <p className={s.error} role="alert">Couldn’t load availability. Try again in a moment.</p>
          ) : (
            <div className={s.previewDays}>
              {days.map((day) => (
                <div className={s.previewDay} key={day.key}>
                  <strong>{day.label}</strong>
                  {day.times.length ? (
                    <div className={s.slotList}>
                      {day.times.slice(0, 3).map((t) => <span key={t}>{t}</span>)}
                      {day.times.length > 3 && <small>+{day.times.length - 3} more</small>}
                    </div>
                  ) : day.closure ? (
                    <span className={s.noSlots} data-closed="true">Closed · {day.closure.reason || 'Clinic closure'}</span>
                  ) : (
                    <span className={s.noSlots}>No availability</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className={s.previewFoot}>
            <span>{preview?.data ? `${slotCount} open slot${slotCount === 1 ? '' : 's'}` : ''}</span>
            <button type="button" className={s.secondary} onClick={() => setPreviewOpen(false)}>Done</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
