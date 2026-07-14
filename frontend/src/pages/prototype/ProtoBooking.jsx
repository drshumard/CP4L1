import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, ArrowLeft, Check, CheckCircle2, Video } from 'lucide-react';
import { MOCK } from './protoData';

/* ----------------------------------------------------------------------------
   Booking - schedule the 1:1 consultation (NON-PRODUCTION prototype).
   One smooth, mobile-first flow: date -> time -> details -> confirmed.
   ---------------------------------------------------------------------------- */

const TZ = MOCK.session.tz; // 'America/Los_Angeles'
const TZ_LABEL = 'Pacific Time (PT)';

// July 2026 - 1st is a Wednesday. Build a calendar grid with leading blanks.
const MONTH = { label: 'July 2026', firstDow: 3, days: 31 };
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Disable weekends + a few past/blocked days so the grid feels real.
const DISABLED = new Set([1, 4, 5, 11, 12, 18, 19, 25, 26]); // weekends + a couple
const TODAY_DAY = 1;

const TIME_SLOTS = ['9:00 AM', '9:30 AM', '10:00 AM', '11:30 AM', '1:00 PM', '2:30 PM'];

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: 'easeOut' },
};

function dowFor(day) {
  return DOW[(MONTH.firstDow + day - 1) % 7];
}
function longDate(day) {
  // July 2026, day -> "Tuesday, July 2"
  const d = new Date(2026, 6, day);
  return d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function shortDate(day) {
  const d = new Date(2026, 6, day);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ProtoBooking() {
  const [stage, setStage] = useState('date'); // date | time | details | confirmed
  const [day, setDay] = useState(2); // selected calendar day (July)
  const [slot, setSlot] = useState('10:00 AM');
  const [form, setForm] = useState({
    firstName: MOCK.user.firstName,
    lastName: MOCK.user.lastName,
    email: MOCK.user.email,
    phone: '',
    notes: '',
  });

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const stepNum = stage === 'confirmed' ? 3 : stage === 'details' ? 3 : stage === 'time' ? 2 : 1;

  return (
    <div>
      {/* ---------------- Header ---------------- */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="proto-eyebrow">STEP {stepNum} OF 3</p>
          <h2 className="mt-1">Book your consultation</h2>
          <p className="proto-soft mt-2" style={{ maxWidth: 520, fontSize: 15, lineHeight: 1.5 }}>
            Pick a time for your 1:1 with Dr. Jane Doe (30&nbsp;min, on Google&nbsp;Meet).
          </p>
        </div>
        <span
          className="proto-badge proto-badge--soft"
          style={{ flex: 'none', marginTop: 4 }}
          title={TZ}
        >
          <Clock size={13} strokeWidth={2.2} />
          {TZ_LABEL}
        </span>
      </div>

      {/* ---------------- Flow ---------------- */}
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {stage === 'date' && (
            <motion.div key="date" {...fade}>
              <DateTimeShell
                summary={<SummaryRail day={day} slot={null} />}
              >
                <DateStep
                  day={day}
                  onPick={(d) => {
                    setDay(d);
                    setStage('time');
                  }}
                />
              </DateTimeShell>
            </motion.div>
          )}

          {stage === 'time' && (
            <motion.div key="time" {...fade}>
              <DateTimeShell summary={<SummaryRail day={day} slot={null} />}>
                <TimeStep
                  day={day}
                  slot={slot}
                  onBack={() => setStage('date')}
                  onPick={(s) => {
                    setSlot(s);
                    setStage('details');
                  }}
                />
              </DateTimeShell>
            </motion.div>
          )}

          {stage === 'details' && (
            <motion.div key="details" {...fade}>
              <DetailsStep
                day={day}
                slot={slot}
                form={form}
                setField={setField}
                onBack={() => setStage('time')}
                onConfirm={() => setStage('confirmed')}
              />
            </motion.div>
          )}

          {stage === 'confirmed' && (
            <motion.div key="confirmed" {...fade}>
              <ConfirmedStep day={day} slot={slot} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ============================ shared layout ============================ */
// 2-col on desktop with a sticky summary rail; single column on mobile.
function DateTimeShell({ children, summary }) {
  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-7 lg:items-start">
      <div>{children}</div>
      <aside className="hidden lg:block lg:sticky" style={{ top: 84 }}>
        {summary}
      </aside>
    </div>
  );
}

function SummaryRail({ day, slot }) {
  return (
    <div className="proto-card proto-card--pad">
      <p className="proto-eyebrow">Your session</p>
      <h3 className="mt-2" style={{ lineHeight: 1.3 }}>
        {MOCK.session.title}
      </h3>

      <hr className="proto-divider my-4" />

      <ul className="grid gap-3" style={{ fontSize: 14 }}>
        <li className="flex items-center gap-3">
          <Clock size={16} className="proto-brand" style={{ flex: 'none' }} />
          <span className="proto-soft">30 minutes</span>
        </li>
        <li className="flex items-center gap-3">
          <Video size={16} className="proto-brand" style={{ flex: 'none' }} />
          <span className="proto-soft">Google Meet (link emailed)</span>
        </li>
        <li className="flex items-center gap-3">
          <Calendar size={16} className="proto-brand" style={{ flex: 'none' }} />
          <span className="proto-soft">
            {day ? longDate(day) : 'Select a date'}
            {slot ? ` · ${slot} PT` : ''}
          </span>
        </li>
      </ul>

      <hr className="proto-divider my-4" />

      <div className="flex items-center gap-3">
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: 'var(--brand-100)',
            color: 'var(--brand-800)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 13,
            flex: 'none',
          }}
        >
          JD
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14 }}>{MOCK.session.director}</p>
          <p className="proto-muted" style={{ fontSize: 12.5 }}>
            Program Director
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================ STAGE: date ============================ */
function DateStep({ day, onPick }) {
  const cells = [];
  for (let i = 0; i < MONTH.firstDow; i++) cells.push(null);
  for (let d = 1; d <= MONTH.days; d++) cells.push(d);

  return (
    <div className="proto-card proto-card--pad">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2">
          <Calendar size={18} className="proto-brand" />
          {MONTH.label}
        </h3>
        <span className="proto-muted" style={{ fontSize: 13 }}>
          {TZ_LABEL}
        </span>
      </div>

      {/* day-of-week header */}
      <div className="grid grid-cols-7 mt-5" style={{ gap: 8 }}>
        {DOW.map((d, i) => (
          <div
            key={i}
            className="proto-muted text-center"
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* date grid */}
      <div className="grid grid-cols-7 mt-2" style={{ gap: 8 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} aria-hidden />;
          const disabled = DISABLED.has(d);
          const active = d === day;
          const isToday = d === TODAY_DAY;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => onPick(d)}
              className={`proto-datetile ${active ? 'proto-datetile--active' : ''}`}
              style={{
                position: 'relative',
                opacity: disabled ? 0.38 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                padding: '9px 0',
              }}
            >
              <span className="dow">{dowFor(d)}</span>
              <span className="num">{d}</span>
              {isToday && (
                <span
                  className="proto-badge proto-badge--ok"
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -4,
                    padding: '2px 7px',
                    fontSize: 9.5,
                    transform: 'scale(.92)',
                  }}
                >
                  Today
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="proto-hint mt-4 flex items-center gap-2">
        <span className="proto-dot" style={{ background: 'var(--brand-400)' }} />
        Faded dates are fully booked or unavailable.
      </p>
    </div>
  );
}

/* ============================ STAGE: time ============================ */
function TimeStep({ day, slot, onBack, onPick }) {
  return (
    <div className="proto-card proto-card--pad">
      <button type="button" className="proto-btn proto-btn--ghost" onClick={onBack} style={{ marginLeft: -10 }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-end justify-between gap-3 mt-3">
        <div>
          <p className="proto-eyebrow">Choose a time</p>
          <h3 className="mt-1">{longDate(day)}</h3>
        </div>
        <span className="proto-badge proto-badge--brand" style={{ flex: 'none' }}>
          6 available
        </span>
      </div>

      <p className="proto-hint mt-2 flex items-center gap-1.5">
        <Clock size={13} /> Times shown in {TZ_LABEL}
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-4 mt-5" style={{ gap: 10 }}>
        {TIME_SLOTS.map((t) => {
          const active = t === slot;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className={`proto-chip ${active ? 'proto-chip--active' : ''}`}
              style={{ padding: '13px 8px' }}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ STAGE: details ============================ */
function DetailsStep({ day, slot, form, setField, onBack, onConfirm }) {
  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-7 lg:items-start">
      <div>
        <button type="button" className="proto-btn proto-btn--ghost" onClick={onBack} style={{ marginLeft: -10 }}>
          <ArrowLeft size={16} /> Back
        </button>

        {/* selected-time summary */}
        <div className="proto-card proto-card--flat mt-3" style={{ background: 'var(--brand-50)', borderColor: 'var(--brand-100)' }}>
          <div className="flex items-center gap-3" style={{ padding: '14px 16px' }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--brand-600)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
              }}
            >
              <Calendar size={18} />
            </span>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>
                {shortDate(day)} · {slot} PT
              </p>
              <p className="proto-soft" style={{ fontSize: 13 }}>
                30 min with {MOCK.session.director} · Google Meet
              </p>
            </div>
          </div>
        </div>

        {/* form */}
        <div className="proto-card proto-card--pad mt-4">
          <h3>Your details</h3>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="proto-label">
                First name <span className="proto-req">*</span>
              </label>
              <input className="proto-input" value={form.firstName} onChange={setField('firstName')} />
            </div>
            <div>
              <label className="proto-label">
                Last name <span className="proto-req">*</span>
              </label>
              <input className="proto-input" value={form.lastName} onChange={setField('lastName')} />
            </div>
            <div className="sm:col-span-2">
              <label className="proto-label">
                Email <span className="proto-req">*</span>
              </label>
              <input className="proto-input" type="email" value={form.email} onChange={setField('email')} />
              <p className="proto-hint">Your Google Meet link and reminders go here.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="proto-label">Phone (optional)</label>
              <input
                className="proto-input"
                type="tel"
                placeholder="(555) 123-4567"
                value={form.phone}
                onChange={setField('phone')}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="proto-label">What would you like to discuss?</label>
              <textarea
                className="proto-textarea"
                placeholder="Share goals, questions, or anything you'd like Dr. Doe to know ahead of your session."
                value={form.notes}
                onChange={setField('notes')}
              />
            </div>
          </div>
        </div>

        {/* sticky confirm (mobile) */}
        <div className="proto-actionbar lg:static">
          <button type="button" className="proto-btn proto-btn--primary proto-btn--lg proto-btn--block" onClick={onConfirm}>
            <Check size={18} /> Confirm booking
          </button>
        </div>
      </div>

      {/* desktop summary rail */}
      <aside className="hidden lg:block lg:sticky" style={{ top: 84 }}>
        <SummaryRail day={day} slot={slot} />
      </aside>
    </div>
  );
}

/* ============================ STAGE: confirmed ============================ */
function ConfirmedStep({ day, slot }) {
  return (
    <div className="mx-auto" style={{ maxWidth: 560 }}>
      <div className="proto-card proto-card--pad text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          style={{
            width: 72,
            height: 72,
            borderRadius: 999,
            background: '#e7f6ee',
            display: 'grid',
            placeItems: 'center',
            margin: '4px auto 0',
          }}
        >
          <CheckCircle2 size={40} strokeWidth={2.2} style={{ color: '#157a4b' }} />
        </motion.div>

        <h2 className="mt-5">You're all set, {MOCK.user.firstName}</h2>
        <p className="proto-soft mt-2" style={{ fontSize: 15 }}>
          Your consultation is booked. We've sent a confirmation to your email.
        </p>

        {/* appointment card */}
        <div
          className="proto-card proto-card--flat text-left mt-6"
          style={{ background: 'var(--brand-50)', borderColor: 'var(--brand-100)', padding: '18px 18px' }}
        >
          <p className="proto-eyebrow">{MOCK.session.title}</p>
          <div className="grid gap-3 mt-3" style={{ fontSize: 14.5 }}>
            <div className="flex items-center gap-3">
              <Calendar size={17} className="proto-brand" style={{ flex: 'none' }} />
              <span style={{ fontWeight: 600 }}>{longDate(day)}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock size={17} className="proto-brand" style={{ flex: 'none' }} />
              <span style={{ fontWeight: 600 }}>{slot} PT · 30 minutes</span>
            </div>
            <div className="flex items-center gap-3">
              <Video size={17} className="proto-brand" style={{ flex: 'none' }} />
              <span style={{ fontWeight: 600 }}>{MOCK.session.director} · Google Meet</span>
            </div>
          </div>
        </div>

        <p className="proto-hint mt-3 flex items-center justify-center gap-1.5">
          <Video size={13} /> Your join link will be emailed before the session.
        </p>

        {/* actions */}
        <div className="grid gap-3 mt-6">
          <a href="#" className="proto-btn proto-btn--secondary proto-btn--block">
            <Calendar size={17} /> Add to calendar
          </a>
          <a href="#" className="proto-btn proto-btn--primary proto-btn--lg proto-btn--block">
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
