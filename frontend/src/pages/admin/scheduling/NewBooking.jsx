import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronsUpDown, Clock3, Globe2, Mail, UserRound, Video } from 'lucide-react';
import { adminApi } from '../api';
import { fmtDate, fmtTime, todayYmd } from '../format';
import { AdminSelect } from '../workspace-ui';
import { DatePickerField, TimePickerField } from '../pickers';
import s from '../workspace.module.css';
import { zonedWallTimeToUtcIso } from './useSortedTimezones';
import { US_TIMEZONES, DEFAULT_US_TZ } from '../usTimezones';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Scheduling → New booking: manually book a patient into a session with any host (was a drawer on Bookings).
// Design: shumard-checkout-portal/app/admin/scheduling/new/page.tsx. Creates the host's Google event + Meet link
// (the patient is invited), mirrors directors to Practice Better, and optionally emails the patient.
// Prefill: ?email=&first=&last=&phone= (Users → "Book a session").

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const tzLabel = (v) => US_TIMEZONES.find((o) => o.value === v)?.label || v;

// Searchable patient picker backed by the Practice Better client cache (server-side search).
function PatientPicker({ label, onSelect }) {
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
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button type="button" id="booking-patient-search" className={s.patientPicker} data-empty={!label || undefined}>
          <span>{label || 'Search patient name or email'}</span><ChevronsUpDown size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" avoidCollisions={false} className={`w-[--radix-popover-trigger-width] p-0 ${s.patientMenu}`} align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search Practice Better clients…" value={q} onValueChange={setQ} />
          <CommandList className="max-h-60 overscroll-contain">
            {loading && <div className="py-4 text-center text-sm text-[#444]">Searching…</div>}
            {!loading && clients.length === 0 && <CommandEmpty>No matching patients. Enter their details below.</CommandEmpty>}
            {clients.map((c) => (
              <CommandItem key={c.record_id} value={c.record_id} onSelect={() => { onSelect(c); setOpen(false); }}>
                <div className="flex flex-col">
                  <span className="font-medium text-[#111]">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'}</span>
                  <span className="text-xs text-[#444]">{c.email}</span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function NewBooking() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [directors, setDirectors] = useState([]);
  const [pccs, setPccs] = useState([]);
  const blank = () => ({
    session_id: '', director_id: '', date: '', time: '09:00', timezone: DEFAULT_US_TZ,
    first_name: params.get('first') || '', last_name: params.get('last') || '', email: params.get('email') || '', phone: params.get('phone') || '',
    notes: '', send_email: true,
  });
  const [form, setForm] = useState(blank);
  const [picked, setPicked] = useState(params.get('email') ? [params.get('first'), params.get('last')].filter(Boolean).join(' ') || params.get('email') : '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    adminApi.get('/admin/settings').then((r) => setSessions(r.data.sessions || [])).catch(() => {});
    adminApi.get('/admin/directors').then((r) => setDirectors((r.data.directors || []).filter((d) => d.active !== false))).catch(() => {});
    adminApi.get('/admin/pccs').then((r) => setPccs((r.data.pccs || []).filter((p) => p.active !== false))).catch(() => {});
  }, []);

  // Any host with a Google calendar can host a manual session; grouped by role. Only "Directors" are shown to
  // patients on the portal — the others are manual-book-only. The chosen id goes as director_id; the backend
  // resolves it from either the directors or pccs collection.
  const hostGroups = useMemo(() => {
    const canHost = (h) => (h.google_calendar_id || '').trim() || (h.email || '').trim();
    const dirs = directors.filter(canHost);
    return [
      { key: 'director', label: 'Directors', items: dirs.filter((d) => (d.role || 'director') === 'director').map((d) => ({ id: d.director_id, name: d.name })) },
      { key: 'pcc', label: 'PCCs', items: pccs.filter(canHost).map((p) => ({ id: p.pcc_id, name: p.name })) },
      { key: 'hc', label: 'Health Coaches', items: dirs.filter((d) => d.role === 'hc').map((d) => ({ id: d.director_id, name: d.name })) },
      { key: 'va', label: 'VAs', items: dirs.filter((d) => d.role === 'va').map((d) => ({ id: d.director_id, name: d.name })) },
    ].filter((g) => g.items.length);
  }, [directors, pccs]);

  const session = sessions.find((x) => x.id === form.session_id);
  const host = hostGroups.flatMap((g) => g.items).find((h) => h.id === form.director_id);
  const slotIso = form.date && form.time ? zonedWallTimeToUtcIso(form.date, form.time, form.timezone) : null;
  const patientName = [form.first_name, form.last_name].map((x) => x.trim()).filter(Boolean).join(' ');

  const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined })); };
  const pickPatient = (c) => {
    setForm((f) => ({ ...f, email: c.email || '', first_name: c.first_name || '', last_name: c.last_name || '', phone: c.phone || '' }));
    setPicked([c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '');
    setErrors((e) => ({ ...e, first_name: undefined, email: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.session_id) next.session_id = 'Choose a session.';
    if (!form.director_id) next.director_id = 'Choose a host.';
    if (!form.date) next.date = 'Choose a session date.';
    if (!form.time || (form.date && !slotIso)) next.time = 'Enter a valid time for this timezone.';
    if (!form.first_name.trim()) next.first_name = 'Enter the patient’s first name.';
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    const first = ['session_id', 'director_id', 'date', 'time', 'first_name', 'email'].find((k) => next[k]);
    if (first) { document.getElementById(`booking-${first}`)?.focus(); return; }

    setSaving(true);
    try {
      await adminApi.post('/admin/bookings', {
        session_id: form.session_id, director_id: form.director_id, slot_start_utc: slotIso,
        patient: { first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim(), phone: form.phone.trim() || null },
        patient_timezone: form.timezone, notes: form.notes.trim() || null, send_email: form.send_email,
      });
      setCreated({ name: patientName || form.email.trim(), host: host?.name || 'the host', slot: slotIso, emailed: form.send_email, session: session?.title });
      requestAnimationFrame(() => document.getElementById('booking-success')?.focus());
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not create the booking');
    } finally {
      setSaving(false);
    }
  };
  const again = () => { setCreated(null); setForm(blank()); setPicked(''); setErrors({}); };

  const errorProps = (key) => ({ id: `booking-${key}`, 'aria-invalid': !!errors[key] || undefined, 'aria-describedby': errors[key] ? `error-${key}` : undefined });
  const ErrorText = ({ field }) => (errors[field] ? <p id={`error-${field}`} className={s.fieldError} role="alert">{errors[field]}</p> : null);

  return (
    <>
      <Link to="/admin/scheduling/bookings" className={s.backLink}><ArrowLeft size={15} />Back to bookings</Link>
      <div className={s.heading}>
        <div>
          <h1>New booking</h1>
          <p>Bring the right patient, host, and time together.</p>
        </div>
      </div>

      {created ? (
        <section className={`${s.surface} ${s.analyticsSurface} ${s.success}`}>
          <div className={s.successIcon}><Check size={29} /></div>
          <h2 id="booking-success" tabIndex={-1}>The booking is confirmed.</h2>
          <p>{created.name} with {created.host}{created.session ? ` · ${created.session}` : ''}<br />{fmtDate(created.slot)} at {fmtTime(created.slot)}</p>
          <p>The host’s calendar event and Google Meet link are ready{created.emailed ? ', and the patient has been emailed a confirmation.' : '. No confirmation email was sent.'}</p>
          <div className={s.successActions}>
            <button type="button" className={s.primaryButton} onClick={() => navigate('/admin/scheduling/bookings')}>View bookings <ArrowRight size={17} /></button>
            <button type="button" className={s.secondaryButton} onClick={again}>Book another</button>
          </div>
        </section>
      ) : (
        <div className={s.formGrid}>
          <form noValidate onSubmit={submit} className={`${s.form} ${s.surface} ${s.analyticsSurface}`}>
            <section className={s.formSection} aria-labelledby="session-details">
              <div className={s.formSectionHeading}><span className={s.sectionNumber}>01</span><h2 id="session-details">Session details</h2><span>All fields required</span></div>
              <div className={s.fields}>
                <div className={s.field}>
                  <label htmlFor="booking-session_id">Session</label>
                  <AdminSelect id="booking-session_id" label="Session" value={form.session_id} onChange={(v) => set('session_id', v)} placeholder="Choose a session"
                    options={sessions.map((x) => ({ value: x.id, label: `${x.title} · ${x.duration_minutes} min` }))} invalid={!!errors.session_id} describedBy={errors.session_id ? 'error-session_id' : undefined} />
                  <ErrorText field="session_id" />
                </div>
                <div className={s.field}>
                  <label htmlFor="booking-director_id">Host</label>
                  <Select value={form.director_id || undefined} onValueChange={(v) => set('director_id', v)}>
                    <SelectTrigger id="booking-director_id" aria-label="Host" aria-invalid={!!errors.director_id || undefined} className={s.select}><SelectValue placeholder="Choose a host" /></SelectTrigger>
                    <SelectContent position="popper" className={s.selectMenu}>
                      {hostGroups.map((g) => (
                        <SelectGroup key={g.key}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.items.map((h) => <SelectItem key={h.id} value={h.id} className={s.selectOption}>{h.name}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <ErrorText field="director_id" />
                </div>
                <div className={`${s.field} ${s.wideField}`}>
                  <label htmlFor="booking-timezone">Patient’s timezone</label>
                  <div className={s.timezoneField}><Globe2 size={19} /><AdminSelect id="booking-timezone" label="Patient’s timezone" value={form.timezone} onChange={(v) => set('timezone', v)} options={US_TIMEZONES.map((o) => ({ value: o.value, label: o.label }))} /></div>
                  <p>Set this to the patient’s zone — the date and time below use it.</p>
                </div>
                <div className={s.field}>
                  <label htmlFor="booking-date">Date</label>
                  <DatePickerField {...errorProps('date')} value={form.date} onChange={(v) => set('date', v)} today={todayYmd(form.timezone)} />
                  <ErrorText field="date" />
                </div>
                <div className={s.field}>
                  <label htmlFor="booking-time">Time</label>
                  <TimePickerField {...errorProps('time')} value={form.time} onChange={(v) => set('time', v)} />
                  <ErrorText field="time" />
                </div>
              </div>
            </section>

            <section className={s.formSection} aria-labelledby="patient-details">
              <div className={s.formSectionHeading}><span className={s.sectionNumber}>02</span><h2 id="patient-details">Patient details</h2></div>
              <div className={s.fields}>
                <div className={`${s.field} ${s.wideField}`}>
                  <label htmlFor="booking-patient-search">Find an existing patient <span>· optional</span></label>
                  <PatientPicker label={picked} onSelect={pickPatient} />
                  <p>Pick a Practice Better client to fill in their details, or enter a new patient below.</p>
                </div>
                <div className={s.field}>
                  <label htmlFor="booking-first_name">First name</label>
                  <input {...errorProps('first_name')} autoComplete="given-name" placeholder="First name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
                  <ErrorText field="first_name" />
                </div>
                <div className={s.field}>
                  <label htmlFor="booking-last_name">Last name <span>· optional</span></label>
                  <input id="booking-last_name" autoComplete="family-name" placeholder="Last name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
                </div>
                <div className={s.field}>
                  <label htmlFor="booking-email">Email address</label>
                  <input {...errorProps('email')} type="email" autoComplete="email" placeholder="patient@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
                  <ErrorText field="email" />
                </div>
                <div className={s.field}>
                  <label htmlFor="booking-phone">Phone <span>· optional</span></label>
                  <input id="booking-phone" type="tel" autoComplete="tel" placeholder="Phone number" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </div>
              </div>
            </section>

            <section className={s.formSection} aria-labelledby="confirmation-details">
              <div className={s.formSectionHeading}><span className={s.sectionNumber}>03</span><h2 id="confirmation-details">Confirmation &amp; notes</h2></div>
              <div className={s.notificationRow}>
                <div>
                  <label htmlFor="email-confirmation">Email a confirmation to the patient</label>
                  <p>Includes the session details and the Google Meet link.</p>
                </div>
                <Switch id="email-confirmation" checked={form.send_email} onCheckedChange={(v) => set('send_email', v)} className="data-[state=checked]:bg-[#3565e9]" />
              </div>
              <div className={s.field}>
                <label htmlFor="booking-notes">Notes <span>· optional</span></label>
                <textarea id="booking-notes" placeholder="An agenda or anything the host should know…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
              <p className={s.formHint}><CalendarDays size={14} />Notes go on the calendar event, which the patient is invited to — so they can see them.</p>
            </section>

            <div className={s.formActions}>
              <button type="button" className={s.secondaryButton} onClick={() => navigate('/admin/scheduling/bookings')} disabled={saving}>Cancel</button>
              <button type="submit" className={s.primaryButton} disabled={saving}>{saving ? 'Creating…' : 'Create booking'} <ArrowRight size={16} /></button>
            </div>
          </form>

          <aside className={s.bookingSummary} aria-label="Booking summary">
            <section className={`${s.surface} ${s.analyticsSurface} ${s.summaryCard}`}>
              <div className={s.summaryTitle}><CalendarDays size={19} /><h2>Booking summary</h2></div>
              <div className={s.summarySession}>
                <h3>{session?.title || 'Your new session'}</h3>
                <p><Clock3 size={14} />{session?.duration_minutes || 30} minutes · Google Meet</p>
              </div>
              <dl className={s.summaryList}>
                <div><UserRound size={17} /><div><dt>Host</dt><dd>{host?.name || 'Choose a host'}</dd></div></div>
                <div><CalendarDays size={17} /><div><dt>Date &amp; time</dt><dd>{slotIso ? `${fmtDate(slotIso, { tz: form.timezone })} · ${fmtTime(slotIso, { tz: form.timezone })}` : 'Choose a date and time'}</dd></div></div>
                <div><Globe2 size={17} /><div><dt>Timezone</dt><dd>{tzLabel(form.timezone)}</dd></div></div>
                <div><UserRound size={17} /><div><dt>Patient</dt><dd>{patientName || form.email.trim() || 'Add patient details'}</dd></div></div>
                <div><Mail size={17} /><div><dt>Email confirmation</dt><dd>{form.send_email ? 'Will be sent' : 'Not sent'}</dd></div></div>
              </dl>
            </section>
            <div className={s.afterCreate}>
              <h3>Creating it adds</h3>
              <ul>
                <li><Check size={14} />A calendar event for the host, with the patient invited</li>
                <li><Video size={14} />A unique Google Meet link</li>
                <li><Check size={14} />Practice Better sync, for directors</li>
              </ul>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
