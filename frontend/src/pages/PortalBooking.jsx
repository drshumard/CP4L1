import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  Clock, Globe, ArrowLeft, ArrowRight, CheckCircle2, CalendarPlus, LogOut, Home, RefreshCw, HelpCircle, Video, CalendarCheck,
} from 'lucide-react';
import {
  useAvailability, useBookSession, detectTimezone, getTodayString,
  isSlotValid, isSlotUnavailableError,
} from '../hooks/useBooking';
import ProtoSelect from './prototype/ProtoSelect';
import ProtoSpinner from './prototype/ProtoSpinner';
import useSortedTimezones from './admin/scheduling/useSortedTimezones';
import './prototype/proto.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';

// All timezone math is done by the browser's Intl engine (DST-correct) - no manual offsets.
const localDateInTz = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); // -> YYYY-MM-DD
const fmtFullDate = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtMonthYear = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dowShort = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' });
const dayNum = (ds) => new Date(ds + 'T12:00:00').getDate();
const fmtTime = (iso, tz) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const gcalUrl = (iso) => {
  const start = new Date(iso); const end = new Date(start.getTime() + 30 * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Strategy Session with Dr. Shumard')}&dates=${f(start)}/${f(end)}`;
};

export default function PortalBooking() {
  const navigate = useNavigate();
  const detected = useMemo(() => detectTimezone(), []);
  const today = useMemo(() => getTodayString(), []);

  const tzList = useSortedTimezones();
  const tzOptions = useMemo(() => {
    // All IANA zones (native Intl, offset-sorted), with the patient's own detected
    // zone surfaced at the top so they immediately recognize it.
    const all = tzList.map((o) => ({ v: o.value, l: o.label }));
    const mine = all.find((o) => o.v === detected);
    const myLabel = mine ? mine.l : detected.split('/').pop().replace(/_/g, ' ');
    const rest = all.filter((o) => o.v !== detected);
    return [{ v: detected, l: `${myLabel} (your timezone)` }, ...rest];
  }, [tzList, detected]);

  const [tz, setTz] = useState(detected);
  const [stage, setStage] = useState('date'); // date | time | details | confirmed
  const [redirecting, setRedirecting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [availDays, setAvailDays] = useState(null);

  // Prefill from the account. (Step gating lives in App.js's JourneyRoute — only step-1
  // users ever reach this page.)
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('access_token');
        const meRes = await axios.get(`${API}/user/me`, { headers: { Authorization: `Bearer ${token}` } });
        const u = meRes.data;
        const parts = (u.name || '').trim().split(' ');
        setForm((f) => ({
          ...f,
          firstName: u.first_name || parts[0] || '',
          lastName: u.last_name || parts.slice(1).join(' ') || '',
          email: u.email || '',
          phone: u.phone || '',
        }));
      } catch { /* best-effort */ }
    })();
  }, []);

  useEffect(() => {
    fetch(`${API}/settings/public`).then((r) => r.json()).then((d) => setAvailDays(d.availability_days || 14)).catch(() => setAvailDays(14));
  }, []);

  // After a successful booking: hold the confirmation ~5s, then show a brief "redirecting"
  // spinner and send the patient on to their health profile (step 2).
  useEffect(() => {
    if (stage !== 'confirmed') { setRedirecting(false); return undefined; }
    const toSpinner = setTimeout(() => setRedirecting(true), 5000);
    const toForms = setTimeout(() => navigate('/forms', { replace: true }), 6300);
    return () => { clearTimeout(toSpinner); clearTimeout(toForms); };
  }, [stage, navigate]);

  const shouldPoll = stage === 'date' || stage === 'time';
  const { data: availability, isLoading, error: availError, refetch } = useAvailability(today, 60, { enabled: true, refetchInterval: shouldPoll ? 60000 : false });
  const book = useBookSession();

  // Bucket slots into days of the SELECTED timezone (so a late slot lands on the right local day).
  const slotsByDate = useMemo(() => {
    if (!availability?.slots) return {};
    const grouped = {};
    for (const slot of availability.slots) {
      const d = localDateInTz(slot.start_time, tz);
      grouped[d] = grouped[d] || [];
      if (!grouped[d].some((s) => s.start_time === slot.start_time)) grouped[d].push(slot);
    }
    Object.keys(grouped).forEach((k) => grouped[k].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)));
    const allowed = new Set(Object.keys(grouped).sort().slice(0, availDays || 14));
    Object.keys(grouped).forEach((k) => { if (!allowed.has(k)) delete grouped[k]; });
    return grouped;
  }, [availability?.slots, tz, availDays]);

  const datesByMonth = useMemo(() => {
    const dates = Object.keys(slotsByDate).sort();
    return dates.reduce((acc, d) => { (acc[fmtMonthYear(d)] = acc[fmtMonthYear(d)] || []).push(d); return acc; }, {});
  }, [slotsByDate]);
  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] || []) : [];

  const changeTz = (v) => { setTz(v); setSelectedDate(null); setSelectedSlot(null); setBanner(null); setStage('date'); };
  const pickDate = (d) => { setSelectedDate(d); setSelectedSlot(null); setBanner(null); setStage('time'); };
  const pickTime = (slot) => {
    if (!isSlotValid(slot.start_time)) { setBanner({ type: 'error', msg: 'That time has passed - please pick another.' }); return; }
    setSelectedSlot(slot); setBanner(null); setStage('details');
  };
  const setField = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };

  const confirm = useCallback(async () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!form.email.trim()) e.email = 'Required'; else if (!isValidEmail(form.email)) e.email = 'Enter a valid email';
    setErrors(e);
    if (Object.keys(e).length || !selectedSlot || submitting) return;
    if (!isSlotValid(selectedSlot.start_time)) { setBanner({ type: 'expired', msg: 'That time was just taken.' }); return; }

    setSubmitting(true); setBanner(null);
    try {
      await book.mutateAsync({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        timezone: tz,
        slot_start_time: selectedSlot.start_time,
        consultant_id: selectedSlot.consultant_id,
        notes: form.notes.trim() || undefined,
      });
      setStage('confirmed');
    } catch (err) {
      if (isSlotUnavailableError(err)) {
        setBanner({ type: 'expired', msg: 'That time was just taken - please pick another.' });
        setStage('time'); refetch();
      } else {
        setBanner({ type: 'error', msg: err?.message || 'Something went wrong. Please try again.' });
      }
    } finally { setSubmitting(false); }
  }, [form, selectedSlot, submitting, tz, book, refetch]);

  const showTzPicker = stage === 'date' || stage === 'time';

  const tzShort = tz.split('/').pop().replace(/_/g, ' ');
  const asideFacts = (
    <div style={{ marginTop: 16, display: 'grid', gap: 11 }}>
      <AsideRow icon={Clock}>30 minutes, one-on-one</AsideRow>
      <AsideRow icon={Video}>Video call on Google Meet</AsideRow>
      <AsideRow icon={Globe}>Times shown in {tzShort}</AsideRow>
    </div>
  );

  return (
    <div className="proto proto-book">
      <header className="proto-topbar">
        <div className="proto-container" style={{ height: 62, display: 'flex', alignItems: 'center' }}>
          <img src={LOGO} alt="Dr. Shumard" style={{ height: 22 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="proto-btn proto-btn--ghost proto-help-sm" style={{ padding: '8px 12px' }} aria-label="Help"
              onClick={() => window.dispatchEvent(new Event('open-support'))}>
              <HelpCircle size={16} />
            </button>
            <button className="proto-btn proto-btn--ghost" style={{ padding: '8px 12px' }} aria-label="Home" onClick={() => navigate('/dashboard')}>
              <Home size={16} /> <span className="proto-hide-sm">Home</span>
            </button>
            <button className="proto-btn proto-btn--danger" style={{ padding: '8px 12px' }} aria-label="Log out"
              onClick={() => { localStorage.clear(); navigate('/login'); }}>
              <LogOut size={16} /> <span className="proto-hide-sm">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="proto-container proto-main">
        {stage !== 'confirmed' && (
        <div className="proto-book-shell">
        {/* Large-screen rail: what/when summary + timezone, sticky beside the picker. */}
        <aside className="proto-book-aside">
          <div className="proto-card proto-card--pad">
            <p className="proto-eyebrow">Step 1 of 3</p>
            <h1 style={{ marginTop: 6, fontSize: 'clamp(26px, 2.2vw, 32px)' }}>Book your consultation</h1>
            <p className="proto-soft" style={{ marginTop: 8, fontSize: 15.5, lineHeight: 1.5 }}>
              Pick a time for your 1:1 strategy session with Dr. Shumard's team.
            </p>
            {asideFacts}
            <div style={{ marginTop: 18 }}>
              <label className="proto-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={14} /> Time zone</label>
              <ProtoSelect ariaLabel="Timezone" value={tz} onChange={(v) => changeTz(v)}
                options={tzOptions.map((o) => ({ value: o.v, label: o.l }))} disabled={!showTzPicker} />
            </div>
            {(selectedDate || selectedSlot) && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--p-line)', display: 'grid', gap: 10 }}>
                <p className="proto-eyebrow" style={{ fontSize: 11 }}>Your selection</p>
                {selectedDate && <AsideRow icon={CalendarCheck}><strong>{fmtFullDate(selectedDate)}</strong></AsideRow>}
                {selectedSlot && <AsideRow icon={Clock}><strong>{fmtTime(selectedSlot.start_time, tz)}</strong>&nbsp;({tzShort})</AsideRow>}
              </div>
            )}
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
        {/* Compact header for phones/laptops (the rail replaces it on large screens). */}
        <div className="proto-book-headmob">
          <div style={{ minWidth: 260, flex: 1 }}>
            <p className="proto-eyebrow">Step 1 of 3</p>
            <h1 style={{ marginTop: 6 }}>Book your consultation</h1>
            <p className="proto-soft proto-book-sub" style={{ marginTop: 8 }}>Pick a time for your 1:1 strategy session - 30 minutes, on Google Meet.</p>
          </div>
          {showTzPicker && (
            <div style={{ minWidth: 230 }}>
              <label className="proto-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={14} /> Time zone</label>
              <ProtoSelect ariaLabel="Timezone" value={tz} onChange={(v) => changeTz(v)}
                options={tzOptions.map((o) => ({ value: o.v, label: o.l }))} />
            </div>
          )}
        </div>

        {banner && (
          <div className="proto-card proto-card--flat" style={{ padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f3c9d1', background: '#fdf2f4', color: '#a3344b' }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{banner.msg}</span>
            {banner.type === 'expired' && (
              <button className="proto-btn proto-btn--ghost" style={{ marginLeft: 'auto', color: '#a3344b' }} onClick={() => { setBanner(null); refetch(); setStage('time'); }}>
                <RefreshCw size={14} /> Pick another
              </button>
            )}
          </div>
        )}

        {(stage === 'date' || stage === 'time') && (isLoading || availDays === null ? (
          <div className="proto-card proto-card--pad" style={{ textAlign: 'center', color: 'var(--p-ink-soft)' }}>Finding available times...</div>
        ) : (availError && !availability?.slots) ? (
          <div className="proto-card proto-card--pad" style={{ textAlign: 'center' }}>
            <p className="proto-soft">We couldn't load available times.</p>
            <button className="proto-btn proto-btn--secondary" style={{ marginTop: 12 }} onClick={() => refetch()}>Try again</button>
          </div>
        ) : !Object.keys(slotsByDate).length ? (
          <div className="proto-card proto-card--pad" style={{ textAlign: 'center' }}>
            <p className="proto-soft">No times are open right now. Please check back soon.</p>
          </div>
        ) : (
          <>
            {/* DATE */}
            {stage === 'date' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="proto-card proto-card--pad">
                {Object.entries(datesByMonth).map(([my, dates]) => (
                  <div key={my} style={{ marginBottom: 22 }}>
                    <h3 style={{ marginBottom: 20 }}>{my}</h3>
                    <div className="proto-dategrid">
                      {dates.map((d) => (
                        <button key={d} className="proto-datetile" onClick={() => pickDate(d)}>
                          <span className="dow">{dowShort(d)}</span>
                          <span className="num">{dayNum(d)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* TIME */}
            {stage === 'time' && selectedDate && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="proto-card proto-card--pad">
                <button className="proto-btn proto-btn--ghost" style={{ marginBottom: 18, paddingLeft: 0 }} onClick={() => setStage('date')}><ArrowLeft size={16} /> Back</button>
                <h2>{fmtFullDate(selectedDate)}</h2>
                <p className="proto-soft proto-book-avail" style={{ marginTop: 4, marginBottom: 26 }}>{slotsForDate.length} time{slotsForDate.length === 1 ? '' : 's'} available</p>
                <div className="proto-timegrid">
                  {slotsForDate.map((slot, i) => (
                    <button key={`${slot.start_time}-${i}`} className="proto-chip" onClick={() => pickTime(slot)}>{fmtTime(slot.start_time, tz)}</button>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        ))}

        {/* DETAILS — outside the availability ternary, so a background availability
            refetch (or a transient fetch error) can never yank the form away mid-entry */}
        {stage === 'details' && selectedSlot && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="proto-card proto-card--pad">
                  <button className="proto-btn proto-btn--ghost" style={{ marginBottom: 12, paddingLeft: 0 }} onClick={() => setStage('time')}><ArrowLeft size={16} /> Back</button>
                  <div className="proto-card proto-card--flat" style={{ background: 'var(--brand-50)', border: '1px solid var(--p-line)', padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Clock size={18} style={{ color: 'var(--brand-600)' }} />
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{fmtFullDate(selectedDate)} · {fmtTime(selectedSlot.start_time, tz)}</span>
                    <span className="proto-muted" style={{ fontSize: 13.5 }}>{tz.split('/').pop().replace(/_/g, ' ')}</span>
                  </div>

                  <div style={{ display: 'grid', gap: 16 }}>
                    <div className="proto-form-row">
                      <Field label="First name" req error={errors.firstName}>
                        <input className="proto-input" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} />
                      </Field>
                      <Field label="Last name" req error={errors.lastName}>
                        <input className="proto-input" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} />
                      </Field>
                    </div>
                    <Field label="Email" req error={errors.email}>
                      <input className="proto-input" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                    </Field>
                    <Field label="Phone (optional)">
                      <input className="proto-input" type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="(555) 000-0000" />
                    </Field>
                    <Field label="Anything you'd like to discuss? (optional)">
                      <textarea className="proto-textarea" value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Share what's on your mind..." />
                    </Field>
                  </div>
                </div>

                <div className="proto-actionbar">
                  <button className="proto-btn proto-btn--primary proto-btn--lg proto-btn--block" onClick={confirm} disabled={submitting}>
                    {submitting ? 'Confirming...' : <>Confirm booking <ArrowRight size={18} /></>}
                  </button>
                </div>
              </motion.div>
        )}
        </div>
        </div>
        )}

        {/* CONFIRMED — standalone centered card, outside the two-pane shell */}
        {stage === 'confirmed' && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="proto-card proto-card--pad" style={{ textAlign: 'center', maxWidth: 560, margin: '8px auto' }}>
                <span style={{ width: 68, height: 68, borderRadius: 999, background: 'var(--brand-50)', color: 'var(--brand-600)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 size={36} />
                </span>
                <p className="proto-eyebrow">Confirmed</p>
                <h1 style={{ marginTop: 6 }}>You're all set{form.firstName ? `, ${form.firstName}` : ''}</h1>
                {selectedSlot && (
                  <p className="proto-soft" style={{ marginTop: 10, fontSize: 18 }}>
                    {fmtFullDate(selectedDate)} · {fmtTime(selectedSlot.start_time, tz)} <span className="proto-muted">({tz.split('/').pop().replace(/_/g, ' ')})</span>
                  </p>
                )}
                <p className="proto-muted" style={{ marginTop: 10, fontSize: 14.5 }}>Your confirmation and Google Meet link are on their way to your email.</p>
                {redirecting ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 28 }}>
                    <ProtoSpinner className="proto-spinner--redirect" />
                    <p className="proto-soft" style={{ fontSize: 15 }}>Redirecting to the next step…</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
                    {selectedSlot && (
                      <a className="proto-btn proto-btn--secondary" href={gcalUrl(selectedSlot.start_time)} target="_blank" rel="noreferrer"><CalendarPlus size={17} /> Add to calendar</a>
                    )}
                    <button className="proto-btn proto-btn--primary" onClick={() => navigate('/forms')}>Continue to your health profile <ArrowRight size={17} /></button>
                    <button className="proto-btn proto-btn--ghost" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
                  </div>
                )}
              </motion.div>
        )}
      </main>

      <style>{`
        .proto-form-row { display: grid; gap: 16px; grid-template-columns: 1fr; }
        .proto-hide-sm { display: none; }
        @media (min-width: 560px) { .proto-form-row { grid-template-columns: 1fr 1fr; } .proto-hide-sm { display: inline; } }
      `}</style>
    </div>
  );
}

function Field({ label, req, error, children }) {
  return (
    <div>
      <label className="proto-label">{label}{req && <span className="proto-req"> *</span>}</label>
      {children}
      {error && <p className="proto-hint" style={{ color: '#c0455c' }}>{error}</p>}
    </div>
  );
}

function AsideRow({ icon: Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon size={17} style={{ color: 'var(--brand-500)', flex: 'none' }} />
      <span className="proto-soft" style={{ fontSize: 14.5, minWidth: 0 }}>{children}</span>
    </div>
  );
}
